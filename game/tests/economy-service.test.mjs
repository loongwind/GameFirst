import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadServices, memoryStorage } from './services-loader.mjs';
const api = loadServices();
const make = (storage = memoryStorage(), options = {}) => {
  assert.equal(typeof api.EconomyService, 'function');
  return new api.EconomyService(new api.LocalSaveService(storage), { now: () => 100000, random: () => 0, ...options });
};
const settle = (s, id = 'dive-a', cargo = { crystal: 1000, pearl: 1000, marrow: 100, core: 2 }, xp = 245) =>
  s.dispatch({ type: 'dive.settle', opId: `settle:${id}`, settlement: { diveId: id, reason: 'return', cargo, xp, activeSeconds: 30, depth: 100 } });

test('settlement and receipt persist together; changed opId, reopened process and response-loss never duplicate dive payout', () => {
  const storage = memoryStorage(), s = make(storage); settle(s);
  const reopened = make(storage); assert.equal(reopened.snapshot.wallet.crystal, '1000');
  reopened.dispatch({ type: 'dive.settle', opId: 'retry-with-different-op', settlement: { diveId: 'dive-a', reason: 'return', cargo: { crystal: 1000, pearl: 1000, marrow: 100, core: 2 }, xp: 245, activeSeconds: 30, depth: 100 } });
  assert.equal(reopened.snapshot.wallet.crystal, '1000'); assert.equal(reopened.snapshot.totalXp, 245);
  assert.equal(reopened.snapshot.playerLevel, 8);
  const copy = reopened.snapshot; copy.wallet.crystal = '999999'; assert.equal(reopened.snapshot.wallet.crystal, '1000');
});
test('upgrade spends exactly once; invalid/overdraft commands do not change any currency or revision', () => {
  const s = make(); settle(s); const a = { type: 'attribute.upgrade', opId: 'upgrade', attribute: 'hp' };
  s.dispatch(a); s.dispatch(a); assert.equal(s.snapshot.wallet.crystal, '920'); assert.equal(s.snapshot.attributes.hp, 1);
  assert.throws(() => s.dispatch({ ...a, attribute: 'attack' }), /OP_ID/);
  const before = s.snapshot;
  assert.throws(() => s.dispatch({ type: 'attribute.upgrade', opId: 'bad', attribute: '__proto__' }));
  assert.throws(() => s.dispatch({ type: 'box.draw', opId: 'poor', box: 'gold', count: 20 }));
  assert.deepEqual(s.snapshot, before);
  s.dispatch({ type: 'tech.unlock', opId: 't1', nodeId: 'attack.1' }); assert.equal(s.snapshot.wallet.crystal, '820');
  assert.throws(() => s.dispatch({ type: 'tech.unlock', opId: 't3', nodeId: 'attack.3' }), /PREREQUISITE/);
});
test('gold ten-pull spends 1000 pearls, uses sequential pity and persists generated instances', () => {
  const storage = memoryStorage(), s = make(storage); settle(s);
  const action = { type: 'box.draw', opId: 'ten', box: 'gold', count: 10 };
  s.dispatch(action); assert.equal(s.snapshot.wallet.pearl, '0'); assert.equal(s.snapshot.inventory.length, 10);
  assert.equal(s.snapshot.inventory.filter(i => i.quality >= 3).length, 1); assert.equal(s.snapshot.goldPity, 0);
  make(storage).dispatch(action); assert.equal(s.snapshot.inventory.length, 10);
});
test('synthesis upgrade investment is conserved over two generations and cannot refund twice', () => {
  const s = make(); settle(s, 'rich', { crystal: 1000, pearl: 10000, marrow: 1000, core: 5 });
  s.dispatch({ type: 'box.draw', opId: 'silver-ten', box: 'silver', count: 10 });
  const ids = s.snapshot.inventory.map(i => i.id);
  const upgrade = id => s.dispatch({ type: 'equipment.upgrade', opId: `up:${id}`, itemId: id, payment: 'marrow' });
  upgrade(ids[0]); upgrade(ids[1]); assert.equal(s.snapshot.wallet.marrow, '990');
  s.dispatch({ type: 'equipment.synthesize', opId: 'merge1', itemIds: ids.slice(0, 3), mainId: ids[0] });
  assert.equal(s.snapshot.wallet.marrow, '995');
  const first = s.snapshot.inventory.find(i => i.quality === 1); assert.equal(first.level, 2); assert.equal(first.invested.marrow, '5');
  for (const [opId, itemIds] of [['merge2', ids.slice(3, 6)], ['merge3', ids.slice(6, 9)]])
    s.dispatch({ type: 'equipment.synthesize', opId, itemIds, mainId: itemIds[0] });
  const ones = s.snapshot.inventory.filter(i => i.quality === 1);
  s.dispatch({ type: 'equipment.synthesize', opId: 'merge4', itemIds: ones.map(i => i.id), mainId: ones[1].id });
  assert.equal(s.snapshot.wallet.marrow, '1000');
  assert.throws(() => s.dispatch({ type: 'equipment.synthesize', opId: 'again', itemIds: ones.map(i => i.id), mainId: ones[1].id }));
  assert.equal(s.snapshot.wallet.marrow, '1000');
});
test('death strips only unsettled crystal; failed write leaves state and receipt retryable', () => {
  const storage = memoryStorage(), s = make(storage); settle(s); storage.fail = true;
  const action = { type: 'dive.settle', opId: 'death', settlement: { diveId: 'dead', reason: 'death', cargo: { crystal: 100, pearl: 2, marrow: 3, core: 1 }, xp: 5, activeSeconds: 4, depth: 5 } };
  assert.throws(() => s.dispatch(action), /quota/); assert.equal(s.snapshot.wallet.pearl, '1000');
  storage.fail = false; s.dispatch(action); assert.deepEqual(s.snapshot.wallet, { crystal: '1000', pearl: '1002', marrow: '103', core: '3' });
});
test('double slots identify corruption, recover newest valid snapshot, and refuse overwriting entirely damaged saves', () => {
  const storage = memoryStorage(), s = make(storage); settle(s);
  s.dispatch({ type: 'attribute.upgrade', opId: 'up', attribute: 'hp' });
  const entries = Array.from(storage.data.entries()); assert.equal(entries.length, 2);
  const newest = entries.sort((a, b) => JSON.parse(b[1]).sequence - JSON.parse(a[1]).sequence)[0][0];
  storage.data.set(newest, '{broken'); const recovered = make(storage);
  assert.equal(recovered.snapshot.wallet.crystal, '1000'); assert.equal(recovered.saveStatus, 'recovered');
  for (const key of storage.data.keys()) storage.data.set(key, '{broken');
  assert.throws(() => make(storage), /CORRUPT_SAVE/);
});
test('checksummed wrong schemas and negative balances are rejected without silently creating a fresh wallet', () => {
  const storage = memoryStorage(), s = make(storage); settle(s);
  const [key, raw] = Array.from(storage.data.entries())[0], envelope = JSON.parse(raw);
  envelope.payload.state.wallet.crystal = '-1'; envelope.checksum = api.checksum(JSON.stringify({ sequence: envelope.sequence, payload: envelope.payload }));
  storage.data.clear(); storage.data.set(key, JSON.stringify(envelope)); assert.throws(() => make(storage), /CORRUPT_SAVE/);
});
test('telemetry batches persist settlement events and acknowledge only supplied event IDs', () => {
  const storage = memoryStorage(), s = make(storage); settle(s);
  const events = s.telemetryBatch(); assert.equal(events.command, 'telemetry.batch');
  assert.ok(events.events.some(e => e.name === 'deposit_done' && e.properties.amount === '1000'));
  const id = events.events[0].id; s.ackTelemetry([id]); assert.ok(!make(storage).telemetryBatch().events.some(e => e.id === id));
});
test('absolute-time benefits expire during background time and do not multiply XP', () => {
  let now = 1000; const s = make(memoryStorage(), { now: () => now }); settle(s);
  const token = s.dispatch({ type: 'ad.prepare', opId: 'bless', slot: 'blessing', context: { choice: 'yield' } }).token;
  s.dispatch({ type: 'ad.complete', opId: 'complete', token }); s.dispatch({ type: 'ad.claim', opId: 'claim', token });
  assert.equal(s.activeBenefits().yield, 1.1); assert.equal(s.snapshot.totalXp, 245);
  now += 1200000; assert.equal(s.activeBenefits().yield, 1); assert.equal(s.activeBenefits().sonar, false);
});
test('ticket box outcomes enter the item ledger and can pay one real equipment upgrade', () => {
  let roll = 0; const s = make(memoryStorage(), { random: () => roll }); settle(s);
  s.dispatch({ type: 'box.draw', opId: 'equipment', box: 'silver', count: 1 }); const item = s.snapshot.inventory[0].id;
  roll = 0.999; s.dispatch({ type: 'box.draw', opId: 'ticket', box: 'silver', count: 1 });
  assert.equal(s.snapshot.tickets, 1); assert.equal(s.snapshot.inventory.length, 1);
  s.dispatch({ type: 'equipment.upgrade', opId: 'ticket-upgrade', itemId: item, payment: 'ticket' });
  assert.equal(s.snapshot.tickets, 0); assert.equal(s.snapshot.wallet.marrow, '100');
  assert.equal(s.snapshot.inventory[0].invested.tickets, 1); assert.equal(s.snapshot.inventory[0].level, 2);
});

test('gift showcase pays the prepare-window offer even when the claim lands in a later rotation window', async () => {
  const { giftOffer, giftWindow } = await import('@abyss-hunter/shared');
  let now = 3_600_000; const s = make(memoryStorage(), { now: () => now, random: () => 0.99 }); settle(s);
  const token = s.dispatch({ type: 'ad.prepare', opId: 'show.prepare', slot: 'gift' }).token;
  const shown = { kind: 'currency', ...giftOffer(api.businessDay(now), giftWindow(now)) };
  const before = s.snapshot.wallet[shown.currency];
  now += 4 * 60_000 + 1; // two rotation windows pass while the video plays
  s.dispatch({ type: 'ad.complete', opId: 'show.complete', token });
  const claimed = s.dispatch({ type: 'ad.claim', opId: 'show.claim', token });
  assert.deepEqual(claimed.reward, shown, 'claim must not re-roll into the later window');
  assert.equal(BigInt(s.snapshot.wallet[shown.currency]) - BigInt(before), BigInt(shown.amount));
});
