import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const api = () => import('../dist/index.js');
test('balance tables reject malformed numbers, probability totals, missing slots and dangling prerequisites', async () => {
  const { validateBalanceConfig } = await api();
  assert.equal(typeof validateBalanceConfig, 'function');
  const config = JSON.parse(readFileSync(new URL('../config/balance.json', import.meta.url)));
  assert.deepEqual(validateBalanceConfig(config), config);
  for (const change of [c => c.attributes.baseCost = -1, c => c.boxes.gold.weights[0]++, c => delete c.ads.slots.rescue,
    c => c.tech.nodes[0].requires.push('missing'), c => c.equipment.maxLevels[1] = 1,
    c => c.boxes.gold.pity = 0, c => Object.assign(c.drops, { depthBand: 1, maxDepth: 100000, growth: 2 })]) {
    const bad = structuredClone(config); change(bad); assert.throws(() => validateBalanceConfig(bad));
  }
});
test('six attribute costs remain exact through lv999; XP uses independent capped player levels', async () => {
  const { upgradeCost, levelForXp, DEFAULT_BALANCE } = await api();
  assert.equal(typeof upgradeCost, 'function');
  assert.equal(upgradeCost(0), '80'); assert.equal(upgradeCost(1), '93'); assert.equal(upgradeCost(2), '108');
  assert.match(upgradeCost(999), /^\d{66,}$/);
  assert.throws(() => upgradeCost(1000)); assert.throws(() => upgradeCost(-1));
  assert.equal(DEFAULT_BALANCE.attributes.ids.length, 6);
  for (const [xp, level] of [[0, 1], [19, 1], [20, 2], [244, 7], [245, 8], [4484, 39], [4485, 40], [999999999, 1000]])
    assert.equal(levelForXp(xp), level);
  assert.throws(() => levelForXp(NaN));
});
test('mixed-level synthesis preserves main investment and refunds only actual auxiliary investments', async () => {
  const { synthesize } = await api(); assert.equal(typeof synthesize, 'function');
  const item = (id, level, marrow, tickets = 0) => ({ id, template: 'sonic', quality: 1, level, equipped: false, locked: false, invested: { marrow, tickets } });
  const items = [item('main', 5, '34'), item('a', 1, '0'), item('b', 3, '17', 2)];
  const result = synthesize(items, 'main', 'result');
  assert.equal(result.item.level, 5); assert.equal(result.item.quality, 2);
  assert.deepEqual(result.item.invested, { marrow: '34', tickets: 0 });
  assert.deepEqual(result.refund, { marrow: '17', tickets: 2 });
  assert.equal(items.length, 3); assert.equal(items[0].quality, 1);
  assert.throws(() => synthesize([items[0], items[0], items[2]], 'main', 'x'));
  assert.throws(() => synthesize(items.map(i => ({ ...i, locked: true })), 'main', 'x'));
  assert.throws(() => synthesize(items.map(i => ({ ...i, quality: 4 })), 'main', 'x'));
});
test('gold pity counts sequentially across ad and pearl draws; silver never affects it', async () => {
  const { rollBox } = await api(); assert.equal(typeof rollBox, 'function');
  let first = rollBox('gold', 8, [0, 0]); assert.equal(first.pity, 9);
  let next = rollBox('gold', first.pity, [0, 0]); assert.ok(next.quality >= 3); assert.equal(next.pity, 0);
  assert.equal(rollBox('silver', 9, [0, 0]).pity, 9);
  assert.equal(rollBox('gold', 9, [0.94, 0]).pity, 0);
  assert.throws(() => rollBox('gold', 0, [NaN, 0]));
});
test('boxes can produce upgrade tickets without resetting gold pity or creating an equipment instance', async () => {
  const { rollBox } = await api();
  assert.equal(rollBox('silver', 8, [0.999, 0]).quality, 5);
  assert.equal(rollBox('gold', 8, [0.999, 0]).quality, 5);
  assert.equal(rollBox('gold', 8, [0.999, 0]).pity, 9);
  assert.ok(rollBox('gold', 9, [0.999, 0]).quality < 5);
});
test('normal drop curve is bounded at PRD ±30%, deep drops grow, and elites guarantee marrow', async () => {
  const { monsterDrop } = await api(); assert.equal(typeof monsterDrop, 'function');
  assert.equal(monsterDrop('normal', 0, [0, 0]).crystal, 7);
  assert.equal(monsterDrop('normal', 0, [0.999999, 0]).crystal, 13);
  assert.equal(monsterDrop('normal', 200, [0.5, 0.5]).crystal, 14);
  assert.equal(monsterDrop('elite', 0, [0.5, 0.5]).marrow, 1);
  assert.equal(monsterDrop('boss', 0, [0.5, 0.5]).core, 1);
  assert.throws(() => monsterDrop('normal', Infinity, [0, 0]));
});
