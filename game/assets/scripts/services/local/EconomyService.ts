import { DEFAULT_BALANCE, addMoney, subtractMoney, amount, integer, levelForXp, xpThreshold, upgradeCost, equipmentUpgradeCost, synthesize, rollBox, randomUnit } from '@abyss-hunter/shared';
import type { Currency, Equipment, Box, Snapshot } from '@abyss-hunter/shared';
import type { SaveService } from './SaveService';
import { TelemetryBus } from './TelemetryBus';
import type { EventName, LocalEvent, TelemetryBatch } from './TelemetryBus';
import { copy, own, identifier, initialState, validateLocalState } from './model';
import type { Action, LocalState, CommandResult, AdSlot, AdContext, AdIntent } from './model';

export interface EconomyOptions {
  now?: () => number; random?: () => number;
  /** Local-only eligibility hooks. P3 replaces dispatch with remote authoritative commands. */
  adEligible?: (slot: AdSlot, context: AdContext) => boolean;
  taskEligible?: (taskId: string) => boolean;
}
export interface CommandDispatcher { dispatch(action: Action): CommandResult }
export function businessDay(now: number): string {
  integer(now); return new Date(now + DEFAULT_BALANCE.ads.timezoneOffsetMinutes * 60_000).toISOString().slice(0, 10);
}
function fingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(fingerprint).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${fingerprint((value as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

/** Every asset mutation is copy → validate → synchronous durable write → publish. */
export class EconomyService implements CommandDispatcher {
  readonly telemetry = new TelemetryBus();
  private state!: LocalState;
  private sequence = 0;
  private epoch = 1;
  private status: 'fresh' | 'ok' | 'recovered' = 'fresh';
  private readonly now: () => number;
  private readonly random: () => number;
  constructor(private readonly save: SaveService, private readonly options: EconomyOptions = {}) {
    this.now = options.now ?? Date.now; this.random = options.random ?? Math.random; this.reload();
  }
  get snapshot(): LocalState { return copy(this.state); }
  get saveStatus(): string { return this.status; }
  activeBenefits(): { yield: number; oxygen: number; cargo: number; sonar: boolean } {
    const now = this.now(); integer(now);
    const result = { yield: 1, oxygen: 1, cargo: 1, sonar: this.state.buffs.sonarUntil > now };
    const blessing = this.state.buffs.blessing;
    if (blessing && blessing.expiresAt > now) {
      const index = DEFAULT_BALANCE.ads.blessingChoices.indexOf(blessing.choice);
      if (index >= 0) result[blessing.choice as 'yield' | 'oxygen' | 'cargo'] = DEFAULT_BALANCE.ads.blessingMultipliers[index];
    }
    return result;
  }
  dispatch(action: Action): CommandResult {
    this.reload(); identifier(action.opId);
    const signature = fingerprint(action);
    if (own(this.state.receipts, action.opId)) {
      const old = this.state.receipts[action.opId];
      if (old.fingerprint !== signature) throw new Error('OP_ID_REUSED'); return copy(old.result);
    }
    const next = copy(this.state), now = this.now(); integer(now);
    const events: LocalEvent[] = [];
    const emit = (name: EventName, properties: LocalEvent['properties']): void => {
      const event = { id: `${action.opId}:${events.length}`, name, at: now, properties };
      events.push(event); next.events.push(event);
    };
    const result: CommandResult = { revision: next.revision + 1 };
    const spend = (currency: Currency, cost: string): void => { next.wallet[currency] = subtractMoney(next.wallet[currency], cost); };
    const credit = (currency: Currency, gain: string): void => { next.wallet[currency] = addMoney(next.wallet[currency], gain); };
    const xp = (gain: number): void => {
      integer(gain); next.totalXp = Math.min(xpThreshold(DEFAULT_BALANCE.progression.maxLevel), next.totalXp + gain);
      integer(next.totalXp); next.playerLevel = levelForXp(next.totalXp);
    };
    const item = (id: string): Equipment => {
      identifier(id); const found = next.inventory.find(i => i.id === id); if (!found) throw new Error('ITEM_NOT_FOUND'); return found;
    };
    const draw = (box: Box, count: number): string[] => {
      if (!own(DEFAULT_BALANCE.boxes, box)) throw new Error('INVALID_BOX');
      const ids: string[] = [];
      for (let i = 0; i < count; i++) {
        const roll = rollBox(box, next.goldPity, [this.random(), this.random()]); next.goldPity = roll.pity;
        if (roll.quality === 5) { next.tickets++; integer(next.tickets); continue; }
        if (next.inventory.length >= DEFAULT_BALANCE.equipment.inventoryLimit) throw new Error('INVENTORY_FULL');
        const id = `${action.opId}.${i}`; identifier(id);
        if (next.inventory.some(e => e.id === id)) throw new Error('ITEM_ID_CONFLICT');
        next.inventory.push({ id, template: roll.template, quality: roll.quality, level: 1, equipped: false, locked: false, invested: { marrow: '0', tickets: 0 } }); ids.push(id);
      }
      return ids;
    };
    const intent = (token: string): AdIntent => {
      identifier(token); if (!own(next.intents, token)) throw new Error('AD_INTENT_NOT_FOUND'); return next.intents[token];
    };
    switch (action.type) {
      case 'dive.settle': {
        const s = action.settlement; identifier(s.diveId);
        if (!['return', 'death', 'disconnect'].includes(s.reason) || !Number.isFinite(s.activeSeconds) || s.activeSeconds < 0 || !Number.isFinite(s.depth) || s.depth < 0) throw new RangeError('Invalid settlement');
        const settlementSignature = fingerprint(s);
        if (own(next.settlements, s.diveId)) {
          if (next.settlements[s.diveId] !== settlementSignature) throw new Error('DIVE_SETTLEMENT_CONFLICT'); result.duplicate = true; break;
        }
        for (const currency of ['crystal', 'pearl', 'marrow', 'core'] as const) {
          integer(s.cargo[currency]); credit(currency, String(s.reason === 'death' && currency === 'crystal' ? 0 : s.cargo[currency]));
        }
        xp(s.xp ?? 0); next.settlements[s.diveId] = settlementSignature;
        emit('deposit_done', { amount: s.reason === 'death' ? '0' : String(s.cargo.crystal), is_first: Object.keys(next.settlements).length === 1 });
        emit('dive_end', { end_reason: s.reason === 'return' ? 'deposit' : s.reason, max_depth: s.depth, cargo_amount: s.reason === 'death' ? 0 : s.cargo.crystal, duration_s: s.activeSeconds });
        break;
      }
      case 'attribute.upgrade': {
        if (!DEFAULT_BALANCE.attributes.ids.includes(action.attribute)) throw new Error('INVALID_ATTRIBUTE');
        const level = next.attributes[action.attribute]; spend('crystal', upgradeCost(level));
        if ((level + 1) % DEFAULT_BALANCE.attributes.coreMilestone === 0) spend('core', String(DEFAULT_BALANCE.attributes.coreCost));
        next.attributes[action.attribute]++; break;
      }
      case 'tech.unlock': {
        const node = DEFAULT_BALANCE.tech.nodes.find(n => n.id === action.nodeId);
        if (!node || next.tech.includes(node.id)) throw new Error('INVALID_TECH');
        if (node.requires.some(id => !next.tech.includes(id))) throw new Error('PREREQUISITE');
        spend('crystal', node.crystal); spend('core', node.core); next.tech.push(node.id);
        emit('tech_unlock', { tree: node.tree, node_id: node.id }); break;
      }
      case 'equipment.upgrade': {
        const equipment = item(action.itemId), cost = equipmentUpgradeCost(equipment);
        if (action.payment === 'marrow') { spend('marrow', cost); equipment.invested.marrow = addMoney(equipment.invested.marrow, cost); }
        else if (action.payment === 'ticket') { if (next.tickets < 1) throw new Error('INSUFFICIENT_TICKETS'); next.tickets--; equipment.invested.tickets++; }
        else throw new Error('INVALID_PAYMENT');
        equipment.level++; break;
      }
      case 'equipment.synthesize': {
        const inputs = action.itemIds.map(item), output = synthesize(inputs, action.mainId, `${action.opId}.s`);
        next.inventory = next.inventory.filter(i => !action.itemIds.includes(i.id)); next.inventory.push(output.item);
        credit('marrow', output.refund.marrow); next.tickets += output.refund.tickets; integer(next.tickets);
        result.itemIds = [output.item.id]; emit('equip_synthesize', { quality: output.item.quality, from_quality: output.item.quality - 1 }); break;
      }
      case 'equipment.equip': {
        const equipment = item(action.itemId); integer(action.slot, 0, 3);
        if (next.playerLevel < DEFAULT_BALANCE.equipment.unlockLevel || action.slot === 3 && next.playerLevel < DEFAULT_BALANCE.equipment.fourthSlotLevel) throw new Error('LEVEL_LOCKED');
        const weapon = DEFAULT_BALANCE.equipment.templates.indexOf(equipment.template) < 4;
        if ((action.slot < 2) !== weapon) throw new Error('INVALID_SLOT');
        // Persist the slot with each equipped instance; old slot occupants are removed atomically.
        for (const i of next.inventory as (Equipment & { slot?: number })[]) if (i.slot === action.slot || i.id === equipment.id) { i.equipped = false; delete i.slot; }
        equipment.equipped = true; (equipment as Equipment & { slot?: number }).slot = action.slot;
        emit('equip_change', { slot: action.slot, quality: equipment.quality }); break;
      }
      case 'equipment.lock': { if (typeof action.locked !== 'boolean') throw new Error('INVALID_LOCK'); item(action.itemId).locked = action.locked; break; }
      case 'box.draw': {
        if (!own(DEFAULT_BALANCE.boxes, action.box) || ![1, 10].includes(action.count)) throw new Error('INVALID_DRAW');
        if (next.playerLevel < DEFAULT_BALANCE.equipment.unlockLevel) throw new Error('LEVEL_LOCKED');
        spend('pearl', String(DEFAULT_BALANCE.boxes[action.box].price * action.count)); result.itemIds = draw(action.box, action.count); break;
      }
      case 'ad.prepare': {
        if (!own(DEFAULT_BALANCE.ads.slots, action.slot)) throw new Error('INVALID_AD_SLOT');
        if (next.pendingAd) throw new Error('AD_PENDING');
        const context = action.context ?? {}, day = businessDay(now);
        const used = next.daily[day]?.[action.slot] ?? 0;
        if (used >= DEFAULT_BALANCE.ads.slots[action.slot]) throw new Error('AD_DAILY_LIMIT');
        if (['rescue', 'oxygen'].includes(action.slot)) {
          identifier(context.eventId!); identifier(context.diveId!);
          if (next.consumedEvents.includes(`${action.slot}:${context.eventId}`) || !this.options.adEligible?.(action.slot, context)) throw new Error('AD_INELIGIBLE');
        } else if (next.playerLevel < DEFAULT_BALANCE.ads.unlockLevel) throw new Error('LEVEL_LOCKED');
        if (action.slot === 'blessing' && !DEFAULT_BALANCE.ads.blessingChoices.includes(context.choice!)) throw new Error('INVALID_BLESSING');
        if (action.slot === 'sonar' && next.buffs.sonarUntil - now > DEFAULT_BALANCE.ads.sonarRenewWindowMs) throw new Error('SONAR_ACTIVE');
        const token = `${action.opId}.token`; identifier(token);
        next.intents[token] = { ...context, token, slot: action.slot, day, issuedAt: now, showUntil: now + DEFAULT_BALANCE.ads.showWindowMs,
          claimUntil: now + DEFAULT_BALANCE.ads.claimWindowMs, configVersion: next.configVersion, status: 'reserved' };
        next.pendingAd = token; result.token = token; break;
      }
      case 'ad.complete': {
        const ad = intent(action.token);
        if (ad.status === 'completed' || ad.status === 'claimed') break;
        if (ad.status !== 'reserved' || now > ad.showUntil) throw new Error('AD_EXPIRED');
        ad.status = 'completed'; break;
      }
      case 'ad.cancel': {
        const ad = intent(action.token);
        if (ad.status === 'claimed' || ad.status === 'cancelled') break;
        if (ad.status === 'completed' && now <= ad.claimUntil) throw new Error('AD_CLAIM_PENDING');
        ad.status = 'cancelled'; next.pendingAd = null; break;
      }
      case 'ad.claim': {
        const ad = intent(action.token);
        if (ad.status === 'claimed') { result.duplicate = true; break; }
        if (ad.status !== 'completed' || now > ad.claimUntil) throw new Error('AD_NOT_COMPLETED_OR_EXPIRED');
        if (['rescue', 'oxygen'].includes(ad.slot) && !this.options.adEligible?.(ad.slot, ad)) throw new Error('AD_INELIGIBLE');
        const counters = next.daily[ad.day] ?? (next.daily[ad.day] = {});
        if ((counters[ad.slot] ?? 0) >= DEFAULT_BALANCE.ads.slots[ad.slot]) throw new Error('AD_DAILY_LIMIT');
        switch (ad.slot) {
          case 'gift': { const rewards = DEFAULT_BALANCE.ads.giftRewards, gift = rewards[Math.floor(randomUnit(this.random()) * rewards.length)]; credit(gift.currency as Currency, gift.amount); break; }
          case 'gold': case 'silver': result.itemIds = draw(ad.slot, 1); break;
          case 'blessing': next.buffs.blessing = { choice: ad.choice!, expiresAt: now + DEFAULT_BALANCE.ads.blessingDurationMs }; break;
          case 'sonar': next.buffs.sonarUntil = now + DEFAULT_BALANCE.ads.sonarDurationMs; break;
          case 'rescue': case 'oxygen':
            next.consumedEvents.push(`${ad.slot}:${ad.eventId}`); result.effect = ad.slot;
            emit(ad.slot === 'rescue' ? 'rescue_ad_view' : 'oxygen_refill_ad', { daily_count: (counters[ad.slot] ?? 0) + 1 }); break;
        }
        counters[ad.slot] = (counters[ad.slot] ?? 0) + 1; ad.status = 'claimed'; next.pendingAd = null;
        emit('ad_show', { slot_id: ad.slot, scene: ad.diveId ?? 'harbor', is_reward_granted: true }); break;
      }
      case 'task.claim': {
        identifier(action.taskId);
        const key = `task:${action.taskId}`;
        if (next.consumedEvents.includes(key) || !this.options.taskEligible?.(action.taskId)) throw new Error('TASK_INELIGIBLE');
        xp(DEFAULT_BALANCE.progression.taskXp); next.consumedEvents.push(key); break;
      }
      case 'telemetry.record': emit(action.name, copy(action.properties)); break;
      default: throw new Error('UNKNOWN_COMMAND');
    }
    next.revision++; next.receipts[action.opId] = { fingerprint: signature, result: copy(result) };
    this.commit(next); this.telemetry.publish(events); return result;
  }
  /** Lifecycle/checkpoint persistence is separate from asset commands and cannot mint assets. */
  checkpoint(activeDive: unknown | null): void { this.reload(); const next = copy(this.state); next.activeDive = copy(activeDive); this.commit(next); }
  telemetryBatch(limit = 100): TelemetryBatch { return TelemetryBus.batch(this.state.events, limit); }
  ackTelemetry(ids: readonly string[]): void {
    this.reload(); const next = copy(this.state); next.events = next.events.filter(e => !ids.includes(e.id)); this.commit(next);
  }
  private reload(): void {
    const loaded = this.save.load(validateLocalState);
    this.state = loaded.snapshot?.state ?? initialState(); this.sequence = loaded.sequence;
    this.epoch = loaded.snapshot?.sessionEpoch ?? 1; this.status = loaded.status;
  }
  private commit(next: LocalState): void {
    validateLocalState(next);
    const snapshot: Snapshot<LocalState> = { schemaVersion: 1, cloudRev: next.revision, sessionEpoch: this.epoch, state: next };
    const sequence = this.save.save(snapshot, this.sequence); this.state = next; this.sequence = sequence;
  }
}
