import { DEFAULT_BALANCE } from '@abyss-hunter/shared';
import type { Equipment } from '@abyss-hunter/shared';
import { STEP_SECONDS, weaponSpec } from '../battle/model';
import type { WeaponKind, WeaponSpec } from '../battle/model';
import type { LocalState } from '../services/local/model';
import { COMBAT_GROWTH, combatProjection, equipmentGain, isWeaponTemplate, slotAccepts } from '../services/local/CombatLoadout';
import { EQUIPMENT_NAMES } from './HarborModel';

/** Presentation-only derivations. Every number comes from combatProjection so the panel cannot drift from battle. */
const DEFAULT_WEAPONS: readonly WeaponKind[] = ['sonic', 'torpedo'];
const worldToMetres = (units: number): number => units / COMBAT_GROWTH.worldUnitsPerMetre;
const int = (value: number): string => String(Math.round(value));
const f1 = (value: number): string => value.toFixed(1);
const f2 = (value: number): string => value.toFixed(2);
const percent = (fraction: number): string => `+${Math.round(fraction * 100)}%`;

/** Default one-decimal distance collapses a 1% step, so widen the pair only when rounding would hide it. */
function pair(from: number, to: number, digits: number): { from: string; to: string; unchanged: boolean } {
  let places = digits;
  if (from !== to && from.toFixed(places) === to.toFixed(places)) places += 1;
  return { from: from.toFixed(places), to: to.toFixed(places), unchanged: from.toFixed(places) === to.toFixed(places) };
}
const delta = (label: string, from: number, to: number, digits: number, unit: string): StatDelta => ({ label, unit, ...pair(from, to, digits) });

export interface WeaponReadout {
  slot: number; kind: WeaponKind; name: string; damage: number;
  /** Seconds between shots at the 30 Hz battle step. */
  interval: number; rate: number; range: number; gain: number; equipped: boolean; mechanic: string;
}
export interface CombatReadout {
  maxHp: number; moveSpeed: number; cargoCapacity: number;
  oxygenPerSecond: number; oxygenSeconds: number;
  pickupRadius: number; pickupTech: number; pickupMagnet: number;
  weapons: readonly [WeaponReadout, WeaponReadout];
  tech: ReturnType<typeof combatProjection>['tech'];
  aux: ReturnType<typeof combatProjection>['aux'];
}
export interface AttributePreview extends StatDelta {}
export interface StatDelta { label: string; from: string; to: string; unit: string; unchanged: boolean }
export interface ItemDetail { kind: 'weapon' | 'aux'; gain: number; lines: string[] }
export interface SlotReadout { title: string; line1: string; line2: string; empty: boolean }
export type EquipComparison =
  | { compatible: false; reason: string }
  | { compatible: true; gain: number; note: string; deltas: StatDelta[] };

function mechanic(kind: WeaponKind, spec: WeaponSpec): string {
  switch (kind) {
    case 'sonic': return '环型扩散 · 覆盖周身敌群';
    case 'torpedo': return '直线穿透 · 贯穿直线上的敌人';
    case 'arc': return `连锁 ${spec.maxJumps} 跳 · 连锁距离 ${f1(worldToMetres(spec.chainRange))} 米`;
    case 'mine': return `范围引爆 · 爆炸 ${f1(worldToMetres(spec.radius))} 米 · 触发 ${f1(worldToMetres(spec.triggerRadius))} 米`;
  }
}

export function combatReadout(state: LocalState): CombatReadout {
  const projection = combatProjection(state), options = projection.options, battle = options.battle;
  if (!battle) throw new Error('Combat projection is missing battle options');
  const weapons = DEFAULT_WEAPONS.map((fallback, slot): WeaponReadout => {
    const input = (battle.weapons ?? [])[slot] ?? { kind: fallback };
    const spec: WeaponSpec = weaponSpec(input), item = projection.slots[slot];
    const kind = item && isWeaponTemplate(item.template) ? item.template : fallback;
    const interval = spec.cooldownTicks * STEP_SECONDS;
    return { slot, kind, name: EQUIPMENT_NAMES[kind] ?? kind, damage: spec.damage, interval, rate: 1 / interval,
      range: worldToMetres(spec.range), gain: item ? equipmentGain(item) : 0, equipped: !!item, mechanic: mechanic(kind, spec) };
  }) as [WeaponReadout, WeaponReadout];
  const oxygenPerSecond = options.oxygenBaseRate ?? 0, oxygenCapacity = options.oxygenCapacity ?? 0;
  return {
    maxHp: options.maxHp ?? 0, moveSpeed: worldToMetres(battle.playerSpeed ?? 0), cargoCapacity: options.cargoCapacity ?? 0,
    oxygenPerSecond, oxygenSeconds: oxygenPerSecond > 0 ? oxygenCapacity / oxygenPerSecond : 0,
    pickupRadius: worldToMetres(battle.pickupRadius ?? 0),
    pickupTech: worldToMetres(COMBAT_GROWTH.collectionReach * projection.tech.special),
    pickupMagnet: worldToMetres(COMBAT_GROWTH.collectionReach * projection.aux.magnet),
    weapons, tech: projection.tech, aux: projection.aux,
  };
}

/** Fixed summary block above the upgrade rows; each line stays under one 375-unit row. */
export function summaryLines(state: LocalState): string[] {
  const s = combatReadout(state);
  return [
    `生命 ${int(s.maxHp)} · 移速 ${f1(s.moveSpeed)} 米/秒 · 舱容 ${int(s.cargoCapacity)}`,
    `氧气 ${f2(s.oxygenPerSecond)}/秒 · 续航 ${int(s.oxygenSeconds)} 秒`,
    `主1 ${s.weapons[0].name} · 伤害 ${int(s.weapons[0].damage)} · 间隔 ${f2(s.weapons[0].interval)} 秒 · ${f2(s.weapons[0].rate)} 次/秒 · 射程 ${f1(s.weapons[0].range)} 米`,
    `主2 ${s.weapons[1].name} · 伤害 ${int(s.weapons[1].damage)} · 间隔 ${f2(s.weapons[1].interval)} 秒 · ${f2(s.weapons[1].rate)} 次/秒 · 射程 ${f1(s.weapons[1].range)} 米`,
  ];
}

/** Pickup starts at zero by design; show each additive source instead of flagging it as an anomaly. */
export function sourceLines(state: LocalState): string[] {
  const s = combatReadout(state);
  return [
    `拾取范围：基础 0 米 + 特殊科技 ${f2(s.pickupTech)} 米 + 磁吸器 ${f2(s.pickupMagnet)} 米 = ${f1(s.pickupRadius)} 米`,
    '数值构成：强化属性 × 科技加成 × 装备增益；升级只改变强化部分',
  ];
}

/** Upgrade row preview: the real derived value before and after the next level. */
export function attributePreview(state: LocalState, id: string): AttributePreview {
  const level = state.attributes[id] ?? 0, maxed = level >= DEFAULT_BALANCE.attributes.maxLevel;
  const next = maxed ? level : level + 1;
  const before = combatReadout(state), after = combatReadout({ ...state, attributes: { ...state.attributes, [id]: next } });
  switch (id) {
    case 'hp': return { label: '生命', unit: '', ...pair(before.maxHp, after.maxHp, 0) };
    case 'attack': return { label: '主武器伤害', unit: '', ...pair(before.weapons[0].damage, after.weapons[0].damage, 0) };
    case 'attackSpeed': return { label: '攻击间隔', unit: ' 秒', ...pair(before.weapons[0].interval, after.weapons[0].interval, 2) };
    case 'moveSpeed': return { label: '移速', unit: ' 米/秒', ...pair(before.moveSpeed, after.moveSpeed, 1) };
    case 'cargo': return { label: '舱容', unit: '', ...pair(before.cargoCapacity, after.cargoCapacity, 0) };
    case 'oxygen': return { label: '氧气消耗', unit: '/秒', ...pair(before.oxygenPerSecond, after.oxygenPerSecond, 2) };
    default: return { label: id, unit: '', ...pair(0, 0, 0) };
  }
}

/** One-line equip comparison shared by the panel and its smoke assertions. */
export function comparisonLine(comparison: EquipComparison, slot: number): string {
  if (!comparison.compatible) return comparison.reason;
  return `装到槽${slot + 1}后：${comparison.deltas.map(d => `${d.label === '攻击间隔' ? '间隔' : d.label} ${d.from}→${d.to}${d.unit.replace(/^ /, '')}`).join(' · ')}`;
}

/** Pure hypothetical equip; mirrors combatProjection's slot rules without mutating the snapshot. */
export function equippedState(state: LocalState, itemId: string, slot: number): LocalState | undefined {
  const item = state.inventory.find(entry => entry.id === itemId);
  if (!item || !slotAccepts(item.template, slot)) return undefined;
  const inventory = state.inventory.map(entry => {
    if (entry.id === itemId) return { ...entry, equipped: true, slot };
    const current = entry as Equipment & { slot?: number };
    if (current.equipped && current.slot === slot) return { ...entry, equipped: false, slot: undefined };
    return entry;
  });
  return { ...state, inventory };
}

export function equippedSlot(state: LocalState, itemId: string): number | undefined {
  const index = combatProjection(state).slots.findIndex(item => item?.id === itemId);
  return index < 0 ? undefined : index;
}

function gainNote(item: Equipment): string {
  return `装备增益 ${percent(equipmentGain(item))}（基础 10% + 品质 ${25 * item.quality}% + 等级 ${2 * (item.level - 1)}%）`;
}

export function itemDetail(state: LocalState, item: Equipment): ItemDetail {
  const gain = equipmentGain(item);
  if (isWeaponTemplate(item.template)) {
    const slot = equippedSlot(state, item.id) ?? 0;
    const preview = equippedState(state, item.id, slot) ?? state;
    const weapon = combatReadout(preview).weapons[slot] ?? combatReadout(preview).weapons[0];
    return { kind: 'weapon', gain, lines: [
      `伤害 ${int(weapon.damage)} · 间隔 ${f2(weapon.interval)} 秒 · 射程 ${f1(weapon.range)} 米`,
      weapon.mechanic,
      gainNote(item),
    ] };
  }
  const effect: Record<string, string> = {
    light: `射程 ${percent(gain)}（连锁距离同步）`,
    fin: `移速 ${percent(gain)}`,
    armor: `生命 ${percent(gain)}`,
    magnet: `拾取范围 +${f2(1 + gain)} 米（含基础 1 米）`,
  };
  return { kind: 'aux', gain, lines: [effect[item.template] ?? '未知增益', gainNote(item)] };
}

/** Compact row summary so the backpack is judgeable without opening a detail. */
export function itemKeyStats(state: LocalState, item: Equipment): string {
  const gain = equipmentGain(item);
  if (isWeaponTemplate(item.template)) {
    const slot = equippedSlot(state, item.id) ?? 0;
    const preview = equippedState(state, item.id, slot) ?? state;
    const weapon = combatReadout(preview).weapons[slot] ?? combatReadout(preview).weapons[0];
    return `伤害 ${int(weapon.damage)} · 间隔 ${f2(weapon.interval)} 秒 · ${percent(gain)}`;
  }
  switch (item.template) {
    case 'light': return `射程 ${percent(gain)} · 连锁同步`;
    case 'fin': return `移速 ${percent(gain)}`;
    case 'armor': return `生命 ${percent(gain)}`;
    case 'magnet': return `拾取 +${f1(1 + gain)} 米`;
    default: return `增益 ${percent(gain)}`;
  }
}

export function slotReadout(state: LocalState, slot: number): SlotReadout {
  const projection = combatProjection(state), item = projection.slots[slot];
  if (slot < 2) {
    const readout = combatReadout(state).weapons[slot];
    return { title: readout.name, line1: `${readout.equipped ? '' : '默认 · '}伤害 ${int(readout.damage)}`, line2: `间隔 ${f2(readout.interval)} 秒`, empty: !readout.equipped };
  }
  if (!item) return { title: `辅件 ${slot - 1}`, line1: '未装配', line2: '', empty: true };
  const gain = equipmentGain(item);
  const line1 = item.template === 'magnet' ? `拾取 +${f1(1 + gain)} 米` : item.template === 'light' ? `射程 ${percent(gain)}`
    : item.template === 'fin' ? `移速 ${percent(gain)}` : item.template === 'armor' ? `生命 ${percent(gain)}` : `增益 ${percent(gain)}`;
  return { title: EQUIPMENT_NAMES[item.template] ?? item.template, line1, line2: '', empty: false };
}

/** Compare against the slot the player is about to write to; incompatible types never produce a bogus delta. */
export function equipComparison(state: LocalState, itemId: string, slot: number): EquipComparison {
  const item = state.inventory.find(entry => entry.id === itemId);
  if (!item) return { compatible: false, reason: '该装备已不在收纳舱。' };
  if (!slotAccepts(item.template, slot)) {
    return { compatible: false, reason: `与当前槽不兼容：主武器只能装到 1/2 号槽，辅件只能装到 3/4 号槽。` };
  }
  const next = equippedState(state, itemId, slot);
  if (!next) return { compatible: false, reason: '无法装配到当前槽。' };
  const before = combatReadout(state), after = combatReadout(next), gain = equipmentGain(item);
  if (isWeaponTemplate(item.template)) {
    const a = before.weapons[slot], b = after.weapons[slot];
    return { compatible: true, gain, note: gainNote(item), deltas: [
      delta('伤害', a.damage, b.damage, 0, ''),
      delta('攻击间隔', a.interval, b.interval, 2, ' 秒'),
      delta('射程', a.range, b.range, 1, ' 米'),
    ] };
  }
  if (item.template === 'light') {
    return { compatible: true, gain, note: `${gainNote(item)}，连锁距离同步`, deltas: [
      delta('射程', before.weapons[0].range, after.weapons[0].range, 1, ' 米'),
      delta('射程', before.weapons[1].range, after.weapons[1].range, 1, ' 米'),
    ] };
  }
  if (item.template === 'fin') return { compatible: true, gain, note: gainNote(item), deltas: [delta('移速', before.moveSpeed, after.moveSpeed, 1, ' 米/秒')] };
  if (item.template === 'armor') return { compatible: true, gain, note: gainNote(item), deltas: [delta('生命', before.maxHp, after.maxHp, 0, '')] };
  if (item.template === 'magnet') return { compatible: true, gain, note: `${gainNote(item)}，拾取基础为 0`, deltas: [delta('拾取范围', before.pickupRadius, after.pickupRadius, 1, ' 米')] };
  return { compatible: false, reason: '未知装备类型。' };
}

