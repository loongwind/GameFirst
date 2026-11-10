/** Foundational arithmetic only. Game balance and currency schemas belong to P1-04. */
function assertAmount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Amounts must be nonnegative safe integers.');
  }
}

export function addAmounts(left: number, right: number): number {
  assertAmount(left);
  assertAmount(right);
  const total = left + right;
  assertAmount(total);
  return total;
}

export function multiplyAmount(amount: number, count: number): number {
  assertAmount(amount);
  assertAmount(count);
  const total = amount * count;
  assertAmount(total);
  return total;
}
