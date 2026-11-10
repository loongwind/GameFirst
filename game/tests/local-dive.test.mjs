import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadServices, memoryStorage } from './services-loader.mjs';
import { loadBattle } from './battle-loader.mjs';
const api = loadServices(), { DiveSession } = loadBattle();
const env = (storage = memoryStorage()) => {
  assert.equal(typeof api.LocalDiveService, 'function');
  const economy = new api.EconomyService(new api.LocalSaveService(storage));
  return { storage, economy, dives: new api.LocalDiveService(economy) };
};
test('active checkpoint restores original dive, cargo, HP/O2, enemies and projectiles without repeating kills', () => {
  const { storage, dives } = env(); const session = dives.open('persisted-dive', { battle: { spawn: false } });
  session.collect('pearl', 3); session.collect('crystal', 30); session.battle.player.y = 150;
  session.battle.spawnEnemy({ x: 10, y: 150, hp: 100 }); session.advance(0.1); session.hide(); dives.save(session);
  const before = session.checkpoint(), restored = env(storage).dives.open('unused-new-id');
  assert.equal(restored.diveId, 'persisted-dive'); assert.deepEqual(restored.snapshot.cargo, session.snapshot.cargo);
  assert.equal(restored.snapshot.oxygen, session.snapshot.oxygen); assert.equal(restored.snapshot.hp, session.snapshot.hp);
  assert.deepEqual(restored.battle.checkpoint(), before.battle);
  assert.equal(restored.snapshot.countdown, 3);
});
test('rescue-pending checkpoint reopens into the same death choice; decline preserves rare materials and settles once', () => {
  const { storage, dives } = env(); const s = dives.open('death-save', { battle: { spawn: false } });
  s.collect('crystal', 100); s.collect('pearl', 2); s.collect('marrow', 3); s.collect('core', 1);
  s.battle.player.hp = 0; s.advance(0); dives.save(s);
  const next = env(storage), restored = next.dives.open('new'); assert.equal(restored.state, 'RescuePending');
  assert.equal(restored.deathSnapshot.cargo.crystal, 100); restored.declineRescue(); restored.arriveHarbor();
  assert.equal(next.dives.settle(restored), true); assert.equal(restored.state, 'Settled');
  assert.deepEqual(next.economy.snapshot.wallet, { crystal: '0', pearl: '2', marrow: '3', core: '1' });
  const again = env(storage); const reopened = again.dives.open('next');
  again.dives.settle(restored); assert.equal(again.economy.snapshot.wallet.pearl, '2'); assert.equal(reopened.diveId, 'death-save');
  assert.equal(reopened.state, 'Settled');
  again.economy.checkpoint(null); assert.notEqual(again.dives.open('next').diveId, 'death-save');
});
test('settlement failure cannot confirm; crash after payout before ack reuses persisted receipt', () => {
  const { storage, dives, economy } = env(); const s = dives.open('atomic', { battle: { spawn: false } });
  s.collect('crystal', 50); s.requestReturn(); s.arriveHarbor(); dives.save(s);
  storage.fail = true; assert.throws(() => dives.settle(s), /quota/); assert.equal(s.state, 'PendingSettlement');
  storage.fail = false;
  // Commit the same settlement but interrupt before confirmSettlement/checkpoint cleanup.
  economy.dispatch({ type: 'dive.settle', opId: 'settle:atomic', settlement: s.pendingSettlement });
  const next = env(storage), restored = next.dives.open('new'); assert.equal(restored.diveId, 'atomic');
  next.dives.settle(restored); assert.equal(restored.state, 'Settled'); assert.equal(next.economy.snapshot.wallet.crystal, '50');
});
test('actual battle kills use depth drop curve and XP; immutable settlement and reload never multiply XP', () => {
  const s = new DiveSession({ diveId: 'kills', battle: { spawn: false, weapons: [{ kind: 'sonic', damage: 500 }] } });
  s.battle.spawnEnemy({ x: 0, y: 0, hp: 1 }); s.advance(0.1);
  assert.equal(s.battle.stats.kills, 1); s.requestReturn(); s.arriveHarbor();
  assert.equal(s.pendingSettlement.xp, 1); assert.ok(s.pendingSettlement.cargo.crystal >= 7 && s.pendingSettlement.cargo.crystal <= 13);
});
test('rescue and oxygen authorization effects persist by token and cannot be applied twice', () => {
  const e = env(), s = e.dives.open('effects', { oxygenCapacity: 1, battle: { spawn: false } });
  for (let i = 0; i < 30; i++) s.advance(1/30);
  const eventId = s.oxygenEventId;
  assert.equal(e.dives.adEligible(s, 'oxygen', { diveId: s.diveId, eventId }), true);
  assert.equal(s.refillOxygen('grant'), true); assert.equal(s.refillOxygen('grant'), false); assert.equal(s.snapshot.oxygen, 1);
  s.battle.player.hp = 0; s.advance(0); const death = s.deathEventId;
  assert.equal(e.dives.adEligible(s, 'rescue', { diveId: s.diveId, eventId: death }), true);
  assert.equal(s.rescue('rescue-token'), true); e.dives.save(s);
  const restored = env(e.storage).dives.open('new'); assert.equal(restored.rescue('rescue-token'), false);
});
test('durable rescue claim is applied before an interrupted death can be finalized, including another refresh', () => {
  const storage = memoryStorage(); let session, dives;
  const economy = new api.EconomyService(new api.LocalSaveService(storage), { adEligible: (slot, context) => dives.adEligible(session, slot, context) });
  dives = new api.LocalDiveService(economy); session = dives.open('recover-rescue', { battle: { spawn: false } });
  session.collect('crystal', 90); session.battle.player.hp = 0; session.advance(0); dives.save(session);
  const token = economy.dispatch({ type: 'ad.prepare', opId: 'rescue.prepare', slot: 'rescue', context: { diveId: session.diveId, eventId: session.deathEventId } }).token;
  economy.dispatch({ type: 'ad.complete', opId: 'rescue.complete', token }); economy.dispatch({ type: 'ad.claim', opId: 'rescue.claim', token });
  const next = env(storage); const restored = next.dives.open('new'); next.dives.reconcileAds(restored);
  assert.equal(restored.state, 'Running'); assert.equal(restored.snapshot.cargo.crystal, 90);
  next.dives.reconcileAds(restored); assert.equal(restored.snapshot.hp, 100);
  assert.equal(env(storage).dives.open('another').state, 'Running');
});
test('a rejected cleanup write keeps the granted context effect checkpoint retryable', () => {
  const storage = memoryStorage(); let session, dives;
  const economy = new api.EconomyService(new api.LocalSaveService(storage), { adEligible: (slot, context) => dives.adEligible(session, slot, context) });
  dives = new api.LocalDiveService(economy); session = dives.open('effect-write', { battle: { spawn: false } });
  session.battle.player.hp = 0; session.advance(0); dives.save(session);
  const token = economy.dispatch({ type: 'ad.prepare', opId: 'effect.prepare', slot: 'rescue', context: { diveId: session.diveId, eventId: session.deathEventId } }).token;
  economy.dispatch({ type: 'ad.complete', opId: 'effect.complete', token }); economy.dispatch({ type: 'ad.claim', opId: 'effect.claim', token });
  storage.fail = true; assert.throws(() => dives.applyAdReward(session, token), /quota/);
  storage.fail = false; dives.applyAdReward(session, token);
  assert.equal(env(storage).dives.open('new').state, 'Running');
});
test('blessing expiry reduces live capacity without destroying previously collected cargo or creating negative pickups', () => {
  const session = new DiveSession({ diveId: 'buff', cargoCapacity: 100, oxygenCapacity: 100, battle: { spawn: false } });
  session.setBenefits({ yield: 1, oxygen: 1, cargo: 1.2 }); assert.equal(session.collect('crystal', 120), 120);
  session.setBenefits({ yield: 1, oxygen: 1, cargo: 1 }); assert.equal(session.cargoCapacity, 100);
  assert.equal(session.collect('crystal', 1), 0); assert.equal(session.snapshot.cargo.crystal, 120);
  const restored = DiveSession.restore(session.checkpoint()); assert.equal(restored.snapshot.cargo.crystal, 120);
  restored.setBenefits({ yield: 1, oxygen: 1.2, cargo: 1 }); assert.equal(restored.snapshot.oxygen, 120);
  restored.setBenefits({ yield: 1, oxygen: 1, cargo: 1 }); assert.equal(restored.snapshot.oxygen, 100);
});
test('yield blessing increases real drops while kill XP remains the base event weight', () => {
  const makeSession = id => new DiveSession({ diveId: id, battle: { spawn: false, weapons: [{ kind: 'sonic', damage: 500 }] } });
  const normal = makeSession('base'), blessed = makeSession('yield'); blessed.setBenefits({ yield: 1.1, oxygen: 1, cargo: 1 });
  for (const s of [normal, blessed]) { s.battle.spawnEnemy({ x: 0, y: 0, hp: 1 }); s.advance(0.1); s.requestReturn(); s.arriveHarbor(); }
  assert.ok(blessed.pendingSettlement.cargo.crystal > normal.pendingSettlement.cargo.crystal);
  assert.equal(blessed.pendingSettlement.xp, 1); assert.equal(normal.pendingSettlement.xp, 1);
});
test('session consumes the actual service benefits object including sonar authorization', () => {
  const e = env(), session = e.dives.open('benefits-port', { battle: { spawn: false } });
  assert.equal(e.economy.activeBenefits().sonar, false);
  session.setBenefits(e.economy.activeBenefits()); assert.equal(session.snapshot.oxygenCapacity, 120);
});
