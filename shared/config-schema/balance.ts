import { BALANCE_SCHEMA, BALANCE_TABLE } from '../config/generated.js';

export type BalanceConfig = typeof BALANCE_TABLE;
type Schema = { type?: string; enum?: unknown[]; properties?: Record<string, Schema>; required?: string[];
  additionalProperties?: boolean; minimum?: number; maximum?: number; items?: Schema;
  minItems?: number; maxItems?: number; minLength?: number; maxLength?: number; pattern?: string };

/** Small portable subset used by balance.schema.json; no platform or AJV dependency in client. */
function validate(value: unknown, s: Schema, path: string): void {
  const fail = (): never => { throw new RangeError(`Invalid balance config: ${path}`); };
  if (s.enum && !s.enum.includes(value)) fail();
  if (s.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
    const object = value as Record<string, unknown>;
    for (const key of s.required ?? []) if (!Object.prototype.hasOwnProperty.call(object, key)) fail();
    for (const key of Object.keys(object)) {
      if (!s.properties?.[key]) { if (s.additionalProperties === false) fail(); }
      else validate(object[key], s.properties[key], `${path}.${key}`);
    }
  } else if (s.type === 'array') {
    if (!Array.isArray(value)) fail();
    const list = value as unknown[];
    if (list.length < (s.minItems ?? 0) || list.length > (s.maxItems ?? Infinity)) fail();
    for (const item of list) validate(item, s.items!, `${path}[]`);
  } else if (s.type === 'number' || s.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) ||
      (s.type === 'integer' && !Number.isSafeInteger(value)) || value < (s.minimum ?? -Infinity) || value > (s.maximum ?? Infinity)) fail();
  } else if (s.type === 'string') {
    if (typeof value !== 'string' || value.length < (s.minLength ?? 0) || value.length > (s.maxLength ?? Infinity) || (s.pattern && !new RegExp(s.pattern).test(value))) fail();
  } else if (s.type === 'boolean' && typeof value !== 'boolean') fail();
}

export function validateBalanceConfig(input: unknown): BalanceConfig {
  validate(input, BALANCE_SCHEMA as Schema, 'balance');
  const c = input as BalanceConfig;
  const unique = (list: string[]): void => { if (new Set(list).size !== list.length) throw new RangeError('Duplicate config id'); };
  unique(c.attributes.ids); unique(c.equipment.templates); unique(c.tech.trees); unique(c.tech.nodes.map(n => n.id));
  if (c.attributes.growthNumerator < c.attributes.growthDenominator) throw new RangeError('Decreasing price');
  if (c.boxes.gold.pity < 1) throw new RangeError('Gold pity must permit a counter');
  const maxDrop = Math.round(c.drops.baseCrystal * c.drops.growth ** Math.floor(c.drops.maxDepth / c.drops.depthBand) * (1 + c.drops.variance));
  if (!Number.isSafeInteger(maxDrop)) throw new RangeError('Drop curve exceeds exact integer range');
  for (const box of Object.values(c.boxes)) {
    if (box.weights.reduce((a, b) => a + b, 0) !== 100 || box.weights.slice(box.pityMinQuality, 5).reduce((a, b) => a + b, 0) <= 0) throw new RangeError('Invalid box weights');
  }
  c.equipment.maxLevels.forEach((v, i, a) => { if (i && v < a[i - 1]) throw new RangeError('Decreasing equipment cap'); });
  const nodes = new Map(c.tech.nodes.map(n => [n.id, n]));
  const done = new Set<string>(), visiting = new Set<string>();
  const visit = (id: string): void => {
    if (done.has(id)) return;
    const node = nodes.get(id);
    if (!node || visiting.has(id) || !c.tech.trees.includes(node.tree)) throw new RangeError('Invalid tech prerequisite');
    visiting.add(id); node.requires.forEach(visit); visiting.delete(id); done.add(id);
  };
  nodes.forEach(n => visit(n.id));
  for (const tree of c.tech.trees) if (c.tech.nodes.filter(n => n.tree === tree).length !== 20) throw new RangeError('Tech tree requires 20 nodes');
  if (c.ads.sonarRenewWindowMs > c.ads.sonarDurationMs || c.ads.showWindowMs > c.ads.claimWindowMs) throw new RangeError('Invalid ad window');
  return c;
}

export function deepFreeze<T>(object: T): Readonly<T> {
  if (object && typeof object === 'object') { Object.values(object).forEach(deepFreeze); Object.freeze(object); }
  return object;
}
export const DEFAULT_BALANCE: BalanceConfig = deepFreeze(validateBalanceConfig(BALANCE_TABLE)) as BalanceConfig;
