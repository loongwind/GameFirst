import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const json = path => JSON.parse(read(path));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
// Provenance hashes are text-normalized so a checkout's CRLF/LF choice cannot break them.
const shaText = path => sha(Buffer.from(read(path).toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'), 'utf8'));
const manifest = () => json('game/sea-assets.json');
// Parse the production CSV, including quoted commas/newlines and its UTF-8 BOM.
function csv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (c === ',' || c === '\n')) { row.push(cell.replace(/\r$/, '')); cell = ''; if (c === '\n') { rows.push(row); row = []; } }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const header = rows.shift(); header[0] = header[0].replace(/^\uFEFF/, '');
  return rows.map(values => Object.fromEntries(header.map((key, i) => [key, values[i]])));
}
const sourceRows = () => csv(read('output/game-assets/v1/asset-index-final.csv').toString('utf8'));
async function art() {
  const code = ts.transpileModule(read('game/assets/scripts/ui/SeaArt.ts').toString(), { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('every sea import is traceable to the genuine production index and bounded PNG', () => {
  const m = manifest(), index = new Map(sourceRows().map(row => [row.id, row]));
  assert.equal(m.sourceIndexSha256, shaText(m.sourceIndex));
  assert.equal(m.sourceRigsSha256, shaText(m.sourceRigs));
  assert.equal(m.assets.length, 85); // 12 scenes + 64 idle/swim + 8 boss parts + hero.
  const paths = new Set();
  for (const a of m.assets) {
    const original = index.get(a.key); assert.ok(original, a.key);
    assert.equal(a.sourcePath, `output/game-assets/v1/${original.path}`);
    assert.equal(a.sourceSha256, original.sha256);
    assert.equal(sha(read(a.sourcePath)), original.sha256, `source art changed: ${a.key}`);
    const png = read(a.importPath);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), a.width); assert.equal(png.readUInt32BE(20), a.height);
    assert.equal(png.length, a.bytes); assert.equal(sha(png), a.importSha256);
    assert.ok(a.width > 0 && a.width <= 2048 && a.height > 0 && a.height <= 2048);
    assert.ok(!paths.has(a.importPath)); paths.add(a.importPath);
    const meta = json(`${a.importPath}.meta`), frame = meta.subMetas.f9941.userData;
    assert.equal(frame.rawWidth, a.width); assert.equal(frame.rawHeight, a.height);
    assert.equal(frame.width, a.width); assert.equal(frame.height, a.height);
    assert.equal(frame.trimType, 'none'); assert.equal(frame.packable, false);
    assert.equal(frame.trimX, 0); assert.equal(frame.trimY, 0);
    assert.equal(meta.userData.redirect, `${meta.uuid}@6c48a`);
    assert.match(meta.uuid, /^[\da-f-]{36}$/);
  }
});

test('36 source identities retain their layer, idle fallback, and four exact 6fps frames', async () => {
  const m = manifest(), cfg = await art(), assets = new Map(m.assets.map(a => [a.key, a]));
  const identities = sourceRows().filter(r => /^enemy_(normal|elite|boss)_\d+_/.test(r.id) && !/_(swim|tentacle)$/.test(r.id));
  assert.equal(identities.length, 36); assert.equal(Object.keys(m.identities).length, 36);
  assert.deepEqual(cfg.SEA_IDENTITIES, m.identities);
  assert.deepEqual(cfg.SEA_ART, Object.fromEntries(m.assets.map(a => [a.key, {
    bundle: a.bundle, path: a.loadPath, width: a.width, height: a.height, kind: a.kind,
    ...(a.frames ? { frames: a.frames, fps: a.fps } : {}),
  }])));
  for (const row of identities) {
    const identity = m.identities[row.id]; assert.equal(identity.layer, row['资源包']);
    assert.equal(identity.idle, row.id); assert.equal(assets.get(identity.idle).bundle, identity.layer);
    if (identity.kind === 'boss') { assert.ok(assets.has(identity.part)); continue; }
    assert.equal(identity.swim, `${row.id}_swim`);
    const swim = assets.get(identity.swim); assert.equal(swim.width, swim.height * 4); assert.equal(swim.fps, 6);
    assert.deepEqual(swim.frames, [0, 1, 2, 3].map(i => [i * swim.height, 0, swim.height, swim.height]));
    assert.equal(assets.get(identity.idle).height, swim.height);
  }
  assert.equal(cfg.PLAYER_ART, 'hero_ship'); assert.equal(cfg.SEA_ART.hero_ship.bundle, 'dive');
  for (const layer of ['sunlight', 'twilight', 'abyss']) {
    assert.deepEqual(cfg.SEA_SCENES[layer], { far: `bg_${layer}`, left: `reef_${layer}_left`, right: `reef_${layer}_right`, flora: `flora_${layer}` });
  }
});

test('boss composition preserves r9 full-canvas socket, anchor, scale, and every angle', async () => {
  const source = json('output/game-assets/v1/boss-rigs-r9.json'), m = manifest(), cfg = await art();
  assert.equal(Object.keys(cfg.BOSS_RIGS).length, 4);
  for (const rig of source.rigs) {
    const imported = cfg.BOSS_RIGS[rig.id]; assert.ok(imported);
    assert.equal(imported.bodyKey, rig.id); assert.equal(imported.sourceBodySize, 768); assert.equal(imported.sourcePartSize, 512);
    assert.equal(m.assets.find(a => a.key === imported.bodyKey).sourcePath, `output/game-assets/v1/${rig.body}`);
    assert.equal(m.assets.find(a => a.key === imported.partKey).sourcePath, `output/game-assets/v1/${rig.part}`);
    assert.deepEqual(imported.socket, rig.cocos_node_position_from_body_center);
    assert.deepEqual(imported.anchor, rig.part_anchor_bottom_left); assert.equal(imported.scale, rig.part_scale);
    assert.deepEqual(imported.angles, rig.part_instances_angles_deg); assert.deepEqual(imported.swing, rig.preview_swing_degrees);
  }
});

test('download and decoded RGBA accounting includes every content texture and enforces per-layer limits', () => {
  const m = manifest();
  for (const [bundle, totals] of Object.entries(m.bundles)) {
    const assets = m.assets.filter(a => a.bundle === bundle);
    assert.equal(totals.pngBytes, assets.reduce((n, a) => n + a.bytes, 0));
    assert.equal(totals.rgbaBytes, assets.reduce((n, a) => n + a.width * a.height * 4, 0));
    assert.equal(totals.pngBytes <= totals.downloadBudgetBytes, true, `${bundle}: ${totals.pngBytes}`);
    assert.equal(totals.rgbaBytes <= totals.textureBudgetBytes, true, `${bundle} decoded textures`);
    const actual = readdirSync(new URL(`game/assets/bundles/${bundle}/content/`, root)).filter(name => name.endsWith('.png')).sort();
    assert.deepEqual(actual, assets.map(a => a.importPath.split('/').at(-1)).sort());
    const bundleMeta = json(`game/assets/bundles/${bundle}.meta`);
    assert.equal(bundleMeta.userData.isBundle, true); assert.equal(bundleMeta.userData.bundleName, bundle);
  }
  assert.equal(m.bundles.sunlight.downloadBudgetBytes, 2 * 1024 * 1024);
  assert.equal(m.bundles.twilight.downloadBudgetBytes, 4 * 1024 * 1024);
  assert.equal(m.bundles.abyss.downloadBudgetBytes, 4 * 1024 * 1024);
});
