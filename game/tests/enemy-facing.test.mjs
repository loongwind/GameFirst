import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

async function compile(name, imports = {}) {
  const source = readFileSync(new URL(`../assets/scripts/ui/${name}.ts`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (!(name in imports)) throw new Error(`Unexpected dependency ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}

const facing = await compile('EnemyFacing');
const content = await compile('../battle/SeaContent');
const { LayerAnnouncer } = await compile('LayerAnnouncer', { '../battle/SeaContent': content });

test('direction audit: exactly the nine radial identities keep a front view, all others mirror', () => {
  assert.equal(facing.FRONT_FACING_IDENTITIES.size, 9);
  for (const key of ['enemy_normal_01_moon_jelly', 'enemy_normal_08_comb_jelly', 'enemy_normal_15_ghost_jelly',
    'enemy_normal_19_tube_worm', 'enemy_normal_21_siphonophore', 'enemy_normal_22_sea_spider',
    'enemy_normal_23_deep_starfish', 'enemy_normal_24_glass_sponge', 'enemy_elite_04_royal_jelly']) {
    assert.equal(facing.isFrontFacing(key), true, `${key} leans instead of mirroring`);
  }
  for (const key of ['enemy_normal_02_lantern_angler', 'enemy_normal_03_electric_eel', 'enemy_elite_03_spear_guard',
    'enemy_boss_01_angler_king', 'enemy_boss_04_abyss_whale', 'enemy_normal_16_violet_fish']) {
    assert.equal(facing.isFrontFacing(key), false, `${key} mirrors by velocity`);
  }
});

test('heading follows real velocity with an 80ms confirm, a 120ms cooldown and spawn-side default', () => {
  // Spawn heading: target offset decides; ambiguous (≤12) defaults to the art's rightward native.
  assert.equal(facing.initialFacing(50), 1);
  assert.equal(facing.initialFacing(-50), -1);
  assert.equal(facing.initialFacing(12), 1);
  assert.equal(facing.initialFacing(-12), 1);
  assert.equal(facing.initialFacing(-13), -1);

  const memory = facing.facingMemory(-50);
  assert.equal(memory.facing, -1);
  // 30Hz ticks: intent first seen at tick 20 is 80ms+ old at tick 23 (3 tick intervals).
  // One tick of rightward intent must not flip.
  assert.equal(facing.updateFacing(memory, 30, 10), -1);
  assert.equal(facing.updateFacing(memory, -30, 11), -1);
  // Sustained rightward intent flips after 3 confirmed ticks.
  facing.updateFacing(memory, 30, 20);
  facing.updateFacing(memory, 30, 21);
  assert.equal(facing.updateFacing(memory, 30, 22), -1, '66ms of intent is still too short');
  assert.equal(facing.updateFacing(memory, 30, 23), 1, '80ms+ of intent flips the heading');
  // Immediately reversing cannot flip again during the 120ms cooldown.
  facing.updateFacing(memory, -30, 24);
  facing.updateFacing(memory, -30, 25);
  assert.equal(facing.updateFacing(memory, -30, 26), 1, 'cooldown keeps the heading');
  assert.equal(facing.updateFacing(memory, -30, 27), -1, 'cooldown expired, intent held, flips');
  // Sub-threshold drift keeps the previous heading instead of tracking noise.
  assert.equal(facing.updateFacing(memory, 5, 28), -1);
  assert.equal(facing.updateFacing(memory, -5, 29), -1);
  // A single-tick spike never flips.
  assert.equal(facing.updateFacing(memory, 30, 30), -1);
  assert.equal(facing.updateFacing(memory, -5, 31), -1);
});

test('radial identities tilt at most 8° into horizontal motion', () => {
  assert.equal(facing.frontTilt(0), 0);
  assert.equal(facing.frontTilt(60), 8);
  assert.equal(facing.frontTilt(-60), -8);
  assert.equal(facing.frontTilt(600), 8, 'clamped at the design maximum');
  assert.equal(facing.frontTilt(30), 4);
});

test('band nameplate shows once per crossing and re-arms only 80m past the band', () => {
  const announcer = new LayerAnnouncer();
  announcer.update(700, 0);
  assert.equal(announcer.visible, false, 'outside the band nothing shows');
  announcer.update(750, 10);
  assert.equal(announcer.visible, true);
  assert.equal(announcer.label, '暮光层 · 800m');
  assert.equal(announcer.alpha, 0, 'fade starts from transparent');
  announcer.update(752, 14);
  assert.ok(announcer.alpha > 0 && announcer.alpha <= 1);
  // Oscillation inside the band never replays it.
  for (let t = 50; t < 200; t++) announcer.update(t % 2 ? 760 : 850, t);
  assert.equal(announcer.visible, false, 'plate ends within 1.2s and stays off while inside');
  announcer.update(900, 300);
  assert.equal(announcer.visible, false, 'still suppressed within band+80m');
  announcer.update(930, 400);
  assert.equal(announcer.visible, false, 'suppression holds at <140 from the boundary');
  announcer.update(941, 500);
  assert.equal(announcer.visible, false, '80m past the band re-arms, but outside a band nothing shows');
  announcer.update(850, 600);
  assert.equal(announcer.visible, true, 're-entering the band replays the plate');
  assert.equal(announcer.label, '暮光层 · 800m');
});
