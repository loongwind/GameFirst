import { DEFAULT_BALANCE, attributeValue } from '@abyss-hunter/shared';
import type { Equipment } from '@abyss-hunter/shared';
import type { DiveOptions } from '../../battle/DiveSession';
import { STEP_SECONDS, WEAPON_DEFAULTS } from '../../battle/model';
import type { WeaponKind, WeaponSpec } from '../../battle/model';
import type { LocalState } from './model';

/** Local combat tuning; economic costs and node magnitudes remain in shared balance. */
export const COMBAT_GROWTH = Object.freeze({
  worldUnitsPerMetre: 40,
  equipmentBaseGain: 0.1,
  equipmentQualityGain: 0.25,
  equipmentLevelGain: 0.02,
  collectionReach: 40,
});

type EquippedItem = Equipment & { slot?: number };
const isWeapon = (template: string): template is WeaponKind => Object.prototype.hasOwnProperty.call(WEAPON_DEFAULTS, template);
export const isWeaponTemplate = (template: string): template is WeaponKind => isWeapon(template);
/** Slots 0/1 take weapons; slots 2/3 take auxiliary items. */
export const slotAccepts = (template: string, slot: number): boolean => Number.isInteger(slot) && slot >= 0 && slot <= 3 && (isWeapon(template) ? slot < 2 : slot >= 2);
/** Single source for equipment magnitude: base + quality + level. */
export const equipmentGain = (item: Equipment): number => COMBAT_GROWTH.equipmentBaseGain
  + COMBAT_GROWTH.equipmentQualityGain * item.quality + COMBAT_GROWTH.equipmentLevelGain * (item.level - 1);

export interface CombatProjection {
  options: Omit<DiveOptions, 'diveId'>;
  /** Resolved four-slot loadout, so presentation names exactly what combat uses. */
  slots: ReadonlyArray<(Equipment & { slot?: number }) | undefined>;
  /** Per-tree tech totals, so presentation never re-derives them. */
  tech: Readonly<Record<'attack' | 'survival' | 'oxygen' | 'cargo' | 'special', number>>;
  /** Auxiliary totals by template; magnet already includes its 1-unit base. */
  aux: Readonly<Record<'armor' | 'fin' | 'light' | 'magnet', number>>;
}

/** Project once at departure. LocalDiveService.open restores a saved dive before using these options. */
export function combatProjection(state: LocalState): CombatProjection {
  const unlocked = new Set(state.tech);
  const tech = { attack: 0, survival: 0, oxygen: 0, cargo: 0, special: 0 };
  for (const node of DEFAULT_BALANCE.tech.nodes) if (unlocked.has(node.id)) tech[node.tree as keyof typeof tech] += node.effect;

  const slots: (EquippedItem | undefined)[] = new Array(4);
  const equipped = (state.inventory as EquippedItem[]).filter(item => item.equipped);
  // Saved slot identities take priority over inventory-order fallback for legacy gear.
  for (const item of equipped) {
    if (item.slot == null) continue;
    const weapon = isWeapon(item.template), first = weapon ? 0 : 2;
    const slot = item.slot;
    if (!Number.isInteger(slot) || slot < first || slot > first + 1 || slots[slot]) continue;
    slots[slot] = item;
  }
  for (const item of equipped) {
    if (item.slot != null) continue;
    const first = isWeapon(item.template) ? 0 : 2;
    // Legacy equipment used only an equipped flag; allocate its first compatible free slot.
    const slot = slots[first] ? first + 1 : first;
    if (!slots[slot]) slots[slot] = item;
  }
  let armor = 0, fin = 0, light = 0, magnet = 0;
  for (const item of slots.slice(2)) {
    if (!item) continue;
    const gain = equipmentGain(item);
    if (item.template === 'armor') armor += gain;
    if (item.template === 'fin') fin += gain;
    if (item.template === 'light') light += gain;
    if (item.template === 'magnet') magnet += 1 + gain;
  }

  const attrs = state.attributes;
  const attack = attributeValue('attack', attrs.attack) / DEFAULT_BALANCE.attributes.baseValues[1] * (1 + tech.attack);
  const attackSpeed = attributeValue('attackSpeed', attrs.attackSpeed) / DEFAULT_BALANCE.attributes.baseValues[2];
  const rangeMultiplier = (1 + light) * (1 + tech.special);
  const defaults: WeaponKind[] = ['sonic', 'torpedo'];
  const weapons = defaults.map((fallback, slot): WeaponSpec => {
    const item = slots[slot], kind = item && isWeapon(item.template) ? item.template : fallback;
    const base = WEAPON_DEFAULTS[kind];
    return { ...base,
      damage: base.damage * attack * (1 + (item ? equipmentGain(item) : 0)),
      cooldownTicks: Math.max(1, Math.round(base.cooldownTicks / attackSpeed)),
      range: base.range * rangeMultiplier,
      chainRange: base.chainRange * rangeMultiplier,
      // Enlarged projectile ranges must remain reachable before the projectile expires.
      lifetimeTicks: kind === 'sonic' ? Math.ceil(base.lifetimeTicks * rangeMultiplier)
        : kind === 'torpedo' ? Math.max(base.lifetimeTicks, Math.ceil(base.range * rangeMultiplier / base.speed / STEP_SECONDS))
        : base.lifetimeTicks,
    };
  });
  const options: Omit<DiveOptions, 'diveId'> = {
    maxHp: attributeValue('hp', attrs.hp) * (1 + tech.survival) * (1 + armor),
    cargoCapacity: Math.floor(attributeValue('cargo', attrs.cargo) * (1 + tech.cargo)),
    oxygenCapacity: DEFAULT_BALANCE.attributes.baseValues[5],
    oxygenBaseRate: DEFAULT_BALANCE.attributes.baseValues[5] / attributeValue('oxygen', attrs.oxygen) / (1 + tech.oxygen),
    battle: {
      weapons,
      // 飘字30组 per the active-object spec; the battle default (64) stays for the stress fixture.
      capacities: { texts: 30 },
      // Encounter cadence 15→24 ticks (2.0→1.25/s): measured weapon clear rate is 1.0–1.5/s,
      // so 2.0/s spawns outpace any clear rate and the swarm only grows (LOO-58 60-dive data).
      // Keeps kills ≥ spawns so player skill decides swarm pressure — P2-02 recalibrates.
      spawnIntervalTicks: 24,
      playerSpeed: attributeValue('moveSpeed', attrs.moveSpeed) * COMBAT_GROWTH.worldUnitsPerMetre * (1 + fin),
      pickupRadius: COMBAT_GROWTH.collectionReach * (tech.special + magnet),
    },
  };
  return { options, slots, tech, aux: { armor, fin, light, magnet } };
}

/** Dive options only; presentation that also needs source totals uses combatProjection. */
export function combatLoadout(state: LocalState): Omit<DiveOptions, 'diveId'> {
  return combatProjection(state).options;
}
