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
