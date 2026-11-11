import assert from 'node:assert/strict';
import { test } from 'node:test';

// Catch loss of exact integer accounting and silent overflow, without game balance decisions.
test('safe integer arithmetic preserves exact amounts and rejects overflow', async () => {
  const { addAmounts, multiplyAmount } = await import('../numeric/index.ts');
  assert.equal(addAmounts(123, 456), 579);
  assert.equal(multiplyAmount(7, 3), 21);
  assert.equal(addAmounts(0, 0), 0);
  assert.throws(() => addAmounts(Number.MAX_SAFE_INTEGER, 1), RangeError);
  assert.throws(() => multiplyAmount(Number.MAX_SAFE_INTEGER, 2), RangeError);
  for (const invalid of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => addAmounts(invalid, 0), RangeError);
    assert.throws(() => multiplyAmount(1, invalid), RangeError);
  }
});

// Gift showcase: deterministic per (business day, rotation window) so UI preview equals payout.
test('gift showcase window slices absolute time and rejects invalid input', async () => {
  const { giftWindow } = await import('../dist/index.js');
  assert.equal(giftWindow(0), 0);
  assert.equal(giftWindow(59999), 0);
  assert.equal(giftWindow(60000), 1);
  assert.equal(giftWindow(179999), 2);
  assert.throws(() => giftWindow(-1), RangeError);
  assert.throws(() => giftWindow(0.5), RangeError);
});
test('gift showcase offer is stable per window, stays inside the pool and cycles through it', async () => {
  const { giftOffer } = await import('../dist/index.js');
  const table = (await import('../dist/index.js')).DEFAULT_BALANCE.ads;
  assert.deepEqual(giftOffer('2026-11-11', 29379799), giftOffer('2026-11-11', 29379799), 'same window must not re-roll');
  for (let window = 48700; window < 48900; window++) for (const day of ['2026-11-11', '2026-11-12']) {
    const offer = giftOffer(day, window);
    assert.ok(table.giftRewards.some(g => g.currency === offer.currency && g.amount === offer.amount), `${day}/${window} outside pool`);
  }
  const seen = new Set();
  for (let window = 0; window < 400; window++) seen.add(giftOffer('2026-11-11', window).currency);
  assert.equal(seen.size, table.giftRewards.length, 'rotation must reach every pool entry');
  assert.throws(() => giftOffer('', 0), RangeError);
  assert.throws(() => giftOffer('2026-11-11', -1), RangeError);
});
