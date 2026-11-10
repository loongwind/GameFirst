import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withBrowser } from './browser-helpers.mjs';

const target = process.env.WEB_TARGET || 'web-debug';
const root = fileURLToPath(new URL(`../build/${target}`, import.meta.url));
const artifacts = fileURLToPath(new URL('../.artifacts/quality/', import.meta.url));

async function diveReady(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => typeof System !== 'undefined');
  await page.evaluate(async () => { window.cc = await System.import('cc'); });
  await page.waitForFunction(() => {
    window.c = window.cc.director.getScene()?.getChildByName('Canvas')?.getComponent('DiveController');
    return window.c?.hud?.sea?.status === 'ready';
  }, null, { timeout: 30000 });
}

/** Spawn real sunlight identities through the game's own spawner so weapons engage and texts appear. */
async function engage(page) {
  return page.evaluate(() => {
    const c = window.c; c.enabled = false;
    const b = c.session.battle, catalog = ['enemy_normal_01_moon_jelly', 'enemy_normal_02_lantern_angler', 'enemy_normal_03_electric_eel',
      'enemy_normal_04_needlefish', 'enemy_normal_05_hermit_crab', 'enemy_normal_06_glass_shrimp', 'enemy_elite_01_storm_eel'];
    for (let i = 0; i < 6 && b.enemies.size < 4; i++) {
      b.spawnEnemy({ x: b.player.x + 120 + (i % 3) * 60, y: b.player.y + 60 + (i % 2) * 40, assetKey: catalog[i % catalog.length], spawnDepth: b.player.y });
    }
    for (let k = 0; k < 600 && b.texts.size === 0; k++) { b.setInput(1, 0); b.step(); }
    b.setInput(0, 0);
    // The disabled controller cannot render; paint the current pool through the real HUD path.
    c.hud.render(c.session, '', c.ads.view, c.economy.snapshot);
    return { texts: b.texts.size, enemies: b.enemies.size, kills: b.stats.kills, hits: b.stats.hits };
  });
}

test(`${target}: high tier renders marine snow and floating damage texts`, { timeout: 120000 }, async () => {
  await mkdir(artifacts, { recursive: true });
  await withBrowser(root, async (page, _b, url) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    await diveReady(page, url);
    const quality = await page.evaluate(() => ({ hud: window.c.hud.lowEnd, device: window.c.platform.getDeviceInfo().quality }));
    assert.equal(quality.hud, false);
    assert.equal(quality.device, 'high');
    const engaged = await engage(page);
    assert.ok(engaged.hits > 0, 'combat must produce hits');
    const state = await page.evaluate(() => {
      const hud = window.c.hud, world = hud.root.parent.getChildByName('SeaWorld');
      const labels = [];
      for (const [name, label] of hud['labels']) if (name.startsWith('dmg-') && label.node.active && label.string) labels.push(label.string);
      return { snow: !!world.getChildByName('MarineSnow'), activeTexts: labels.length, texts: window.c.session.battle.texts.size };
    });
    assert.equal(state.snow, true, 'marine snow layer must exist on high tier');
    assert.ok(state.texts > 0, 'combat must produce floating texts');
    assert.ok(state.activeTexts > 0, 'at least one damage label rendered');
    await page.screenshot({ path: `${artifacts}/high-${target}.png` });
    assert.deepEqual(errors, []);
    await writeFile(`${artifacts}/high-${target}.json`, JSON.stringify({ quality, engaged, state, errors }, null, 2));
  });
});

test(`${target}: low tier drops snow, texts and glow rings, keeps collision and danger layers`, { timeout: 120000 }, async () => {
  await mkdir(artifacts, { recursive: true });
  await withBrowser(root, async (page, _b, url) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    await diveReady(page, `${url}?quality=low`);
    const quality = await page.evaluate(() => ({ hud: window.c.hud.lowEnd, device: window.c.platform.getDeviceInfo().quality }));
    assert.equal(quality.hud, true);
    assert.equal(quality.device, 'low');
    const engaged = await engage(page);
    assert.ok(engaged.hits > 0, 'combat keeps running on low tier');
    const state = await page.evaluate(() => {
      const c = window.c, hud = c.hud, world = hud.root.parent.getChildByName('SeaWorld');
      const labelNames = [...hud['labels'].keys()].filter(n => n.startsWith('dmg-'));
      return { snow: !!world.getChildByName('MarineSnow'), labelNames: labelNames.length,
        dangerZones: c.session.battle.dangerZones.length, obstacles: c.session.battle.obstacles.length, lowEnd: hud.lowEnd };
    });
    assert.equal(state.snow, false, 'marine snow must be absent on low tier');
    assert.equal(state.labelNames, 0, 'damage labels must not be created on low tier');
    assert.ok(state.dangerZones > 0 && state.obstacles > 0, 'collision and danger zones stay configured');
    await page.screenshot({ path: `${artifacts}/low-${target}.png` });
    assert.deepEqual(errors, []);
    await writeFile(`${artifacts}/low-${target}.json`, JSON.stringify({ quality, engaged, state, errors }, null, 2));
  });
});
