import { DEFAULT_BALANCE, amount, integer, levelForXp, validateEquipment } from '@abyss-hunter/shared';
import type { Equipment, Wallet, Box } from '@abyss-hunter/shared';
import { EVENT_NAMES } from './TelemetryBus';
import type { LocalEvent, EventName } from './TelemetryBus';
import { initialObjectives, validateObjectives } from './Objectives';
import type { Objectives } from './Objectives';

export type AdSlot = 'gift' | 'blessing' | 'sonar' | 'silver' | 'gold' | 'rescue' | 'oxygen';
export interface AdContext { eventId?: string; diveId?: string; choice?: string }
export interface AdIntent extends AdContext {
  token: string; slot: AdSlot; day: string; issuedAt: number; showUntil: number; claimUntil: number;
  configVersion: string; status: 'reserved' | 'completed' | 'claimed' | 'cancelled';
}
export interface LocalSettlement {
  diveId: string; reason: 'return' | 'death' | 'disconnect'; cargo: Record<keyof Wallet, number>; xp?: number;
  activeSeconds: number; depth: number;
}
export interface LocalState {
  objectives: Objectives;
  configVersion: string; revision: number; wallet: Wallet; totalXp: number; playerLevel: number;
  attributes: Record<string, number>; tech: string[]; inventory: Equipment[]; tickets: number; goldPity: number;
  receipts: Record<string, { fingerprint: string; result: CommandResult }>;
  settlements: Record<string, string>; activeDive: unknown | null;
  daily: Record<string, Partial<Record<AdSlot, number>>>;
  intents: Record<string, AdIntent>; pendingAd: string | null; consumedEvents: string[];
  buffs: { blessing: { choice: string; expiresAt: number } | null; sonarUntil: number };
  events: LocalEvent[];
}
export interface CommandResult { revision: number; itemIds?: string[]; token?: string; effect?: string; duplicate?: boolean }
export type Action = { opId: string } & (
  { type: 'dive.settle'; settlement: LocalSettlement } |
  { type: 'attribute.upgrade'; attribute: string } |
  { type: 'tech.unlock'; nodeId: string } |
  { type: 'equipment.upgrade'; itemId: string; payment: 'marrow' | 'ticket' } |
  { type: 'equipment.synthesize'; itemIds: string[]; mainId: string } |
  { type: 'equipment.equip'; itemId: string; slot: number } |
  { type: 'equipment.lock'; itemId: string; locked: boolean } |
  { type: 'box.draw'; box: Box; count: 1 | 10 } |
  { type: 'ad.prepare'; slot: AdSlot; context?: AdContext } |
  { type: 'ad.complete' | 'ad.claim' | 'ad.cancel'; token: string } |
  { type: 'task.claim'; taskId: string } |
  { type: 'tutorial.replay' } |
  { type: 'poster.dismiss'; depth: number } |
  { type: 'telemetry.record'; name: EventName; properties: LocalEvent['properties'] }
);
export const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
export const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export function identifier(value: string): void {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(value) || ['__proto__', 'constructor', 'prototype'].includes(value)) throw new RangeError('Invalid identifier');
}
export function initialState(): LocalState {
  return { configVersion: DEFAULT_BALANCE.configVersion, revision: 0, wallet: { crystal: '0', pearl: '0', marrow: '0', core: '0' }, totalXp: 0, playerLevel: 1,
    attributes: Object.fromEntries(DEFAULT_BALANCE.attributes.ids.map(id => [id, 0])), tech: [], inventory: [], tickets: 0, goldPity: 0,
    receipts: {}, settlements: {}, activeDive: null, daily: {}, intents: {}, pendingAd: null, consumedEvents: [], buffs: { blessing: null, sonarUntil: 0 }, events: [], objectives: initialObjectives() };
}
export function validateLocalState(input: unknown): asserts input is LocalState {
  const s = input as LocalState;
  if (!s || s.configVersion !== DEFAULT_BALANCE.configVersion) throw new RangeError('Unsupported configVersion');
  integer(s.revision); integer(s.totalXp); if (s.playerLevel !== levelForXp(s.totalXp)) throw new RangeError('Invalid player level');
  for (const key of ['crystal', 'pearl', 'marrow', 'core'] as const) amount(s.wallet[key]);
  for (const key of DEFAULT_BALANCE.attributes.ids) integer(s.attributes[key], 0, DEFAULT_BALANCE.attributes.maxLevel);
  if (!Array.isArray(s.tech) || s.tech.some(id => !DEFAULT_BALANCE.tech.nodes.some(n => n.id === id))) throw new RangeError('Invalid tech');
  if (!Array.isArray(s.inventory) || new Set(s.inventory.map(i => i.id)).size !== s.inventory.length || s.inventory.length > DEFAULT_BALANCE.equipment.inventoryLimit) throw new RangeError('Invalid inventory');
  s.inventory.forEach(i => validateEquipment(i)); integer(s.tickets); integer(s.goldPity, 0, DEFAULT_BALANCE.boxes.gold.pity - 1);
  for (const collection of [s.receipts, s.settlements, s.daily, s.intents]) if (!collection || typeof collection !== 'object' || Array.isArray(collection)) throw new RangeError('Invalid ledger');
  for (const counters of Object.values(s.daily)) for (const [slot, count] of Object.entries(counters)) {
    if (!own(DEFAULT_BALANCE.ads.slots, slot)) throw new RangeError('Invalid ad slot'); integer(count!, 0, DEFAULT_BALANCE.ads.slots[slot as AdSlot]);
  }
  if (s.pendingAd !== null && (!own(s.intents, s.pendingAd) || !['reserved', 'completed'].includes(s.intents[s.pendingAd].status))) throw new RangeError('Invalid pending ad');
  if (!s.buffs || !Array.isArray(s.events) || !Array.isArray(s.consumedEvents) || (s.activeDive !== null && typeof s.activeDive !== 'object')) throw new RangeError('Invalid local snapshot');
  integer(s.buffs.sonarUntil);
  if (s.buffs.blessing) { identifier(s.buffs.blessing.choice); integer(s.buffs.blessing.expiresAt); }
  for (const e of s.events) if (!e || !EVENT_NAMES.includes(e.name) || !e.id || !Number.isFinite(e.at) || !e.properties) throw new RangeError('Invalid telemetry');
  // Migration follows the original checksum check, preserving older two-slot saves.
  if (!own(s, 'objectives')) s.objectives = initialObjectives(Object.keys(s.settlements).length > 0);
  validateObjectives(s.objectives);
}
