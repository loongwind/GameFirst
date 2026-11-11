import { DEFAULT_BALANCE } from '../config-schema/balance.js';
import type { BalanceConfig } from '../config-schema/balance.js';

/** Decimal strings survive JSON and retain exactness beyond Number.MAX_SAFE_INTEGER. */
export type Amount = string;
export type Currency = 'crystal' | 'pearl' | 'marrow' | 'core';
export type Wallet = Record<Currency, Amount>;
export type Box = 'silver' | 'gold';
export type MonsterKind = 'normal' | 'elite' | 'boss';
export interface Equipment {
  id: string; template: string; quality: number; level: number; equipped: boolean; locked: boolean;
  invested: { marrow: Amount; tickets: number };
}
export function integer(n: number, min = 0, max = Number.MAX_SAFE_INTEGER): void {
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new RangeError('Invalid integer');
}
export function amount(n: Amount): bigint {
  if (typeof n !== 'string' || !/^(0|[1-9][0-9]{0,255})$/.test(n)) throw new RangeError('Invalid amount');
  return BigInt(n);
}
export function addMoney(a: Amount, b: Amount): Amount { const n = (amount(a) + amount(b)).toString(); amount(n); return n; }
export function subtractMoney(a: Amount, b: Amount): Amount {
  const n = amount(a) - amount(b); if (n < BigInt(0)) throw new RangeError('INSUFFICIENT_FUNDS'); return n.toString();
}
/** Cocos Babel targets rewrite ** to Math.pow, which cannot accept BigInt. */
function exactPower(base: bigint, exponent: number): bigint {
  let result = BigInt(1);
  while (exponent > 0) {
    if (exponent % 2 === 1) result *= base;
    base *= base; exponent = Math.floor(exponent / 2);
  }
  return result;
}
export function upgradeCost(level: number, c: BalanceConfig = DEFAULT_BALANCE): Amount {
  integer(level, 0, c.attributes.maxLevel - 1);
  const numerator = BigInt(c.attributes.baseCost) * exactPower(BigInt(c.attributes.growthNumerator), level);
  const denominator = exactPower(BigInt(c.attributes.growthDenominator), level);
  return ((numerator + denominator - BigInt(1)) / denominator).toString();
}
export function attributeValue(id: string, level: number, c = DEFAULT_BALANCE): number {
  const i = c.attributes.ids.indexOf(id); if (i < 0) throw new RangeError('Unknown attribute');
  integer(level, 0, c.attributes.maxLevel); return c.attributes.baseValues[i] * (1 + c.attributes.gainPerLevel[i] * level);
}
export function xpThreshold(level: number, c = DEFAULT_BALANCE): number {
  integer(level, 1, c.progression.maxLevel);
  return c.progression.baseXp * (level - 1) + c.progression.stepXp * (level - 1) * (level - 2) / 2;
}
export function levelThresholds(c = DEFAULT_BALANCE): readonly number[] {
  return Object.freeze(Array.from({ length: c.progression.maxLevel }, (_, i) => xpThreshold(i + 1, c)));
}
export function levelForXp(xp: number, c = DEFAULT_BALANCE): number {
  integer(xp); let low = 1, high = c.progression.maxLevel;
  while (low < high) { const mid = Math.ceil((low + high) / 2); if (xp >= xpThreshold(mid, c)) low = mid; else high = mid - 1; }
  return low;
}
export function equipmentUpgradeCost(item: Equipment, c = DEFAULT_BALANCE): Amount {
  validateEquipment(item, c); integer(item.level, 1, c.equipment.maxLevels[item.quality] - 1);
  return String(c.equipment.baseUpgradeCost + c.equipment.upgradeStep * (item.level - 1));
}
export function validateEquipment(item: Equipment, c = DEFAULT_BALANCE): void {
  if (!item || !item.id || !c.equipment.templates.includes(item.template) || typeof item.equipped !== 'boolean' || typeof item.locked !== 'boolean') throw new RangeError('Invalid equipment');
  integer(item.quality, 0, 4); integer(item.level, 1, c.equipment.maxLevels[item.quality]);
  amount(item.invested.marrow); integer(item.invested.tickets);
}
export function synthesize(items: readonly Equipment[], mainId: string, outputId: string, c = DEFAULT_BALANCE): { item: Equipment; refund: Equipment['invested'] } {
  if (items.length !== 3 || new Set(items.map(i => i.id)).size !== 3 || !outputId) throw new RangeError('Three distinct items required');
  items.forEach(i => validateEquipment(i, c)); const main = items.find(i => i.id === mainId);
  if (!main || main.quality >= 4 || items.some(i => i.template !== main.template || i.quality !== main.quality || i.equipped || i.locked || (!c.equipment.allowMixedLevels && i.level !== main.level))) throw new RangeError('Invalid synthesis');
  const refund = { marrow: '0', tickets: 0 };
  if (c.equipment.refundAuxiliary) for (const item of items) if (item.id !== main.id) {
    refund.marrow = addMoney(refund.marrow, item.invested.marrow); refund.tickets += item.invested.tickets; integer(refund.tickets);
  }
  return { item: { ...main, id: outputId, quality: main.quality + 1, invested: { ...main.invested } }, refund };
}
export function randomUnit(n: number): number {
  if (!Number.isFinite(n) || n < 0 || n >= 1) throw new RangeError('Invalid random sample'); return n;
}
/** Rotation window index of the gift showcase; windows are fixed-length slices of absolute time. */
export function giftWindow(now: number, c: BalanceConfig = DEFAULT_BALANCE): number {
  integer(now); if (c.ads.giftRotationMs < 1) throw new RangeError('Invalid gift rotation'); return Math.floor(now / c.ads.giftRotationMs);
}
/** Deterministic showcase pick for one (day, window): the UI preview and the actual payout stay identical without extra state. */
export function giftOffer(day: string, window: number, c: BalanceConfig = DEFAULT_BALANCE): { currency: Currency; amount: Amount } {
  if (!day) throw new RangeError('Invalid gift day'); integer(window);
  const rewards = c.ads.giftRewards; if (!rewards.length) throw new RangeError('Empty gift rewards');
  let hash = 2166136261; const key = `${day}:${window}`;
  for (let i = 0; i < key.length; i++) { hash ^= key.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  // The generated table widens currency to string; schema validation guarantees the four-currency enum.
  return { ...rewards[(hash >>> 0) % rewards.length] } as { currency: Currency; amount: Amount };
}
export function rollBox(box: Box, pity: number, samples: readonly [number, number], c = DEFAULT_BALANCE): { quality: number; template: string; pity: number } {
  const table = c.boxes[box]; if (!table) throw new RangeError('Unknown box');
  integer(pity, 0, c.boxes.gold.pity - 1); samples.forEach(randomUnit);
  const weights = table.weights.map((w, i) => table.pity && pity >= table.pity - 1 && (i < table.pityMinQuality || i > 4) ? 0 : w);
  let sample = samples[0] * weights.reduce((a, b) => a + b, 0), quality = weights.length - 1;
  for (let i = 0; i < weights.length; i++) { sample -= weights[i]; if (sample < 0) { quality = i; break; } }
  return { quality, template: c.equipment.templates[Math.floor(samples[1] * c.equipment.templates.length)],
    pity: box === 'silver' ? pity : quality >= table.pityMinQuality && quality <= 4 ? 0 : pity + 1 };
}
export function monsterDrop(kind: MonsterKind, depth: number, samples: readonly [number, number], c = DEFAULT_BALANCE): Record<Currency, number> {
  if (!Number.isFinite(depth) || depth < 0 || depth > c.drops.maxDepth || !(kind in c.progression.killXp)) throw new RangeError('Invalid monster drop');
  samples.forEach(randomUnit);
  const base = c.drops.baseCrystal * c.drops.growth ** Math.min(Math.ceil(c.drops.maxDepth / c.drops.depthBand) - 1, Math.floor(depth / c.drops.depthBand));
  return { crystal: Math.round(base * (1 - c.drops.variance + 2 * c.drops.variance * samples[0])), pearl: kind === 'boss' ? c.drops.bossPearl : 0,
    marrow: kind === 'elite' ? c.drops.eliteMarrow : 0,
    core: kind === 'boss' ? c.drops.bossCore : kind === 'elite' && samples[1] < c.drops.eliteCoreChance ? 1 : 0 };
}
