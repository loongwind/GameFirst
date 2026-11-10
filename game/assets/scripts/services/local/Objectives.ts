import { integer } from '@abyss-hunter/shared';
import { enemyByKey, WORLD_BOUNDS } from '../../battle/SeaContent';
import type { DiveCheckpoint, DiveOptions } from '../../battle/DiveSession';
import type { LocalState } from './model';
import type { EventName, LocalEvent } from './TelemetryBus';

export const FIRST_TUTORIAL_REWARD = 'tutorial:first-deposit:v1';
/** The teaching encounter cadence is explicit; combat stats and rewards use the normal loadout. */
export function tutorialLoadout(state: LocalState, normal: Omit<DiveOptions, 'diveId'>): Omit<DiveOptions, 'diveId'> {
  return state.objectives.tutorial.active && state.objectives.tutorial.step < 5 ? { ...normal, battle: { ...normal.battle, spawnIntervalTicks: 90 } } : normal;
}
export interface DepthRecord { depth: number; diveId: string; encounters: string[] }
export interface Objectives {
  version: 1; firstDay: string; completedDives: string[];
  dives: Record<string, { depth: number; bosses: string[]; kills: number; seconds: number }>;
  totalDepth: number; bossKills: number; milestones: number[]; record: DepthRecord | null; posterSeen: number;
  claimed: string[]; rotation: number;
  tutorial: { active: boolean; completed: boolean; run: number; step: number; diveId: string | null; rewarded: boolean; upgraded: boolean };
}
type Emit = (name: EventName, properties: LocalEvent['properties']) => void;
export function initialObjectives(legacy = false): Objectives {
  return { version: 1, firstDay: '', completedDives: [], dives: {}, totalDepth: 0, bossKills: 0, milestones: [], record: null,
    posterSeen: 0, claimed: [], rotation: 0, tutorial: { active: !legacy, completed: legacy, run: 0, step: 0, diveId: null, rewarded: legacy, upgraded: false } };
}
export function validateObjectives(p: Objectives): void {
  if (!p || p.version !== 1 || typeof p.firstDay !== 'string' || !Array.isArray(p.completedDives) || !Array.isArray(p.claimed) ||
    !p.dives || Array.isArray(p.dives) || typeof p.dives !== 'object' || !Array.isArray(p.milestones)) throw new RangeError('Invalid objectives');
  integer(p.totalDepth); integer(p.bossKills); integer(p.rotation, 0, 3); integer(p.posterSeen, 0, WORLD_BOUNDS.maxDepth);
  const t = p.tutorial;
  if (!t || [t.active, t.completed, t.rewarded, t.upgraded].some(v => typeof v !== 'boolean') || t.diveId !== null && typeof t.diveId !== 'string') throw new RangeError('Invalid tutorial');
  integer(t.run); integer(t.step, 0, 6);
  if (new Set(p.completedDives).size !== p.completedDives.length || new Set(p.claimed).size !== p.claimed.length ||
    p.completedDives.some(v => typeof v !== 'string') || p.claimed.some(v => typeof v !== 'string')) throw new RangeError('Invalid objective keys');
  for (const d of Object.values(p.dives)) {
    integer(d.depth, 0, WORLD_BOUNDS.maxDepth); integer(d.kills); if (!Number.isFinite(d.seconds) || d.seconds < 0 || !Array.isArray(d.bosses)) throw new RangeError('Invalid dive progress');
    if (d.bosses.some(k => enemyByKey(k)?.kind !== 'boss')) throw new RangeError('Invalid boss progress');
  }
  if (p.milestones.some(d => !Number.isInteger(d) || d <= 0 || d > WORLD_BOUNDS.maxDepth || d % 500) || new Set(p.milestones).size !== p.milestones.length) throw new RangeError('Invalid milestone');
  if (p.record) {
    integer(p.record.depth, 0, WORLD_BOUNDS.maxDepth);
    if (typeof p.record.diveId !== 'string' || !Array.isArray(p.record.encounters) || p.record.encounters.some(k => !enemyByKey(k))) throw new RangeError('Invalid depth record');
  }
}
export function tutorialStep(p: Objectives, step: number, emit: Emit): void {
  const t = p.tutorial;
  while (t.step < step) { t.step++; emit('tutorial_step', { step: t.step, run: t.run, replay: t.completed, dive_id: t.diveId ?? '' }); }
}
/** Reads accepted production checkpoints. Analytics acknowledgements cannot erase progress. */
export function observeObjectives(p: Objectives, s: DiveCheckpoint, day: string, emit: Emit): void {
  if (!s?.options?.diveId || !s.battle?.stats) return;
  if (!p.firstDay) p.firstDay = day;
  const id = s.options.diveId, t = p.tutorial;
  if (t.active && t.diveId !== id && s.state === 'Running') {
    if (t.step === 5 && t.upgraded) { tutorialStep(p, 6, emit); t.completed = true; t.active = false; }
    else if (t.step < 5) { t.diveId = id; t.step = 0; tutorialStep(p, 1, emit); }
  }
  const old = p.dives[id] ?? { depth: 0, bosses: [], kills: 0, seconds: 0 };
  const depth = Math.max(old.depth, Math.min(WORLD_BOUNDS.maxDepth, Math.floor(Math.max(0, s.battle.player.y, s.battle.stats.maxDepth ?? 0))));
  const bosses = Array.from(new Set(old.bosses.concat(s.battle.content?.defeatedBosses ?? [])));
  p.totalDepth += depth - old.depth; p.bossKills += bosses.length - old.bosses.length;
  p.dives[id] = { depth, bosses, kills: Math.max(old.kills, s.battle.stats.kills), seconds: Math.max(old.seconds, s.activeSeconds) };
  if (depth > (p.record?.depth ?? 0)) p.record = { depth, diveId: id, encounters: [...(s.battle.encounters ?? [])] };
  for (let d = 500; d <= depth; d += 500) if (!p.milestones.includes(d)) {
    p.milestones.push(d); emit('depth_record', { dive_id: id, depth: d, max_depth: depth, sea_layer: d < 800 ? 'sunlight' : d < 1600 ? 'twilight' : 'abyss' });
  }
  if (t.active && t.diveId === id && t.step < 5) {
    if (s.activeSeconds >= 10) tutorialStep(p, 2, emit);
    if (s.activeSeconds >= 30 && s.battle.stats.kills > 0 && s.battle.stats.lootCollected > 0 && (s.battle.stats.manualDistance ?? 0) > 0) tutorialStep(p, 3, emit);
    if (s.activeSeconds >= 60 && t.step === 3) tutorialStep(p, 4, emit);
  }
}
export interface ObjectiveTask { id: string; kind: 'rotation' | 'first-day'; title: string; progress: number; target: number; ready: boolean; claimed: boolean }
export function objectiveTasks(state: LocalState): ObjectiveTask[] {
  const p = state.objectives;
  const definitions = [
    { title: '累计下潜 1000 米', target: 1000, progress: p.totalDepth, key: 'depth1000' },
    { title: '击杀任意渊主 3 次', target: 3, progress: p.bossKills, key: 'boss3' },
    { title: '角色等级达到 50 级', target: 50, progress: state.playerLevel, key: 'level50' },
  ];
  const rows: ObjectiveTask[] = [], d = definitions[p.rotation];
  if (d) rows.push({ id: `rotation-v1:${p.rotation}:${d.key}`, kind: 'rotation', title: d.title, progress: Math.min(d.target, d.progress), target: d.target, ready: d.progress >= d.target, claimed: false });
  if (p.firstDay) {
    const id = `first-day:${p.firstDay}`, claimed = p.claimed.includes(id);
    rows.push({ id, kind: 'first-day', title: '首日目标 · 完成 3 次完整下潜', progress: Math.min(3, p.completedDives.length), target: 3, ready: !claimed && p.completedDives.length >= 3, claimed });
  }
  return rows;
}
export function tutorialHint(state: LocalState, activeSeconds = 0): string {
  const t = state.objectives.tutorial;
  if (!t.active) return '';
  return ['', '首潜 1/6 · 基础自动攻击常开，敌人正在靠近。', '首潜 2/6 · 拖动左下摇杆移动，靠近击落的荧晶拾取。',
    activeSeconds < 45 ? '首潜 3/6 · 收集舱满后停止装载，返航才能入账。' : '首潜 3/6 · 氧气随深度消耗，耗尽会持续失去生命。',
    '首潜 4/6 · 点击安全返航，将本局收获带回母港。', t.upgraded ? '首潜 5/6 · 强化已确认，再次出发后自由探索。' : '首潜 5/6 · 用已入账荧晶强化一次舱容或氧效。',
    '首潜 6/6 · 自由探索，首日完成 3 次完整下潜。'][t.step] ?? '';
}
