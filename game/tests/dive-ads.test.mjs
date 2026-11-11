import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadServices, memoryStorage } from './services-loader.mjs';
const api = loadServices();
function setup() {
  assert.equal(typeof api.DiveAdModel, 'function');
  let s, dives; const storage = memoryStorage(), clock = { now: Date.UTC(2026, 10, 10) };
  const economy = new api.EconomyService(new api.LocalSaveService(storage), { now: () => clock.now, adEligible: (slot, context) => dives.adEligible(s, slot, context) });
  economy.dispatch({ type: 'dive.settle', opId: 'seed', settlement: { diveId: 'seed', reason: 'return', cargo: { crystal: 0, pearl: 0, marrow: 0, core: 0 }, xp: 10000, activeSeconds: 0, depth: 0 } });
  dives = new api.LocalDiveService(economy, () => clock.now); s = dives.open('ads', { oxygenCapacity: 1, battle: { spawn: false, weapons: [] } });
  const ads = new api.DiveAdModel(economy, dives, s, () => clock.now);
  const driver = { isMock: true, shows: 0, fail: false, outcome: 'completed', async load() { if (this.fail) throw new Error('no fill'); }, async show() { this.shows++; return this.outcome; } };
  ads.configure(driver); return { storage, clock, economy, dives, s, ads, driver };
}
const lower = s => { for (let i = 0; i < 27; i++) s.advance(1/30); };
test('oxygen prompt is nonblocking, dismisses the current interval, and refills via genuine service with daily three limit', async () => {
  const { s, ads, economy } = setup(); lower(s); assert.equal(ads.view.oxygenPrompt, true); assert.equal(s.pause.paused, false);
  ads.dismissOxygen(); assert.equal(ads.view.oxygenPrompt, false); assert.equal(s.pause.paused, false);
  await ads.watch('oxygen'); assert.equal(s.snapshot.oxygen, 1);
  for (let i = 0; i < 2; i++) { lower(s); assert.equal(ads.view.oxygenPrompt, true); await ads.watch('oxygen'); }
  assert.equal(ads.view.oxygenRemaining, 0); assert.equal(economy.snapshot.daily['2026-11-10'].oxygen, 3);
  lower(s); await ads.watch('oxygen'); assert.match(ads.notice, /次数/); assert.equal(s.pause.paused, false);
});
test('no driver, skip and failed video keep rescue choice/cargo and allow decline with normal crystal loss', async () => {
  const { s, ads, driver, economy } = setup(); s.collect('crystal', 50); s.collect('pearl', 2); s.battle.player.hp = 0; s.advance(0);
  driver.fail = true; await ads.watch('rescue'); assert.equal(s.state, 'RescuePending'); assert.equal(s.pause.paused, false); assert.equal(economy.snapshot.pendingAd, null); assert.match(ads.notice, /失败/);
  driver.fail = false; driver.outcome = 'skipped'; await ads.watch('rescue'); assert.equal(s.snapshot.cargo.crystal, 50); assert.match(ads.notice, /未完整/);
  s.declineRescue(); s.arriveHarbor(); assert.deepEqual(s.pendingSettlement.cargo, { crystal: 0, pearl: 2, marrow: 0, core: 0 });
  const unavailable = setup(); unavailable.ads.configure(undefined); unavailable.s.battle.player.hp = 0; unavailable.s.advance(0); await unavailable.ads.watch('rescue'); assert.equal(unavailable.s.state, 'RescuePending'); assert.equal(unavailable.s.pause.paused, false); assert.equal(unavailable.driver.shows, 0);
});
test('rescue keeps the same dive, returns half health and preserves cargo; fourth rescue is rejected', async () => {
  const { s, ads, economy } = setup(); s.collect('crystal', 50);
  for (let i = 0; i < 3; i++) { s.battle.player.hp = 0; s.advance(0); await ads.watch('rescue'); assert.equal(s.state, 'Running'); assert.equal(s.snapshot.hp, 100); assert.equal(s.snapshot.cargo.crystal, 50); assert.equal(s.diveId, 'ads'); }
  s.battle.player.hp = 0; s.advance(0); await ads.watch('rescue'); assert.equal(s.state, 'RescuePending'); assert.match(ads.notice, /次数/); assert.equal(economy.snapshot.daily['2026-11-10'].rescue, 3);
});
test('completed video with failed save retries original token without showing again; background pause survives', async () => {
  const { s, ads, driver, storage, economy } = setup(); lower(s);
  driver.show = async () => { driver.shows++; storage.fail = true; return 'completed'; };
  await ads.watch('oxygen'); assert.equal(ads.view.rewardPending, true); assert.ok(s.pause.has('ad')); s.hide();
  const original = economy.snapshot.pendingAd; assert.ok(original);
  storage.fail = false; await ads.retry(); assert.equal(driver.shows, 1); assert.equal(s.snapshot.oxygen, 1); assert.equal(economy.snapshot.intents[original].status, 'claimed');
  assert.equal(s.pause.has('ad'), false); assert.ok(s.pause.has('background')); await ads.retry(); assert.equal(driver.shows, 1);
});
test('effect checkpoint failure after claim is retried, reload reconciles claimed rescue before decline', async () => {
  const { s, ads, driver, storage, economy, dives, clock } = setup(); s.collect('crystal', 70); s.battle.player.hp = 0; s.advance(0);
  const apply = dives.applyAdReward.bind(dives); let fail = true;
  dives.applyAdReward = (...args) => { if (fail) { storage.fail = true; try { apply(...args); } finally { storage.fail = false; } } else apply(...args); };
  await ads.watch('rescue'); assert.equal(ads.view.rewardPending, true); assert.equal(s.state, 'Running');
  fail = false; await ads.retry(); assert.equal(driver.shows, 1); assert.equal(ads.view.rewardPending, false);
  const restoredDives = new api.LocalDiveService(economy, () => clock.now); const restored = restoredDives.open('unused'); restoredDives.reconcileAds(restored);
  assert.equal(restored.state, 'Running'); assert.equal(restored.snapshot.hp, 100); assert.equal(restored.snapshot.cargo.crystal, 70);
});
test('reconnect after 30s preserves completed reward choice until the original claim resolves', async () => {
  const { s, ads, driver, storage, clock } = setup(); lower(s);
  driver.show = async () => { storage.fail = true; return 'completed'; }; await ads.watch('oxygen');
  s.connectionLost(clock.now); clock.now += 31000;
  assert.equal(s.connectionRestored(clock.now, true), true); assert.equal(s.state, 'Running');
  storage.fail = false; await ads.retry(); assert.equal(s.snapshot.oxygen, 1); assert.equal(ads.view.rewardPending, false);
});
test('a failed cancellation save is released on the next attempt after storage recovers', async () => {
  const { s, ads, driver, storage, economy } = setup(); s.battle.player.hp = 0; s.advance(0);
  driver.load = async () => { storage.fail = true; throw new Error('no fill'); };
  await ads.watch('rescue'); assert.equal(s.state, 'RescuePending'); assert.equal(economy.snapshot.intents[economy.snapshot.pendingAd].status, 'reserved');
  storage.fail = false; driver.load = async () => {}; await ads.watch('rescue');
  assert.equal(driver.shows, 1); assert.equal(s.state, 'Running'); assert.equal(economy.snapshot.pendingAd, null);
});
test('refresh reclaims a completed contextual reward with its original operation identity', () => {
  const { s, dives, economy, clock, storage } = setup(); s.collect('crystal', 70); s.battle.player.hp = 0; s.advance(0); dives.save(s);
  const token = economy.dispatch({ type: 'ad.prepare', opId: 'refresh-original.prepare', slot: 'rescue', context: { diveId: s.diveId, eventId: s.deathEventId } }).token;
  economy.dispatch({ type: 'ad.complete', opId: 'refresh-original.complete', token });
  let restored; const next = new api.EconomyService(new api.LocalSaveService(storage), { now: () => clock.now, adEligible: (slot, context) => nextDives.adEligible(restored, slot, context) });
  const nextDives = new api.LocalDiveService(next, () => clock.now); restored = nextDives.open('new'); nextDives.reconcileAds(restored);
  assert.equal(restored.state, 'Running'); assert.equal(restored.snapshot.cargo.crystal, 70); assert.equal(restored.snapshot.hp, 100);
  assert.ok(next.snapshot.receipts['refresh-original.claim']); assert.equal(next.snapshot.daily['2026-11-10'].rescue, 1);
  nextDives.reconcileAds(restored); assert.equal(next.snapshot.daily['2026-11-10'].rescue, 1);
});
for (const claimed of [false, true]) test(`refresh while browser already online resolves ${claimed ? 'claimed effect' : 'completed reward'} before disconnect timeout`, () => {
  const { s, dives, economy, clock, storage } = setup(); s.collect('crystal', 70); s.battle.player.hp = 0; s.advance(0);
  const token = economy.dispatch({ type: 'ad.prepare', opId: 'online-original.prepare', slot: 'rescue', context: { diveId: s.diveId, eventId: s.deathEventId } }).token;
  economy.dispatch({ type: 'ad.complete', opId: 'online-original.complete', token });
  if (claimed) economy.dispatch({ type: 'ad.claim', opId: 'online-original.claim', token });
  s.connectionLost(clock.now); dives.save(s); clock.now += 31001;
  let restored; const next = new api.EconomyService(new api.LocalSaveService(storage), { now: () => clock.now, adEligible: (slot, context) => nextDives.adEligible(restored, slot, context) });
  const nextDives = new api.LocalDiveService(next, () => clock.now); restored = nextDives.open('new');
  assert.equal(typeof nextDives.restoreConnection, 'function'); nextDives.restoreConnection(restored); nextDives.reconcileAds(restored);
  assert.equal(restored.state, 'Running'); assert.equal(restored.snapshot.hp, 100); assert.equal(restored.snapshot.cargo.crystal, 70);
  assert.equal(restored.pause.has('reconnect'), false); assert.equal(next.snapshot.daily['2026-11-10'].rescue, 1);
});
