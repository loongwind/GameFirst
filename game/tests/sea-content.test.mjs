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
  assert.ok(e?.assetKey); assert.ok(Math.abs(e.maxHp - 69.62) < 1e-8);
  assert.ok(Math.abs(e.attack - 10.7648) < 1e-8); assert.equal(e.spawnDepth, 200);
  e.x = s.battle.player.x; e.y = s.depth; e.speed = 0;
  const hp = s.battle.player.hp; step(s);
  assert.ok(Math.abs(s.battle.player.hp - (hp - 10.7648)) < 1e-8);
  const b = new api.Battle({ content: true, weapons: [] });
  const final = b.spawnEnemy({ x: 0, y: 2400, assetKey: 'enemy_normal_24_glass_sponge' });
  assert.ok(Math.abs(final.maxHp - 2250.3816215908837) < 1e-6);
  const elite = b.spawnEnemy({ x: 0, y: 0, assetKey: 'enemy_elite_01_storm_eel' });
  const boss = b.spawnEnemy({ x: 0, y: 0, assetKey: 'enemy_boss_01_angler_king' });
  assert.equal(elite.maxHp, 400); assert.equal(elite.attack, 20);
  assert.equal(boss.maxHp, 2000); assert.equal(boss.attack, 32);
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
  assert.equal(s.depth, 2400); assert.ok(s.battle.player.x <= 360);
  assert.ok(values(s.battle.enemies).every(e => e.x >= -360 && e.x <= 360 && e.y >= 0 && e.y <= 2400));
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
