import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadBattle } from './battle-loader.mjs';

function api() {
  const exports = loadBattle();
  assert.equal(typeof exports.Battle, 'function', 'Battle core must be implemented');
  return exports;
}
function world(options = {}) { return new (api().Battle)({ seed: 7, spawn: false, weapons: [], ...options }); }
function steps(battle, n) { for (let i = 0; i < n; i++) battle.step(); }

test('pool reuses storage with fresh identity and clears retained references and hit sets', () => {
  const { Pool } = api();
  const pool = new Pool(1, () => ({ id: 0, active: false, hits: new Set(), listener: null, resource: null }), item => {
    item.hits.clear(); item.listener = null; item.resource = null;
  });
  const first = pool.acquire(); const id = first.id;
  first.hits.add(8); first.listener = () => {}; first.resource = { large: true };
  assert.equal(pool.acquire(), undefined);
  assert.equal(pool.release(id), true);
  assert.equal(pool.get(id), undefined);
  const second = pool.acquire();
  assert.equal(second, first);
  assert.notEqual(second.id, id);
  assert.equal(second.hits.size, 0); assert.equal(second.listener, null); assert.equal(second.resource, null);
  assert.equal(pool.release(id), false); assert.equal(pool.size, 1);
  pool.clear(); assert.equal(pool.size, 0);
});

test('grid finds boundary, negative and large-radius bodies once; geometry includes tangencies', () => {
  const { SpatialGrid, circlesOverlap, segmentHitsCircle } = api();
  const grid = new SpatialGrid(10);
  const body = { id: 1, x: -10, y: 0, radius: 20 };
  grid.rebuild([body, { id: 2, x: 50, y: 50, radius: 1 }]);
  assert.deepEqual(grid.query(8, -1, 12, 1).map(e => e.id), [1]);
  assert.equal(circlesOverlap(0, 0, 5, 10, 0, 5), true);
  assert.equal(circlesOverlap(0, 0, 5, 10.01, 0, 5), false);
  assert.equal(segmentHitsCircle(-100, 0, 100, 0, 0, 3, 3), true);
  assert.equal(segmentHitsCircle(0, 0, 0, 0, 0, 4, 3), false);
  assert.equal(segmentHitsCircle(-100, 0, 100, 0, 0, 3.01, 3), false);
  grid.rebuild([]); assert.equal(grid.query(-20, -20, 20, 20).length, 0);
});

test('fixed clock runs 30Hz, interpolates and caps stalls at three steps without later debt', () => {
  const b = world(); b.setInput(1, 0);
  assert.equal(b.advance(1 / 60).steps, 0);
  assert.equal(b.advance(1 / 60).steps, 1);
  assert.equal(b.tick, 1); assert.equal(b.player.x, 4);
  assert.equal(b.advance(1 / 60).alpha, 0.5);
  assert.equal(b.samplePlayer(0.5).x, 2);
  const capped = b.advance(5);
  assert.equal(capped.steps, 3); assert.ok(capped.droppedSteps >= 146);
  assert.equal(b.advance(0).steps, 0);
  assert.throws(() => b.advance(NaN), RangeError);
  assert.throws(() => b.advance(-1), RangeError);
});

test('pause discards elapsed time and input; resume does not interpolate stale motion', () => {
  const b = world(); b.setInput(1, 0); b.advance(1 / 30);
  b.setPaused(true); b.advance(500); b.step();
  assert.equal(b.tick, 1); assert.equal(b.player.x, 4);
  b.setPaused(false); assert.equal(b.advance(0).steps, 0);
  b.advance(1 / 30); assert.equal(b.player.x, 4);
  assert.equal(b.samplePlayer(0).x, 4);
});

test('joystick clamps diagonals, honors dead zone and clears movement on release', () => {
  const { joystickVector } = api();
  assert.deepEqual(joystickVector(2, 0, 50, 0.1), { x: 0, y: 0 });
  const v = joystickVector(100, 100, 50, 0.1);
  assert.ok(Math.abs(Math.hypot(v.x, v.y) - 1) < 1e-12);
  const b = world(); b.setInput(10, 10); steps(b, 30);
  assert.ok(Math.abs(Math.hypot(b.player.x, b.player.y) - 120) < 1e-9);
  b.setInput(0, 0); steps(b, 3); assert.ok(Math.abs(b.player.x - 120 / Math.sqrt(2)) < 1e-9);
  b.setInput(NaN, Infinity); b.step(); assert.ok(Number.isFinite(b.player.x));
});

test('same seed and per-tick input reproduce spawn, combat and loot; different seeds diverge', () => {
  const replay = seed => {
    const b = world({ seed, spawn: true, spawnIntervalTicks: 3, weapons: [{ kind: 'torpedo' }] });
    for (let i = 0; i < 240; i++) { b.setInput(i < 100 ? 1 : 0, i >= 100 ? 1 : 0); b.step(); }
    return { player: b.player, enemies: [...b.enemies.values()], projectiles: [...b.projectiles.values()], loot: [...b.loot.values()], stats: b.stats };
  };
  assert.deepEqual(replay(12), replay(12)); assert.notDeepEqual(replay(12), replay(13));
});

test('spawner defers at capacity and retries after recycle; target and distant decisions run at 10Hz', () => {
  const b = world({ spawn: true, spawnIntervalTicks: 1, capacities: { enemies: 1 } });
  steps(b, 4); assert.equal(b.enemies.size, 1); assert.equal(b.stats.deferredSpawns, 3);
  b.enemies.release([...b.enemies.values()][0].id); b.step(); assert.equal(b.enemies.size, 1);
  const far = world(); far.spawnEnemy({ x: 1000, y: 0 }); steps(far, 30);
  assert.equal(far.stats.targetUpdates, 10); assert.equal(far.stats.farDecisions, 10);
});

test('configuration rejects invalid timing, capacity and nonfinite weapon inputs', () => {
  const { Battle, Pool, SpatialGrid } = api();
  for (const options of [{ spawnIntervalTicks: 0 }, { capacities: { enemies: 0 } }, { seed: NaN }, { weapons: [{ kind: 'sonic', cooldownTicks: 0 }] }, { weapons: [{ kind: 'mine', lifetimeTicks: NaN }] }]) {
    assert.throws(() => new Battle(options), RangeError);
  }
  assert.throws(() => new Pool(-1, () => ({}), () => {}), RangeError);
  assert.throws(() => new SpatialGrid(0), RangeError);
});

test('invalid spawn and loot commands fail before consuming storage; enormous frame time cannot poison the clock', () => {
  const b = world();
  for (const spec of [{ x: NaN, y: 0 }, { x: 0, y: Infinity }, { x: 0, y: 0, radius: -1 }, { x: 0, y: 0, hp: 0 }, { x: 0, y: 0, speed: -1 }]) {
    assert.throws(() => b.spawnEnemy(spec), RangeError);
  }
  assert.equal(b.enemies.size, 0);
  assert.throws(() => b.addLoot(0, NaN, 1), RangeError);
  assert.throws(() => b.addLoot(0, 0, -1), RangeError);
  assert.equal(b.loot.size, 0);
  assert.throws(() => b.advance(Number.MAX_VALUE), RangeError);
  assert.equal(b.advance(1 / 30).steps, 1);
});

test('sonic sweeps an expanding ring, does not hit distant bodies early or the same body twice', () => {
  const b = world({ weapons: [{ kind: 'sonic', cooldownTicks: 300, speed: 300, range: 100 }] });
  const near = b.spawnEnemy({ x: 20, y: 0, hp: 100, speed: 0, radius: 1 });
  const far = b.spawnEnemy({ x: 80, y: 0, hp: 100, speed: 0, radius: 1 });
  b.step(); assert.equal(near.hp, 100); assert.equal(far.hp, 100);
  b.step(); assert.equal(near.hp, 80); assert.equal(far.hp, 100);
  steps(b, 9); assert.equal(near.hp, 80); assert.equal(far.hp, 80);
  assert.equal(b.projectiles.size, 0); assert.equal(b.stats.hits, 2);
});

test('sonic catches a fast enemy crossing the wave and ignores bodies wholly inside its old radius', () => {
  const b = world({ weapons: [{ kind: 'sonic', cooldownTicks: 300, speed: 300, range: 100 }] });
  const e = b.spawnEnemy({ x: 40, y: 0, hp: 100, speed: 0, radius: 1 });
  b.step(); e.speed = 1200; b.step(); assert.equal(e.hp, 80);
  const inside = b.spawnEnemy({ x: 0, y: 0, hp: 100, speed: 0, radius: 1 });
  b.step(); assert.equal(inside.hp, 100);
  const { expandingRingHitsCircle } = api();
  // A target passes across both sides of a stationary radius-10 ring.
  assert.equal(expandingRingHitsCircle(-30, 0, 30, 0, 1, 10, 10), true);
  assert.equal(expandingRingHitsCircle(-30, 20, 30, 20, 1, 10, 10), false);
  assert.equal(expandingRingHitsCircle(0, 0, 1, 0, 1, 10, 20), false);
});

test('torpedo sweeps fast motion, penetrates multiple bodies, excludes misses and duplicate hits', () => {
  const b = world({ weapons: [{ kind: 'torpedo', cooldownTicks: 300, speed: 6000, radius: 1 }] });
  const a = b.spawnEnemy({ x: 40, y: 0, hp: 100, speed: 0, radius: 2 });
  const c = b.spawnEnemy({ x: 100, y: 0, hp: 100, speed: 0, radius: 2 });
  const miss = b.spawnEnemy({ x: 100, y: 4, hp: 100, speed: 0, radius: 2 });
  b.step(); b.step();
  assert.equal(a.hp, 80); assert.equal(c.hp, 80); assert.equal(miss.hp, 100);
  steps(b, 5); assert.equal(a.hp, 80); assert.equal(c.hp, 80);
});

test('torpedo uses relative swept movement when an enemy crosses its path within a tick', () => {
  const b = world({ weapons: [{ kind: 'torpedo', cooldownTicks: 300, speed: 3000, radius: 1 }] });
  b.spawnEnemy({ x: 200, y: 0, hp: 100, speed: 0, radius: 2 });
  b.step();
  const crossing = b.spawnEnemy({ x: 150, y: 50, hp: 100, speed: 3000, radius: 2 });
  // Aim the crossing body across the projectile, preserving the normal movement system.
  b.player.x = 150; b.player.y = -50;
  b.step(); assert.equal(crossing.hp, 80);
});

test('arc hits at most maxJumps distinct targets, chooses nearest hops and works with full decoration pools', () => {
  const b = world({ capacities: { effects: 1, texts: 1 }, weapons: [{ kind: 'arc', range: 50, chainRange: 35, maxJumps: 3, cooldownTicks: 300 }] });
  const es = [30, 60, 90, 120].map(x => b.spawnEnemy({ x, y: 0, hp: 100, speed: 0 }));
  b.step();
  assert.deepEqual(es.map(e => e.hp), [80, 80, 80, 100]);
  assert.equal(b.stats.hits, 3); assert.equal(b.texts.size, 1); assert.equal(b.effects.size, 1);
  assert.equal([...b.texts.values()][0].value, 60);
  assert.equal(b.stats.mergedTexts, 2);
});

test('mine triggers by proximity and explodes in a larger radius; far bodies survive', () => {
  const b = world({ weapons: [{ kind: 'mine', cooldownTicks: 300, radius: 70, triggerRadius: 25 }] });
  const es = [30, 60, 100].map(x => b.spawnEnemy({ x, y: 0, hp: 100, speed: 0, radius: 1 }));
  b.step(); assert.deepEqual(es.map(e => e.hp), [100, 100, 100]);
  es[0].x = 20; b.step();
  assert.deepEqual(es.map(e => e.hp), [65, 65, 100]); assert.equal(b.projectiles.size, 0);
});

test('mines have a per-mount limit and expire without damage; expiry frees room for the next cast', () => {
  const b = world({ weapons: [{ kind: 'mine', cooldownTicks: 1, lifetimeTicks: 5, maxActive: 2, triggerRadius: 5 }] });
  const e = b.spawnEnemy({ x: 150, y: 0, hp: 100, speed: 0 });
  steps(b, 4); assert.equal(b.projectiles.size, 2);
  b.step(); assert.equal(b.projectiles.size, 2);
  steps(b, 3); assert.ok(b.projectiles.size <= 2); assert.equal(e.hp, 100);
  const expired = world({ weapons: [{ kind: 'mine', cooldownTicks: 300, lifetimeTicks: 2 }] });
  const target = expired.spawnEnemy({ x: 150, y: 0, hp: 100, speed: 0 });
  steps(expired, 2); target.x = 0; expired.step();
  assert.equal(target.hp, 100); assert.equal(expired.projectiles.size, 0);
});

test('enemy death recycles once and full loot pool merges exact value before collection', () => {
  const b = world({ capacities: { loot: 1 }, weapons: [{ kind: 'arc', damage: 100, range: 100, maxJumps: 3, chainRange: 100, cooldownTicks: 300 }] });
  [30, 45, 60].forEach(x => b.spawnEnemy({ x, y: 0, hp: 50, speed: 0, lootValue: 7 }));
  b.step(); assert.equal(b.stats.kills, 3); assert.equal(b.enemies.size, 0);
  assert.equal(b.loot.size, 1); assert.equal([...b.loot.values()][0].value, 21);
  assert.equal(b.stats.mergedLoot, 2);
  b.player.x = 30; b.step(); assert.equal(b.stats.lootCollected, 21); assert.equal(b.loot.size, 0);
  steps(b, 30); assert.equal(b.stats.kills, 3); assert.equal(b.stats.lootCollected, 21);
});

test('projectile saturation defers fire, fresh IDs survive old hit sets, and recycling clears every pool', () => {
  const b = world({ capacities: { enemies: 1, projectiles: 1 }, weapons: [{ kind: 'sonic', cooldownTicks: 1, speed: 300, range: 100 }] });
  let e = b.spawnEnemy({ x: 10, y: 0, hp: 100, speed: 0, radius: 1 });
  b.step(); assert.equal(e.hp, 80); const oldId = e.id;
  b.enemies.release(oldId);
  e = b.spawnEnemy({ x: 20, y: 0, hp: 100, speed: 0, radius: 1 });
  b.step(); assert.equal(e.hp, 80); assert.notEqual(e.id, oldId);
  steps(b, 12); assert.ok(b.stats.hits >= 3); assert.ok(b.stats.deferredShots > 0);
  b.dispose();
  for (const pool of [b.enemies, b.projectiles, b.loot, b.texts, b.effects]) assert.equal(pool.size, 0);
  assert.equal(b.weapons[0].targetId, 0); assert.equal(b.advance(10).steps, 0);
});

test('targeting ignores a recycled target and reacquires on the next 10Hz decision', () => {
  const b = world({ capacities: { enemies: 1 }, weapons: [{ kind: 'arc', cooldownTicks: 1 }] });
  const first = b.spawnEnemy({ x: 30, y: 0, hp: 100, speed: 0 }); b.step();
  b.enemies.release(first.id);
  const replacement = b.spawnEnemy({ x: 30, y: 0, hp: 100, speed: 0 });
  steps(b, 2); assert.equal(replacement.hp, 100);
  b.step(); assert.equal(replacement.hp, 80);
});

for (const count of [40, 80]) test(`${count} enemies: four weapons sustain 900 ticks without overflows or lost loot`, () => {
  const b = world({ spawn: true, spawnIntervalTicks: 1, capacities: { enemies: count }, weapons: ['sonic', 'torpedo', 'arc', 'mine'].map(kind => ({ kind })) });
  for (let i = 0; i < count; i++) {
    const angle = i / count * Math.PI * 2;
    b.spawnEnemy({ x: Math.cos(angle) * 90, y: Math.sin(angle) * 90, hp: 50, speed: 10, lootValue: 10 });
  }
  steps(b, 900);
  assert.ok(b.stats.kills > 0); assert.ok(b.stats.hits > b.stats.kills);
  for (const pool of [b.enemies, b.projectiles, b.loot, b.texts, b.effects]) {
    assert.ok(pool.size <= pool.capacity);
    for (const item of pool.values()) assert.ok(Number.isFinite(item.x) && Number.isFinite(item.y));
  }
  assert.equal(b.stats.lootCollected + [...b.loot.values()].reduce((sum, l) => sum + l.value, 0), b.stats.kills * 10);
});
