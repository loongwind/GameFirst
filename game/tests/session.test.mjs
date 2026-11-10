import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadBattle } from './battle-loader.mjs';

const { DiveSession, PauseManager } = loadBattle();
const make = (options = {}) => new DiveSession({ diveId: 'dive-52', battle: { spawn: false, weapons: [] }, ...options });
const seconds = (s, n) => { for (let i = 0; i < n * 30; i++) s.advance(1 / 30); };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('pause reasons compose and duplicate ad close cannot resume a background/modal freeze', () => {
  const p = new PauseManager(); p.add('background'); p.add('ad'); p.add('modal');
  p.remove('ad'); p.remove('ad'); assert.equal(p.paused, true);
  assert.deepEqual(p.reasons, ['background', 'modal']);
  p.remove('modal'); assert.equal(p.paused, true); p.remove('background'); assert.equal(p.paused, false);
});

test('oxygen follows exact depth bands including 2500m and only accepted 30Hz time', () => {
  for (const [depth, want] of [[0, 119], [499, 119], [500, 118.8], [1000, 118.6], [2500, 118]]) {
    const s = make(); s.battle.player.y = depth; seconds(s, 1); near(s.snapshot.oxygen, want);
  }
  const s = make(); s.advance(20); near(s.snapshot.activeSeconds, 0.1); near(s.snapshot.oxygen, 119.9);
});

test('oxygen crossing zero damages only the dry portion at 2% max HP per second', () => {
  const s = make({ oxygenCapacity: 0.5 }); seconds(s, 1);
  near(s.snapshot.oxygen, 0); near(s.battle.player.hp, 198); assert.equal(s.state, 'Running');
  seconds(s, 1); near(s.battle.player.hp, 194);
});

test('background, modal and ad freeze oxygen, enemies, input, and stacked foreground countdown', () => {
  const s = make(); s.battle.spawnEnemy({ x: 100, y: 100 });
  s.hide(); s.pause.add('ad'); s.pause.add('modal'); s.advance(10);
  assert.equal(s.battle.tick, 0); near(s.snapshot.oxygen, 120);
  s.show(); s.pause.remove('ad'); s.advance(5);
  assert.equal(s.snapshot.countdown, 3); assert.equal(s.battle.tick, 0);
  s.pause.remove('modal'); s.advance(2); assert.equal(s.snapshot.countdown, 1);
  s.hide(); s.show(); assert.equal(s.snapshot.countdown, 3);
  s.advance(3); assert.equal(s.battle.tick, 0); seconds(s, 1);
  assert.equal(s.battle.tick, 30); near(s.snapshot.oxygen, 119);
});

test('adding a pause immediately clears held movement and fractional clock debt', () => {
  const s = make(); s.setInput(1, 0); s.advance(1 / 60);
  s.pause.add('ad'); s.pause.remove('ad'); s.advance(1 / 60);
  assert.equal(s.battle.tick, 0); s.advance(1 / 60); assert.equal(s.battle.player.x, 0);
});

test('full hold accepts a partial crystal stack and leaves overflow in the world', () => {
  const s = make({ cargoCapacity: 10 }); s.battle.addLoot(0, 0, 15); seconds(s, 1);
  assert.equal(s.snapshot.cargo.crystal, 10); assert.equal(s.battle.stats.lootCollected, 10);
  assert.equal([...s.battle.loot.values()][0].value, 5);
  s.collect('pearl', 3); assert.equal(s.snapshot.cargo.pearl, 3);
});

test('death freezes immutable cargo; rescue keeps diveId, scene and cargo; duplicate rescue does nothing', () => {
  const s = make(); s.collect('crystal', 30); s.collect('marrow', 2);
  s.battle.player.hp = 0; s.advance(0.1);
  assert.equal(s.state, 'RescuePending'); assert.equal(s.battle.tick, 0);
  assert.deepEqual(s.deathSnapshot.cargo, { crystal: 30, pearl: 0, marrow: 2, core: 0 });
  assert.throws(() => { s.deathSnapshot.cargo.crystal = 900; }, TypeError);
  assert.equal(s.collect('crystal', 9), 0);
  s.pause.add('background'); assert.equal(s.rescue(), true); assert.equal(s.rescue(), false);
  assert.equal(s.snapshot.diveId, 'dive-52'); near(s.battle.player.hp, 100);
  s.advance(3); assert.equal(s.battle.tick, 0); assert.equal(s.snapshot.cargo.crystal, 30);
});

test('declined rescue loses only unbanked crystal and settlement is acknowledged once under original diveId', () => {
  const s = make(); for (const [kind, value] of [['crystal', 30], ['pearl', 3], ['marrow', 2], ['core', 1]]) s.collect(kind, value);
  s.battle.player.hp = 0; s.advance(0); assert.equal(s.declineRescue(), true);
  assert.equal(s.state, 'Returning'); assert.equal(s.requestReturn(), false);
  assert.equal(s.arriveHarbor(), true); const pending = s.pendingSettlement;
  assert.deepEqual(pending.cargo, { crystal: 0, pearl: 3, marrow: 2, core: 1 });
  assert.equal(pending.reason, 'death'); assert.equal(s.arriveHarbor(), false);
  assert.equal(s.confirmSettlement('different'), false); assert.equal(s.state, 'PendingSettlement');
  assert.equal(s.confirmSettlement('dive-52'), true); assert.equal(s.confirmSettlement('dive-52'), false);
  assert.equal(s.state, 'Settled'); assert.equal(s.pendingSettlement, pending);
});

test('return after rescue creates just one frozen settlement for the original dive', () => {
  const s = make(); s.collect('crystal', 25); s.battle.player.hp = 0; s.advance(0); s.rescue();
  assert.equal(s.requestReturn(), true); assert.equal(s.state, 'Returning'); s.arriveHarbor();
  assert.equal(s.pendingSettlement.diveId, 'dive-52'); assert.equal(s.pendingSettlement.cargo.crystal, 25);
  seconds(s, 2); assert.equal(s.battle.tick, 0);
});

test('disconnect within 30s preserves the same enemies and cargo, recovery respects other pauses', () => {
  const s = make(); s.collect('crystal', 17); const enemy = s.battle.spawnEnemy({ x: 100, y: 0 });
  s.connectionLost(1000); s.connectionLost(2000); seconds(s, 3); s.pause.add('ad');
  assert.equal(s.connectionRestored(31000), true); assert.equal(s.state, 'Running');
  seconds(s, 1); assert.equal(s.battle.tick, 0); assert.equal(s.battle.enemies.get(enemy.id), enemy);
  assert.equal(s.snapshot.cargo.crystal, 17); s.pause.remove('ad'); seconds(s, 1); assert.equal(s.battle.tick, 30);
});

test('disconnect beyond 30s freezes pending return; reconnect cannot revive or duplicate it', () => {
  const s = make(); s.collect('crystal', 17); s.connectionLost(1000); s.checkConnectionTimeout(31001);
  assert.equal(s.state, 'PendingSettlement'); assert.equal(s.pendingSettlement.reason, 'disconnect');
  assert.equal(s.pendingSettlement.cargo.crystal, 17); const pending = s.pendingSettlement;
  assert.equal(s.connectionRestored(32000), false); assert.equal(s.requestReturn(), false);
  assert.equal(s.pendingSettlement, pending);
});

test('disconnect during rescue choice cannot turn death into safe cargo payout', () => {
  const s = make(); s.collect('crystal', 30); s.collect('core', 1); s.battle.player.hp = 0; s.advance(0);
  s.connectionLost(0); s.checkConnectionTimeout(30001);
  assert.equal(s.pendingSettlement.reason, 'death'); assert.equal(s.pendingSettlement.cargo.crystal, 0);
  assert.equal(s.pendingSettlement.cargo.core, 1); assert.equal(s.rescue(), false);
});

test('invalid numeric inputs do not poison session state', () => {
  const s = make(); for (const value of [NaN, Infinity, -1]) {
    assert.throws(() => s.advance(value), RangeError); assert.throws(() => s.collect('pearl', value), RangeError);
  }
  assert.throws(() => make({ oxygenCapacity: 0 }), RangeError);
  assert.throws(() => make({ diveId: '' }), RangeError);
  near(s.snapshot.oxygen, 120);
});
