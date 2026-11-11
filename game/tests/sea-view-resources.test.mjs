import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function compile(name, imports = {}) {
  const source = readFileSync(new URL(`../assets/scripts/ui/${name}.ts`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    assert.ok(name in imports, `Unexpected dependency ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function fixture() {
  const art = compile('SeaArt'), lease = compile('SeaBundleLease'), legacy = compile('legacyEnemyArt');
  const pending = [], bundles = new Map();
  class Frame {
    constructor(name = '') { this.name = name; this.refCount = 0; this.isValid = true; this.texture = {}; }
    addRef() { assert.ok(this.isValid, `${this.name}: retained a destroyed frame`); this.refCount++; return this; }
    decRef() { assert.ok(this.refCount > 0, `${this.name}: unbalanced release`); if (--this.refCount === 0) this.isValid = false; return this; }
    reset({ texture }) { this.texture = texture; }
  }
  const assetManager = {
    loadBundle(name, complete) {
      if (!bundles.has(name)) {
        const frames = Object.values(art.SEA_ART).filter(spec => spec.bundle === name).map(spec => new Frame(spec.path.split('/').at(-1)));
        bundles.set(name, {
          frames, destroyed: false, unusedReleases: 0,
          loadDir(path, type, done) { pending.push({ name, frames, done }); },
          releaseUnusedAssets() { this.unusedReleases++; for (const frame of frames) if (!frame.refCount) frame.isValid = false; },
          // Cocos releaseAll force-releases cached assets, even if another owner addRef'd them.
          releaseAll() { for (const frame of frames) frame.isValid = false; },
        });
      }
      complete(null, bundles.get(name));
    },
    removeBundle(bundle) { bundle.destroyed = true; bundles.delete([...bundles].find(([, value]) => value === bundle)?.[0]); },
  };
  const cc = { assetManager, SpriteFrame: Frame, Rect: class {}, Size: class {}, Vec2: class {} };
  const { SeaWorldView } = compile('SeaWorldView', { cc, './SeaBundleLease': lease, './SeaArt': art, './legacyEnemyArt': legacy, '../battle/SeaContent': { layerAtDepth: () => 'abyss' } });
  const owner = () => {
    // Test the real loader/releaser without instantiating Cocos's scene graph.
    const view = Object.create(SeaWorldView.prototype);
    return new lease.SeaBundleLease(name => view.load(name), loaded => view.release(loaded));
  };
  return { owner, pending, bundles, SeaWorldView, art, legacy };
}

test('legacy enemies render with genuine current-sea art without changing saved combat data', () => {
  const f = fixture(), view = Object.create(f.SeaWorldView.prototype);
  const loaded = { frames: new Map(), sequences: new Map() };
  Object.assign(view, { current: 'twilight', sceneLayer: 'twilight', sceneArt: loaded, height: 812,
    actors: new Map(), prepare() {}, leases: { get: layer => layer === 'twilight' ? loaded : undefined },
    player: { node: { setPosition() {}, setScale() {} } },
    actor(key) { return { key, node: { setPosition() {}, destroy() {} }, sprite: {}, parts: [] }; },
  });
  // Old saves have no content identity; normalization supplies an empty key and retains combat values.
  const enemy = { id: 7, assetKey: '', kind: 'normal', layer: 'sunlight', x: 0, y: 900,
    hp: 23, maxHp: 50, attack: 8, speed: 30, spawnDepth: 0 };
  const before = JSON.stringify(enemy);
  const session = { depth: 900, battle: { tick: 0, player: { x: 0, y: 900 }, enemies: { values: () => [enemy] } } };
  view.render(session);
  const actor = view.actors.get(enemy.id);
  assert.ok(actor?.node.active, 'legacy enemy must have a visible actor');
  assert.equal(f.art.SEA_IDENTITIES[actor.key].layer, 'twilight');
  assert.equal(f.art.SEA_IDENTITIES[actor.key].kind, 'normal');
  assert.equal(JSON.stringify(enemy), before, 'presentation must preserve legacy stats and content state');
  assert.equal(f.legacy.enemyArtKey(enemy, 'twilight', f.art.SEA_IDENTITIES), actor.key);
  for (const kind of ['normal', 'elite', 'boss']) {
    const key = f.legacy.enemyArtKey({ ...enemy, kind }, 'abyss', f.art.SEA_IDENTITIES);
    assert.equal(f.art.SEA_IDENTITIES[key].layer, 'abyss');
    assert.equal(f.art.SEA_IDENTITIES[key].kind, kind);
  }
  const explicit = 'enemy_normal_01_moon_jelly';
  assert.equal(f.legacy.enemyArtKey({ ...enemy, assetKey: explicit }, 'twilight', f.art.SEA_IDENTITIES), explicit);
});

test('releasing one sea view preserves globally shared frames held by another view', async () => {
  const f = fixture(), first = f.owner(), second = f.owner();
  first.select('abyss'); second.select('abyss'); await flush();
  assert.equal(f.pending.length, 2);
  f.pending.forEach(request => request.done(null, request.frames)); await flush();
  const bundle = f.bundles.get('abyss'), live = second.get('abyss');
  assert.ok(live); assert.equal(first.get('abyss').bundle, live.bundle);
  first.dispose();
  assert.equal(bundle.destroyed, false, 'bundle metadata must remain available to the live owner');
  for (const frame of live.frames.values()) { assert.equal(frame.isValid, true); assert.equal(frame.refCount, 1); }
  for (const frames of live.sequences.values()) for (const frame of frames) assert.equal(frame.isValid, true);
  second.dispose();
  for (const frame of bundle.frames) assert.equal(frame.refCount, 0);
});

test('late completion of an abandoned dive cannot invalidate a rapid revisit of the same bundle', async () => {
  const f = fixture(), abandoned = f.owner(), revisit = f.owner();
  abandoned.select('abyss'); await flush(); abandoned.dispose();
  revisit.select('abyss'); await flush();
  f.pending[1].done(null, f.pending[1].frames); await flush();
  const live = revisit.get('abyss'); assert.ok(live);
  f.pending[0].done(null, f.pending[0].frames); await flush();
  assert.equal(live.bundle.destroyed, false);
  for (const frame of live.frames.values()) { assert.equal(frame.isValid, true); assert.equal(frame.refCount, 1); }
  assert.equal(revisit.state('abyss'), 'ready');
  revisit.dispose();
  for (const frame of f.pending[1].frames) assert.equal(frame.refCount, 0);
});

test('a failed directory load releases cached orphans while preserving another view’s live frames', async () => {
  const f = fixture(), liveOwner = f.owner(), failedOwner = f.owner();
  liveOwner.select('abyss'); await flush();
  f.pending[0].done(null, f.pending[0].frames); await flush();
  const bundle = f.bundles.get('abyss'), orphan = new (bundle.frames[0].constructor)('partial-load-orphan');
  bundle.frames.push(orphan);
  failedOwner.select('abyss'); await flush();
  f.pending[1].done(new Error('one texture failed'), bundle.frames); await flush();
  assert.equal(failedOwner.state('abyss'), 'error');
  assert.equal(bundle.unusedReleases, 1);
  assert.equal(orphan.isValid, false, 'partially loaded assets must not survive a failed view');
  for (const frame of liveOwner.get('abyss').frames.values()) { assert.equal(frame.isValid, true); assert.equal(frame.refCount, 1); }
  failedOwner.dispose(); liveOwner.dispose();
});
