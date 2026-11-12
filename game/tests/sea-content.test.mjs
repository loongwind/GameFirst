import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadBattle } from './battle-loader.mjs';

const api = loadBattle();
const values = pool => [...pool.values()];
const step = (s, n = 1) => { for (let i = 0; i < n; i++) s.advance(1 / 30); };
const make = options => new api.DiveSession({ diveId: 'content-test', oxygenCapacity: 10000, ...options });

test('catalog covers source asset identities and assigns all three layers at boundary depths', () => {
  assert.ok(Array.isArray(api.ENEMY_CATALOG), 'catalog is exported');
  assert.equal(api.ENEMY_CATALOG.length, 36);
  assert.equal(new Set(api.ENEMY_CATALOG.map(e => e.assetKey)).size, 36);
  const source = readFileSync(new URL('../../output/game-assets/v1/asset-index-final.csv', import.meta.url), 'utf8');
  for (const enemy of api.ENEMY_CATALOG) {
    assert.ok(source.includes(`${enemy.layer}/${enemy.assetKey}_idle.png`));
    assert.equal(api.enemyByKey(enemy.assetKey), enemy);
  }
  for (const layer of ['sunlight', 'twilight', 'abyss']) {
    assert.equal(api.ENEMY_CATALOG.filter(e => e.layer === layer && e.kind === 'normal').length, 8);
  }
  assert.deepEqual([0, 799.9, 800, 1599.9, 1600, 2400].map(api.layerAtDepth), ['sunlight', 'sunlight', 'twilight', 'twilight', 'abyss', 'abyss']);
});

test('content spawn uses depth-band strength and per-enemy contact attack; final depth stays band24', () => {
  const s = make({ battle: { weapons: [] } });
  s.battle.player.y = 200; step(s);
  let e = values(s.battle.enemies).find(e => e.kind === 'normal');
  assert.ok(e?.assetKey); const bandAttack = 8 * Math.pow(api.ENEMY_TUNING.attackGrowth, 2) * api.SUNLIGHT_TUNING.attack; // band-2 contact, table-derived
  assert.ok(Math.abs(e.maxHp - 69.62) < 1e-8);
  assert.ok(Math.abs(e.attack - bandAttack) < 1e-8); assert.equal(e.spawnDepth, 200);
  e.x = s.battle.player.x; e.y = s.depth; e.speed = 0;
  const hp = s.battle.player.hp; step(s);
  assert.ok(Math.abs(s.battle.player.hp - (hp - bandAttack)) < 1e-8);
  const b = new api.Battle({ content: true, weapons: [] });
  const final = b.spawnEnemy({ x: 0, y: 2400, assetKey: 'enemy_normal_24_glass_sponge' });
  assert.ok(Math.abs(final.maxHp - 2250.3816215908837) < 1e-6);
  const elite = b.spawnEnemy({ x: 0, y: 0, assetKey: 'enemy_elite_01_storm_eel' });
  const boss = b.spawnEnemy({ x: 0, y: 0, assetKey: 'enemy_boss_01_angler_king' });
  assert.equal(elite.maxHp, 400 * api.SUNLIGHT_TUNING.eliteHp); assert.equal(elite.attack, 20 * api.SUNLIGHT_TUNING.attack);
  assert.equal(boss.maxHp, 2000 * api.SUNLIGHT_TUNING.bossHp); assert.equal(boss.attack, 32 * api.SUNLIGHT_TUNING.bossAttack);
});

test('boss gates block descent, unlock once and preserve boss identity and rewards across restore', () => {
  const s = make({ battle: { weapons: [{ kind: 'arc', damage: 1e9, cooldownTicks: 1, range: 1000, maxJumps: 80 }] } });
  s.battle.weapons[0].nextFireTick = 1000;
  s.battle.player.y = 799; s.setInput(0, 1); step(s, 3);
  assert.equal(s.depth, 800);
  const boss = values(s.battle.enemies).find(e => e.kind === 'boss');
  assert.equal(boss.assetKey, 'enemy_boss_01_angler_king');
  const saved = s.checkpoint(); const restored = api.DiveSession.restore(saved); restored.advance(3);
  assert.equal(values(restored.battle.enemies).find(e => e.kind === 'boss').assetKey, boss.assetKey);
  restored.battle.weapons[0].nextFireTick = 1; step(restored);
  assert.deepEqual(restored.content.defeatedBosses, ['enemy_boss_01_angler_king']);
  assert.deepEqual(restored.content.openRifts, ['sunlight']);
  assert.equal(restored.snapshot.cargo.pearl, 2); assert.equal(restored.snapshot.cargo.core, 1);
  restored.setInput(0, 1); step(restored); assert.ok(restored.depth > 800);
  const again = api.DiveSession.restore(restored.checkpoint()); again.advance(3);
  again.battle.player.y = 799; step(again, 30);
  assert.equal(values(again.battle.enemies).filter(e => e.assetKey === boss.assetKey).length, 0);
  assert.equal(again.snapshot.cargo.pearl, 2); assert.equal(again.snapshot.cargo.core, 1);
});

test('all primary gates and extra abyss whale are once-per-dive; world bounds and far layers release', () => {
  const s = make({ battle: { weapons: [{ kind: 'arc', damage: 1e9, cooldownTicks: 1, range: 1200, maxJumps: 80 }] } });
  for (const depth of [799, 1599, 2199, 2399]) {
    s.battle.player.y = depth; step(s);
  }
  assert.equal(s.content.defeatedBosses.length, 4);
  assert.deepEqual(s.content.openRifts, ['sunlight', 'twilight', 'abyss']);
  assert.equal(s.snapshot.cargo.pearl, 8); assert.equal(s.snapshot.cargo.core, 4);
  s.battle.player.x = 10000; s.battle.player.y = 10000; s.setInput(1, 1); step(s);
  assert.equal(s.depth, 2400); assert.ok(s.battle.player.x <= 528, 'player center keeps its 12-unit collision margin');
  assert.ok(values(s.battle.enemies).every(e => e.x >= -540 && e.x <= 540 && e.y >= 0 && e.y <= 2400));
  const shallow = s.battle.spawnEnemy({ x: 0, y: 100, assetKey: 'enemy_normal_01_moon_jelly' });
  const shallowId = shallow.id; step(s); assert.equal(s.battle.enemies.get(shallowId), undefined);
});

test('spawn:false synthetic sessions and legacy checkpoints keep baseline behavior', () => {
  const s = make({ battle: { spawn: false, weapons: [] } }); step(s, 3);
  assert.equal(s.battle.enemies.size, 0); s.battle.player.y = 900; step(s); assert.equal(s.depth, 900);
  const saved = s.checkpoint(); delete saved.battle.content; delete saved.battle.options.content;
  const oldEnemy = s.battle.spawnEnemy({ x: 0, y: 900 });
  const old = s.checkpoint(); delete old.battle.content; delete old.battle.options.content;
  for (const e of old.battle.pools.enemies.slots) for (const key of ['assetKey', 'attack', 'spawnDepth', 'maxHp', 'layer', 'name']) delete e[key];
  const restored = api.DiveSession.restore(old); restored.advance(3);
  assert.equal(restored.battle.enemies.get(oldEnemy.id).attack, 8);
  step(restored); assert.equal(restored.battle.enemies.size, 1);
});

test('enemy reward band uses its spawn depth after player travels deeper', () => {
  const s = make({ battle: { spawn: false, weapons: [{ kind: 'arc', range: 100, damage: 1e9 }] } });
  s.battle.spawnEnemy({ x: 0, y: 0, speed: 0 }); s.battle.player.y = 2300;
  // Move the same enemy to the player; its spawn identity and band remain shallow.
  const e = values(s.battle.enemies)[0]; e.y = 2300; step(s);
  const total = s.snapshot.cargo.crystal + values(s.battle.loot).reduce((n, l) => n + l.value, 0);
  assert.ok(total >= 7 && total <= 13, `shallow reward ${total}`);
});

test('loadout movement and pickup radius affect actual movement and collection after restore', () => {
  const s = make({ battle: { spawn: false, weapons: [], playerSpeed: 240, pickupRadius: 30 } });
  s.setInput(1, 0); step(s); assert.equal(s.battle.player.x, 8);
  s.battle.addLoot(50, 0, 10); step(s); assert.equal(s.snapshot.cargo.crystal, 10);
  const restored = api.DiveSession.restore(s.checkpoint()); restored.advance(3);
  restored.setInput(1, 0); step(restored); assert.equal(restored.battle.player.x, 24);
  restored.battle.addLoot(65, 0, 10); step(restored); assert.equal(restored.snapshot.cargo.crystal, 20);
});

test('legacy enemy snapshots normalize identity and spawn depth before awarding drops', () => {
  const s = make({ battle: { spawn: false, weapons: [] } });
  const enemy = s.battle.spawnEnemy({ x: 0, y: 900 });
  const saved = s.checkpoint();
  for (const item of saved.battle.pools.enemies.slots) for (const field of ['assetKey', 'name', 'layer', 'maxHp', 'attack', 'spawnDepth']) delete item[field];
  const restored = api.DiveSession.restore(saved);
  const actual = restored.battle.enemies.get(enemy.id);
  assert.equal(actual.maxHp, enemy.hp); assert.equal(actual.spawnDepth, 900); assert.equal(actual.layer, 'twilight');
});

test('unbeaten bosses cannot retain a distant layer after retreat; gate boss survives exact boundary', () => {
  const s = make({ battle: { weapons: [] } });
  s.battle.player.y = 700; step(s);
  const first = values(s.battle.enemies).find(e => e.kind === 'boss');
  assert.ok(first); s.battle.player.y = 800; step(s); assert.ok(s.battle.enemies.get(first.id));
  const distant = s.battle.spawnEnemy({ x: 0, y: 2300, assetKey: 'enemy_boss_03_giant_squid' });
  const distantId = distant.id; s.battle.player.y = 0; step(s);
  assert.equal(s.battle.enemies.get(distantId), undefined);
});

test('explicit content works with manual spawning and stale assets pauses do not survive restore', () => {
  const s = make({ battle: { spawn: false, content: true, weapons: [] } });
  assert.equal(s.battle.contentEnabled, true);
  const e = s.battle.spawnEnemy({ x: 0, y: 200, assetKey: 'enemy_normal_01_moon_jelly' });
  assert.equal(e.maxHp, 69.61999999999999);
  s.pause.add('assets'); const restored = api.DiveSession.restore(s.checkpoint());
  assert.equal(restored.pause.has('assets'), false); assert.equal(restored.pause.has('countdown'), true);
  restored.advance(3); step(restored); assert.equal(restored.battle.tick, 1);
});

test('a blocked boundary keeps its guardian layer until the boss dies, then enters the next sea', () => {
  const s = make({ battle: { spawnIntervalTicks: 1, weapons: [{ kind: 'arc', range: 1200, chainRange: 1200, damage: 1e9, maxJumps: 80 }] } });
  s.battle.weapons[0].nextFireTick = 1000;
  s.battle.player.y = 799; s.setInput(0, 1); step(s, 3);
  assert.equal(s.depth, 800); assert.equal(s.battle.activeContentLayer, 'sunlight'); assert.equal(s.content.layer, 'sunlight');
  assert.ok(values(s.battle.enemies).some(e => e.kind === 'normal'));
  assert.ok(values(s.battle.enemies).every(e => e.layer === 'sunlight'));
  s.battle.weapons[0].nextFireTick = 1; step(s); step(s);
  assert.equal(s.battle.activeContentLayer, 'twilight'); assert.equal(s.content.layer, 'twilight');
  assert.ok(values(s.battle.enemies).every(e => e.layer === 'twilight'));
});

test('LOO-70 world bounds widen to ±540 with a ±528 player center limit', () => {
  assert.equal(api.WORLD_BOUNDS.minX, -540); assert.equal(api.WORLD_BOUNDS.maxX, 540);
  assert.equal(api.CAMERA_LIMIT_X, 352.5); // ±(540 − 187.5)
  const s = make({ battle: { spawn: false, content: true, weapons: [] } });
  s.battle.player.x = -10000; step(s);
  assert.equal(s.battle.player.x, -528, 'clamped center equals collision radius margin');
  s.setInput(1, 0); step(s);
  assert.ok(s.battle.player.x > -528, 'movement away from the clamp works immediately');
  // Edge spawns clamp inside the world and re-aim into open water instead of point-blank.
  const spawner = make({});
  spawner.battle.player.x = 528; spawner.battle.player.y = 500;
  const seen = new Set();
  for (let i = 0; i < 240; i++) {
    step(spawner);
    for (const e of values(spawner.battle.enemies)) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      assert.ok(Math.abs(e.x) <= 540, 'spawn clamps inside the world');
      assert.ok(Math.hypot(e.x - spawner.battle.player.x, e.y - spawner.battle.player.y) >= 120,
        `fresh edge spawn stays >=120 from the player (got ${Math.hypot(e.x - spawner.battle.player.x, e.y - spawner.battle.player.y)})`);
    }
  }
});

test('LOO-70 threshold residency preloads before each band and evicts 120m past it', () => {
  const at = depth => api.residentLayersAt(depth);
  assert.deepEqual(at(0), ['sunlight'], 'first dive holds only sunlight');
  assert.deepEqual(at(499), ['sunlight']);
  assert.deepEqual(at(500), ['sunlight', 'twilight'], 'twilight preloads at 500m, 240m before its band');
  assert.deepEqual(at(740), ['sunlight', 'twilight']);
  assert.deepEqual(at(979), ['sunlight', 'twilight']);
  assert.deepEqual(at(981), ['twilight'], 'sunlight evicts 120m past the band');
  assert.deepEqual(at(1299), ['twilight']);
  assert.deepEqual(at(1300), ['twilight', 'abyss'], 'abyss preloads at 1300m');
  assert.deepEqual(at(1660), ['twilight', 'abyss']);
  assert.deepEqual(at(1781), ['abyss'], 'twilight evicts 120m past its lower band');
  assert.deepEqual(at(2400), ['abyss'], 'deep return holds only abyss');
  for (let depth = 0; depth <= 2400; depth += 5) assert.ok(at(depth).length <= 2, `at most two resident layers at ${depth}m`);
  for (let depth = 0; depth <= 2400; depth += 5) assert.ok(at(depth).includes(api.layerAtDepth(depth)), `current layer resident at ${depth}m`);
});

test('LOO-70 band blend weights follow real depth linearly and exist only inside bands', () => {
  assert.equal(api.bandBlend(700), undefined);
  const entry = api.bandBlend(740);
  assert.equal(entry.band.boundary, 800); assert.equal(entry.weight, 0);
  const mid = api.bandBlend(800);
  assert.equal(mid.weight, .5);
  const exit = api.bandBlend(860);
  assert.equal(exit.weight, 1);
  assert.equal(api.bandBlend(900), undefined);
  assert.equal(api.bandBlend(1540).band.boundary, 1600);
  assert.equal(api.bandBlend(1600).weight, .5);
  assert.equal(api.bandBlend(2400), undefined);
});

test('LOO-70 barriers pin the player to the band edge while the far layer is not ready', () => {
  const s = make({ battle: { spawn: false, content: true, weapons: [] } });
  s.battle.player.y = 700; s.battle.barrierDown = 740;
  for (let i = 0; i < 40; i++) s.setInput(0, 1), step(s); // dive hard
  assert.ok(s.battle.player.y <= 740, 'barrierDown clamps downward travel');
  s.battle.barrierDown = undefined; s.battle.barrierUp = 860; s.battle.player.y = 900;
  for (let i = 0; i < 40; i++) s.setInput(0, -1), step(s); // climb hard
  assert.ok(s.battle.player.y >= 860, 'barrierUp clamps upward travel');
});
