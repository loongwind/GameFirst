import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { loadServices, memoryStorage } from './services-loader.mjs';
const api = loadServices();
function setup(options = {}) {
  assert.equal(typeof api.AdService, 'function');
  const { MockAdService } = createRequire(import.meta.url)('../.artifacts/services/development/MockAdService.js');
  const storage = options.storage ?? memoryStorage();
  const clock = { now: Date.parse('2026-11-10T15:59:59Z') };
  const economy = new api.EconomyService(new api.LocalSaveService(storage), { now: () => clock.now, random: () => 0, adEligible: () => true });
  economy.dispatch({ type: 'dive.settle', opId: 'seed', settlement: { diveId: 'seed', reason: 'return', cargo: { crystal: 0, pearl: 1000, marrow: 0, core: 0 }, xp: 245, activeSeconds: 1, depth: 0 } });
  const states = [], ads = new MockAdService(economy, { onState: s => states.push(s), ...options.hooks });
  return { storage, economy, clock, states, ads, MockAdService };
}
test('production ad state machine grants once after complete and enforces all seven real daily limits', async () => {
  const { ads, economy, clock, states } = setup();
  for (const [slot, limit] of Object.entries({ gift: 5, blessing: 2, sonar: 6, silver: 3, gold: 2, rescue: 3, oxygen: 3 })) {
    for (let i = 0; i < limit; i++) {
      if (slot === 'sonar') clock.now += 14 * 60000;
      await ads.watch({ opId: `${slot}-${i}`, slot, context: { choice: 'yield', eventId: `${slot}-event-${i}`, diveId: 'dive-ad' } });
    }
    const before = economy.snapshot;
    await assert.rejects(() => ads.watch({ opId: `${slot}-over`, slot, context: { choice: 'yield', eventId: `${slot}-over`, diveId: 'dive-ad' } }), /AD_DAILY_LIMIT/);
    assert.deepEqual(economy.snapshot, before);
  }
  assert.deepEqual(states.slice(0, 5), ['Loading', 'Ready', 'Showing', 'Completed', 'Idle']);
  assert.equal(economy.snapshot.wallet.crystal, '500'); assert.equal(economy.snapshot.daily['2026-11-11'].gold, 2);
});
test('skip and two failed loads grant nothing, release reservation, and preserve wallet/pity', async () => {
  const { ads, economy, states } = setup();
  ads.driver.outcome = 'skipped'; await ads.watch({ opId: 'skip', slot: 'gold' });
  assert.ok(states.includes('Skipped')); assert.equal(economy.snapshot.pendingAd, null);
  ads.driver.loadFailures = 2; await assert.rejects(() => ads.watch({ opId: 'failed', slot: 'gold' }), /AD_LOAD_FAILED/);
  assert.ok(states.includes('Failed')); assert.equal(economy.snapshot.goldPity, 0); assert.equal(economy.snapshot.inventory.length, 0);
  assert.equal(economy.snapshot.daily['2026-11-10']?.gold ?? 0, 0);
});
test('signed business day survives midnight; repeated watch and claim cannot duplicate rewards', async () => {
  let clock;
  const env = setup({ hooks: { onAdStarted: () => { clock.now += 2000; } } }); clock = env.clock;
  const request = { opId: 'midnight', slot: 'gold' };
  await env.ads.watch(request); await env.ads.watch(request);
  assert.equal(env.economy.snapshot.daily['2026-11-10'].gold, 1);
  assert.equal(env.economy.snapshot.daily['2026-11-11']?.gold ?? 0, 0); assert.equal(env.economy.snapshot.inventory.length, 1);
  await env.ads.watch({ opId: 'next-day', slot: 'gold' }); assert.equal(env.economy.snapshot.daily['2026-11-11'].gold, 1);
});
test('ad and pearl golden draws share pity across reload and daily rollover', async () => {
  const { ads, economy } = setup();
  for (let i = 0; i < 8; i++) economy.dispatch({ type: 'box.draw', opId: `gold-${i}`, box: 'gold', count: 1 });
  await ads.watch({ opId: 'ninth', slot: 'gold' }); assert.equal(economy.snapshot.goldPity, 9);
  economy.dispatch({ type: 'box.draw', opId: 'tenth', box: 'gold', count: 1 }); assert.equal(economy.snapshot.goldPity, 0);
  assert.equal(economy.snapshot.inventory.at(-1).quality, 3);
});
test('completed video write failure holds pending intent and original token can recover without replay', async () => {
  let storage;
  const e = setup({ hooks: { onAdStarted: () => { storage.fail = true; } } }); storage = e.storage;
  const result = await e.ads.watch({ opId: 'pending', slot: 'gift' }); assert.equal(result.status, 'pending');
  assert.equal(e.economy.snapshot.wallet.crystal, '0'); storage.fail = false;
  await e.ads.retryClaim(); assert.equal(e.economy.snapshot.wallet.crystal, '100');
  assert.equal(e.economy.snapshot.daily['2026-11-10'].gift, 1);
  await e.ads.retryClaim(); assert.equal(e.economy.snapshot.wallet.crystal, '100');
});
test('concurrent watch is rejected and successful rescue event cannot be used twice', async () => {
  const { ads, economy } = setup();
  const request = { opId: 'rescue', slot: 'rescue', context: { diveId: 'dive', eventId: 'death-1' } };
  const watching = ads.watch(request);
  await assert.rejects(() => ads.watch({ opId: 'other', slot: 'gift' }), /AD_BUSY/);
  await watching;
  await assert.rejects(() => ads.watch({ ...request, opId: 'repeat-event' }), /AD_INELIGIBLE/);
  assert.equal(economy.snapshot.daily['2026-11-10'].rescue, 1);
});
test('expired completed intent is released without a reward and no longer blocks next-day ads', async () => {
  const e = setup();
  const token = e.economy.dispatch({ type: 'ad.prepare', opId: 'expired.prepare', slot: 'gift' }).token;
  e.economy.dispatch({ type: 'ad.complete', opId: 'expired.complete', token });
  e.clock.now += 86400001;
  const recovered = new e.MockAdService(e.economy);
  await assert.rejects(() => recovered.retryClaim(), /EXPIRED/);
  assert.equal(e.economy.snapshot.pendingAd, null); assert.equal(e.economy.snapshot.wallet.crystal, '0');
  await recovered.watch({ opId: 'after-expiry', slot: 'gift' }); assert.equal(e.economy.snapshot.wallet.crystal, '100');
});
