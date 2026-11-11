/** Runtime identities from asset-index-final.csv; no engine or asset loader dependency. */
export type SeaLayer = 'sunlight' | 'twilight' | 'abyss';
export type EnemyKind = 'normal' | 'elite' | 'boss';
/** Combat tuning table, alongside the identity and encounter configuration.
 *  attackGrowth 1.16→1.12 (LOO-58): band-6+ contact damage (8×1.16^6≈19.5/hit) outpaced the
 *  5%/level player HP curve, melting any 200–280 HP pool in ~30s of additive contacts; at 1.12
 *  the same band deals ≈16/hit (−19%) and band-10 ≈−28%, restoring evasion headroom for both
 *  manual and assisted play. P2-02 recalibrates the full curve. */
export const ENEMY_TUNING = Object.freeze({
  bandMetres: 100, bands: 24, baseHp: 50, hpGrowth: 1.18, baseAttack: 8, attackGrowth: 1.12,
  multipliers: Object.freeze({ normal: { hp: 1, attack: 1 }, elite: { hp: 8, attack: 2.5 }, boss: { hp: 40, attack: 4 } }),
});
/** First-layer onboarding only. Later layers retain the original curves and oxygen. */
export const SUNLIGHT_TUNING = Object.freeze({
  maxDepth: 800, normalHp: 1, eliteHp: 0.8, bossHp: 0.4, bossAttack: 0.6,
  attack: 0.15, spawnIntervalMultiplier: 8, oxygenRateMultiplier: 0.5,
});
export const SEA_LAYERS = Object.freeze([
  Object.freeze({ layer: 'sunlight' as const, name: '日光层', minDepth: 0, maxDepth: 800 }),
  Object.freeze({ layer: 'twilight' as const, name: '暮光层', minDepth: 800, maxDepth: 1600 }),
  Object.freeze({ layer: 'abyss' as const, name: '深渊层', minDepth: 1600, maxDepth: 2400 }),
]);
export const WORLD_BOUNDS = Object.freeze({ minX: -360, maxX: 360, minDepth: 0, maxDepth: 2400 });
export interface EnemyContent { readonly assetKey: string; readonly layer: SeaLayer; readonly kind: EnemyKind; readonly name: string }
export const ENEMY_CATALOG: readonly EnemyContent[] = Object.freeze([
  Object.freeze({"assetKey": "enemy_normal_01_moon_jelly", "layer": "sunlight", "kind": "normal", "name": "月光水母"}),
  Object.freeze({"assetKey": "enemy_normal_02_lantern_angler", "layer": "sunlight", "kind": "normal", "name": "灯笼鮟鱇"}),
  Object.freeze({"assetKey": "enemy_normal_03_electric_eel", "layer": "sunlight", "kind": "normal", "name": "电鳗"}),
  Object.freeze({"assetKey": "enemy_normal_04_needlefish", "layer": "sunlight", "kind": "normal", "name": "银针鱼"}),
  Object.freeze({"assetKey": "enemy_normal_05_hermit_crab", "layer": "sunlight", "kind": "normal", "name": "寄居蟹"}),
  Object.freeze({"assetKey": "enemy_normal_06_glass_shrimp", "layer": "sunlight", "kind": "normal", "name": "玻璃虾"}),
  Object.freeze({"assetKey": "enemy_normal_07_moon_snail", "layer": "sunlight", "kind": "normal", "name": "月亮螺"}),
  Object.freeze({"assetKey": "enemy_normal_08_comb_jelly", "layer": "sunlight", "kind": "normal", "name": "虹栉水母"}),
  Object.freeze({"assetKey": "enemy_normal_09_ribbon_eel", "layer": "twilight", "kind": "normal", "name": "飘带鳗"}),
  Object.freeze({"assetKey": "enemy_normal_10_umbrella_octopus", "layer": "twilight", "kind": "normal", "name": "伞章鱼"}),
  Object.freeze({"assetKey": "enemy_normal_11_hatchetfish", "layer": "twilight", "kind": "normal", "name": "银斧鱼"}),
  Object.freeze({"assetKey": "enemy_normal_12_lantern_shrimp", "layer": "twilight", "kind": "normal", "name": "灯笼虾"}),
  Object.freeze({"assetKey": "enemy_normal_13_crystal_crab", "layer": "twilight", "kind": "normal", "name": "晶甲蟹"}),
  Object.freeze({"assetKey": "enemy_normal_14_blue_ring_squid", "layer": "twilight", "kind": "normal", "name": "蓝环鱿"}),
  Object.freeze({"assetKey": "enemy_normal_15_ghost_jelly", "layer": "twilight", "kind": "normal", "name": "幽光水母"}),
  Object.freeze({"assetKey": "enemy_normal_16_violet_fish", "layer": "twilight", "kind": "normal", "name": "紫鳍鱼"}),
  Object.freeze({"assetKey": "enemy_normal_17_firefly_squid", "layer": "abyss", "kind": "normal", "name": "萤火鱿"}),
  Object.freeze({"assetKey": "enemy_normal_18_abyss_angler", "layer": "abyss", "kind": "normal", "name": "渊底鮟鱇"}),
  Object.freeze({"assetKey": "enemy_normal_19_tube_worm", "layer": "abyss", "kind": "normal", "name": "荧管虫"}),
  Object.freeze({"assetKey": "enemy_normal_20_armored_isopod", "layer": "abyss", "kind": "normal", "name": "甲壳潜行者"}),
  Object.freeze({"assetKey": "enemy_normal_21_siphonophore", "layer": "abyss", "kind": "normal", "name": "链灯水母"}),
  Object.freeze({"assetKey": "enemy_normal_22_sea_spider", "layer": "abyss", "kind": "normal", "name": "星足海蛛"}),
  Object.freeze({"assetKey": "enemy_normal_23_deep_starfish", "layer": "abyss", "kind": "normal", "name": "深海星"}),
  Object.freeze({"assetKey": "enemy_normal_24_glass_sponge", "layer": "abyss", "kind": "normal", "name": "琉璃海绵"}),
  Object.freeze({"assetKey": "enemy_elite_01_storm_eel", "layer": "sunlight", "kind": "elite", "name": "雷暴电鳗"}),
  Object.freeze({"assetKey": "enemy_elite_02_iron_hermit", "layer": "sunlight", "kind": "elite", "name": "铁甲寄居蟹"}),
  Object.freeze({"assetKey": "enemy_elite_03_spear_guard", "layer": "sunlight", "kind": "elite", "name": "剑鱼游侠"}),
  Object.freeze({"assetKey": "enemy_elite_04_royal_jelly", "layer": "twilight", "kind": "elite", "name": "冠冕水母"}),
  Object.freeze({"assetKey": "enemy_elite_05_crystal_octopus", "layer": "twilight", "kind": "elite", "name": "晶腕章鱼"}),
  Object.freeze({"assetKey": "enemy_elite_06_mirror_ray", "layer": "twilight", "kind": "elite", "name": "镜翼鳐"}),
  Object.freeze({"assetKey": "enemy_elite_07_abyss_stalker", "layer": "abyss", "kind": "elite", "name": "渊底巡猎者"}),
  Object.freeze({"assetKey": "enemy_elite_08_violet_nautilus", "layer": "abyss", "kind": "elite", "name": "紫纹鹦鹉螺"}),
  Object.freeze({"assetKey": "enemy_boss_01_angler_king", "layer": "sunlight", "kind": "boss", "name": "深海鮟鱇王"}),
  Object.freeze({"assetKey": "enemy_boss_02_tentacle_warden", "layer": "twilight", "kind": "boss", "name": "裂隙守望者"}),
  Object.freeze({"assetKey": "enemy_boss_03_giant_squid", "layer": "abyss", "kind": "boss", "name": "流光巨鱿"}),
  Object.freeze({"assetKey": "enemy_boss_04_abyss_whale", "layer": "abyss", "kind": "boss", "name": "渊底巨鲸"}),
 ]);
const byKey = new Map(ENEMY_CATALOG.map(e => [e.assetKey, e]));
export function enemyByKey(key: string): EnemyContent | undefined { return byKey.get(key); }
export function layerAtDepth(depth: number): SeaLayer {
  if (!Number.isFinite(depth)) throw new RangeError('Invalid depth');
  return depth < 800 ? 'sunlight' : depth < 1600 ? 'twilight' : 'abyss';
}
/** n=1..24, including the final 2400m endpoint in band24. */
export function enemyStrength(kind: EnemyKind, depth: number): { maxHp: number; attack: number } {
  if (!Number.isFinite(depth) || depth < 0) throw new RangeError('Invalid enemy depth');
  const c = ENEMY_TUNING, exponent = Math.min(c.bands - 1, Math.floor(depth / c.bandMetres));
  const sunlight = depth < SUNLIGHT_TUNING.maxDepth;
  const hpScale = sunlight ? kind === 'boss' ? SUNLIGHT_TUNING.bossHp : kind === 'elite' ? SUNLIGHT_TUNING.eliteHp : SUNLIGHT_TUNING.normalHp : 1;
  return { maxHp: c.baseHp * c.hpGrowth ** exponent * c.multipliers[kind].hp * hpScale,
    attack: c.baseAttack * c.attackGrowth ** exponent * c.multipliers[kind].attack * (sunlight ? kind === 'boss' ? SUNLIGHT_TUNING.bossAttack : SUNLIGHT_TUNING.attack : 1) };
}
export const BOSS_ENCOUNTERS = Object.freeze([
  { assetKey: 'enemy_boss_01_angler_king', depth: 800, layer: 'sunlight' as const, gate: true },
  { assetKey: 'enemy_boss_02_tentacle_warden', depth: 1600, layer: 'twilight' as const, gate: true },
  { assetKey: 'enemy_boss_04_abyss_whale', depth: 2200, layer: 'abyss' as const, gate: false },
  { assetKey: 'enemy_boss_03_giant_squid', depth: 2400, layer: 'abyss' as const, gate: true },
]);
export interface ContentProgress { readonly defeatedBosses: readonly string[]; readonly openRifts: readonly SeaLayer[]; readonly gateDepth: number | undefined }
