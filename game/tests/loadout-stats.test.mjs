import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadServices } from './services-loader.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
let loaded;
/** The stats module is presentation-side, so it shares the harbor tsconfig rather than the services build. */
function stats() {
  if (!loaded) {
    execFileSync(`${root}/node_modules/.bin/tsc`, ['-p', 'tsconfig.harbor.json'], { cwd: root, stdio: 'inherit' });
    loaded = require(`${root}/.artifacts/harbor/assets/scripts/meta/loadoutStats.js`);
  }
  return loaded;
}
const api = loadServices();
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const gear = (id, template, slot, extra = {}) => ({ id, template, slot, quality: 0, level: 1, equipped: true, locked: false,
  invested: { marrow: '0', tickets: 0 }, ...extra });
const unlocked = () => ({ ...api.initialState(), tech: ['attack.3', 'survival.5', 'oxygen.2', 'cargo.4', 'special.6'] });

test('readout matches combatLoadout item by item for baseline, tech and equipped states', () => {
  const s = stats();
  const states = [
    api.initialState(),
    unlocked(),
    { ...unlocked(), attributes: { hp: 7, attack: 9, attackSpeed: 12, moveSpeed: 4, cargo: 6, oxygen: 8 },
      inventory: [gear('w0', 'sonic', 0, { quality: 2, level: 6 }), gear('w1', 'torpedo', 1, { quality: 0, level: 2 }),
        gear('a0', 'light', 2, { quality: 1, level: 3 }), gear('a1', 'fin', 3, { quality: 3, level: 7 })] },
  ];
  for (const state of states) {
    const readout = s.combatReadout(state), loadout = api.combatLoadout(state);
    near(readout.maxHp, loadout.maxHp);
    near(readout.cargoCapacity, loadout.cargoCapacity);
    near(readout.oxygenPerSecond, loadout.oxygenBaseRate);
    near(readout.oxygenSeconds, loadout.oxygenCapacity / loadout.oxygenBaseRate);
    near(readout.moveSpeed * 40, loadout.battle.playerSpeed);
    near(readout.pickupRadius * 40, loadout.battle.pickupRadius);
    for (let slot = 0; slot < 2; slot++) {
      near(readout.weapons[slot].damage, loadout.battle.weapons[slot].damage);
      near(readout.weapons[slot].interval, loadout.battle.weapons[slot].cooldownTicks / 30);
      near(readout.weapons[slot].range * 40, loadout.battle.weapons[slot].range);
      assert.equal(readout.weapons[slot].kind, loadout.battle.weapons[slot].kind);
    }
  }
});

test('quality and level feed one equipment gain for weapons and all four auxiliary types', () => {
  const s = stats();
  const gain = (quality, level) => 0.1 + 0.25 * quality + 0.02 * (level - 1);
  for (const [quality, level] of [[0, 1], [2, 6], [4, 11]]) {
    const state = { ...api.initialState(), inventory: [gear('w', 'sonic', 0, { quality, level })] };
    near(s.combatReadout(state).weapons[0].damage, 20 * (1 + gain(quality, level)));
    near(s.equipComparison(state, 'w', 0).gain, gain(quality, level));
  }
  const plain = api.initialState(), base = s.combatReadout(plain);
  const withAux = { ...plain, inventory: [gear('l', 'light', 2, { quality: 1, level: 5 }), gear('arm', 'armor', 3, { quality: 0, level: 1 })] };
  const aux = s.combatReadout(withAux), light = gain(1, 5), armor = gain(0, 1);
  near(aux.weapons[0].range, base.weapons[0].range * (1 + light));
  near(aux.maxHp, base.maxHp * (1 + armor));
  const finState = { ...plain, inventory: [gear('f', 'fin', 2, { quality: 2, level: 3 })] };
  near(s.combatReadout(finState).moveSpeed, base.moveSpeed * (1 + gain(2, 3)));
  const magnetState = { ...plain, inventory: [gear('m', 'magnet', 2, { quality: 0, level: 1 })] };
  near(s.combatReadout(magnetState).pickupMagnet, 1 + gain(0, 1));
  assert.equal(withAux.inventory[0].quality, 1, 'gain derives from the item, not copied into it');
});

test('slots resolve by saved identity and compare only inside a compatible slot', () => {
  const s = stats();
  const state = { ...api.initialState(), inventory: [
    gear('torpedo-slot1', 'torpedo', 1), gear('sonic-slot0', 'sonic', 0), gear('arc-free', 'arc', 0, { equipped: false, slot: undefined }),
    gear('light', 'light', 2), gear('armor', 'armor', 3),
  ] };
  const weapons = s.combatReadout(state).weapons;
  assert.equal(weapons[0].kind, 'sonic');
  assert.equal(weapons[1].kind, 'torpedo');
  const weaponSwap = s.equipComparison(state, 'arc-free', 0);
  assert.equal(weaponSwap.compatible, true);
  assert.equal(weaponSwap.deltas.find(d => d.label === '攻击间隔').to, '1.00');
  assert.match(s.comparisonLine(weaponSwap, 0), /^装到槽1后：伤害 .*→.* · 间隔 .*→.*秒 · 射程 .*→.*米$/);
  const wrongSlot = s.equipComparison(state, 'arc-free', 3);
  assert.equal(wrongSlot.compatible, false);
  assert.match(wrongSlot.reason, /不兼容/);
  assert.equal(s.equipComparison(state, 'light', 0).compatible, false);
  const auxSwap = s.equipComparison(state, 'light', 2);
  assert.equal(auxSwap.compatible, true);
  assert.equal(auxSwap.deltas[0].label, '射程');
  // Hypothetical equip is pure and never rewrites the live inventory.
  s.equippedState(state, 'arc-free', 0);
  assert.equal(state.inventory.find(item => item.id === 'arc-free').equipped, false);
});

test('upgrade previews are the real derived values before and after the next level', () => {
  const s = stats();
  const state = api.initialState(), attack = s.attributePreview(state, 'attack');
  assert.equal(`${attack.from} -> ${attack.to}`, '20 -> 21');
  const hp = s.attributePreview(state, 'hp');
  assert.equal(`${hp.from} -> ${hp.to}`, '200 -> 210');
  const cargo = s.attributePreview(state, 'cargo');
  assert.equal(`${cargo.from} -> ${cargo.to}`, '2000 -> 2100');
  const oxygen = s.attributePreview(state, 'oxygen');
  assert.equal(`${oxygen.from} -> ${oxygen.to}`, '1.00 -> 0.99');
  const speed = s.attributePreview(state, 'moveSpeed');
  assert.equal(`${speed.from} -> ${speed.to}`, '3.00 -> 3.03');
  const interval = s.attributePreview(state, 'attackSpeed');
  assert.equal(interval.unchanged, true, '30 Hz tick rounding can leave the first level unchanged');
  const next = { ...state, attributes: { ...state.attributes, attack: 1 } };
  near(s.combatReadout(next).weapons[0].damage, Number(attack.to));
});

test('summary and source lines expose every required current combat value', () => {
  const s = stats();
  const summary = s.summaryLines(api.initialState()).join('\n'), sources = s.sourceLines(api.initialState()).join('\n');
  for (const term of ['生命', '移速', '舱容', '氧气', '续航', '主1', '主2', '伤害', '间隔', '次/秒', '射程']) assert.match(summary, new RegExp(term));
  assert.match(sources, /基础 0 米/);
  assert.match(sources, /强化属性/);
  assert.match(sources, /科技加成/);
  assert.match(sources, /装备增益/);
});

test('weapon details name each mechanic and auxiliary details describe their own effect', () => {
  const s = stats();
  const state = { ...api.initialState(), inventory: [gear('sonic', 'sonic', 0), gear('torpedo', 'torpedo', 1),
    gear('arc', 'arc', 0), gear('mine', 'mine', 0), gear('light', 'light', 2), gear('fin', 'fin', 2),
    gear('armor', 'armor', 3), gear('magnet', 'magnet', 3)] };
  const detail = id => s.itemDetail(state, state.inventory.find(item => item.id === id)).lines.join(' ');
  assert.match(detail('sonic'), /环型/);
  assert.match(detail('torpedo'), /直线穿透/);
  assert.match(detail('arc'), /连锁 4 跳/);
  assert.match(detail('mine'), /爆炸 .* 米 · 触发 .* 米/);
  assert.match(detail('light'), /射程 \+10%（连锁距离同步）/);
  assert.match(detail('fin'), /移速 \+10%/);
  assert.match(detail('armor'), /生命 \+10%/);
  assert.match(detail('magnet'), /拾取范围 \+1\.10 米/);
  for (const id of ['sonic', 'light']) assert.match(detail(id), /基础 10% \+ 品质 0% \+ 等级 0%/);
  assert.match(s.itemKeyStats(state, state.inventory.find(item => item.id === 'sonic')), /伤害 22 · 间隔 1\.50 秒 · \+10%/);
});
