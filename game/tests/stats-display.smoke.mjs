import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { withBrowser, enterBuiltScene } from './browser-helpers.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const target = process.env.WEB_TARGET || 'web-debug';
const buildRoot = fileURLToPath(new URL(`../build/${target}`, import.meta.url));
const artifacts = fileURLToPath(new URL('../.artifacts/loo-69/', import.meta.url));
// Stats come from the same compiled module the game bundles, so assertions cannot drift from the panel.
execFileSync(`${root}/node_modules/.bin/tsc`, ['-p', 'tsconfig.harbor.json'], { cwd: root, stdio: 'inherit' });
const stats = createRequire(import.meta.url)(`${root}/.artifacts/harbor/assets/scripts/meta/loadoutStats.js`);
const WEAPON_TEMPLATES = ['sonic', 'torpedo', 'arc', 'mine'];

test(`${target}: combat stats and equipment values match the combat projection across three viewports`, { timeout: 180000 }, async () => {
  await mkdir(artifacts, { recursive: true });
  await withBrowser(buildRoot, async (page, _browser, url) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const boot = page.waitForEvent('console', { predicate: message => message.text().startsWith('[Boot] ready'), timeout: 30000 });
    const click = async name => {
      const pos = await page.evaluate(async name => {
        const { director, UITransform, view, Vec3 } = await System.import('cc');
        const find = node => node.name === name ? node : node.children.map(find).find(Boolean);
        const node = find(director.getScene());
        if (!node) throw new Error(`Missing node ${name}`);
        const transform = node.getComponent(UITransform);
        const point = transform.convertToWorldSpaceAR(new Vec3((.5 - transform.anchorX) * transform.width, (.5 - transform.anchorY) * transform.height));
        const canvas = document.querySelector('canvas').getBoundingClientRect(), size = view.getVisibleSize();
        return { x: canvas.left + point.x / size.width * canvas.width, y: canvas.top + (1 - point.y / size.height) * canvas.height };
      }, name);
      await page.mouse.click(pos.x, pos.y);
      await page.waitForTimeout(140);
    };
    /** All labels plus world rects for named nodes; duplicates stay addressable. */
    const inspect = names => page.evaluate(async names => {
      const { director, Label, UITransform } = await System.import('cc');
      const all = [];
      const walk = node => { all.push(node); node.children.forEach(walk); };
      walk(director.getScene());
      const labels = {}, rects = {};
      for (const name of names) {
        const nodes = all.filter(node => node.name === name);
        labels[name] = nodes.map(node => node.getComponent(Label)?.string ?? null);
        const node = nodes[0];
        if (node) {
          const box = node.getComponent(UITransform)?.getBoundingBoxToWorld();
          if (box) rects[name] = { x: box.x, y: box.y, width: box.width, height: box.height };
        }
      }
      return { labels, rects };
    }, names);
    const overlap = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
      * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    const scrollToBottom = name => page.evaluate(async name => {
      const { director, ScrollView } = await System.import('cc');
      const find = node => node.name === name ? node : node.children.map(find).find(Boolean);
      const node = find(director.getScene());
      node.getComponent(ScrollView).scrollToBottom(0);
      node.emit(ScrollView.EventType.SCROLLING);
    }, name);

    await page.goto(url); await boot;
    await page.evaluate(async () => { window.acceptCc = await System.import('cc'); });
    await enterBuiltScene(page, 'Harbor');
    await page.waitForFunction(() => window.acceptCc.director.getScene().name === 'Harbor');
    await page.evaluate(async () => { const { director } = await System.import('cc'); window.harborController = director.getScene().getChildByName('Canvas').getComponent('HarborController'); });
    await page.waitForFunction(() => !!window.harborController.view, null, { timeout: 30000 });
    // Lv.40 + a real silver-box inventory; every value below is still derived from the live economy snapshot.
    await page.evaluate(() => {
      const economy = window.harborController.economy;
      economy.dispatch({ type: 'dive.settle', opId: 'stats-seed', settlement: { diveId: 'stats-seed', reason: 'return',
        cargo: { crystal: 100000, pearl: 20000, marrow: 500, core: 50 }, xp: 9755, depth: 0, activeSeconds: 0 } });
      economy.random = () => 0.314;
      for (let i = 0; i < 6; i++) economy.dispatch({ type: 'box.draw', opId: `stats-box-${i}`, box: 'silver', count: 10 });
      const snapshot = economy.snapshot;
      const weapon = snapshot.inventory.find(item => !item.equipped && ['sonic', 'torpedo', 'arc', 'mine'].includes(item.template));
      const auxiliary = snapshot.inventory.find(item => !item.equipped && ['light', 'fin', 'armor', 'magnet'].includes(item.template));
      if (weapon) economy.dispatch({ type: 'equipment.equip', opId: 'stats-equip-weapon', itemId: weapon.id, slot: 1 });
      if (auxiliary) economy.dispatch({ type: 'equipment.equip', opId: 'stats-equip-aux', itemId: auxiliary.id, slot: 2 });
    });
    const state = await page.evaluate(() => window.harborController.economy.snapshot);
    const summaryNames = ['CombatSummaryTitle', 'CombatSummary-0', 'CombatSummary-1', 'CombatSummary-2', 'CombatSummary-3', 'CombatSource-0', 'CombatSource-1', 'UpgradeRows'];
    const viewports = [{ width: 320, height: 640 }, { width: 375, height: 667 }, { width: 390, height: 844 }];
    const evidence = [];

    for (const { width, height } of viewports) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(220);
      await page.evaluate(() => window.harborController.view.open('upgrade'));
      await page.waitForTimeout(120);
      const upgrade = await inspect([...summaryNames, 'AttributeValues']);
      assert.deepEqual(upgrade.labels['CombatSummaryTitle'], ['当前战斗数值']);
      const expectedSummary = stats.summaryLines(state), expectedSources = stats.sourceLines(state);
      assert.deepEqual([0, 1, 2, 3].map(i => upgrade.labels[`CombatSummary-${i}`][0]), expectedSummary, `summary mismatch at ${width}x${height}`);
      assert.deepEqual([0, 1].map(i => upgrade.labels[`CombatSource-${i}`][0]), expectedSources, `source mismatch at ${width}x${height}`);
      const summaryBoxes = ['CombatSummary-0', 'CombatSummary-1', 'CombatSummary-2', 'CombatSummary-3', 'CombatSource-0', 'CombatSource-1'];
      for (let i = 0; i < summaryBoxes.length; i++) for (let j = i + 1; j < summaryBoxes.length; j++) {
        assert.equal(overlap(upgrade.rects[summaryBoxes[i]], upgrade.rects[summaryBoxes[j]]), 0, `${summaryBoxes[i]} overlaps ${summaryBoxes[j]} at ${width}x${height}`);
      }
      assert.equal(overlap(upgrade.rects['CombatSummary-3'], upgrade.rects.UpgradeRows), 0, `summary overlaps rows at ${width}x${height}`);
      // The first visible rows must show derived changes, not raw multipliers.
      const ids = ['hp', 'attack', 'attackSpeed', 'moveSpeed', 'cargo', 'oxygen'];
      upgrade.labels.AttributeValues.forEach((text, index) => {
        if (!text) return;
        const preview = stats.attributePreview(state, ids[index]);
        assert.equal(text, `${preview.label} ${preview.from} → ${preview.to}${preview.unit}${preview.unchanged ? '（本级不变）' : ''}`, `row ${index} at ${width}x${height}`);
      });
      await page.screenshot({ path: `${artifacts}/upgrade-${width}x${height}-${target}.png` });
      await scrollToBottom('UpgradeRows'); await page.waitForTimeout(150);
      const tail = await page.evaluate(async () => {
        const { director, Label } = await System.import('cc');
        const find = node => node.name === 'Row-5' ? node : node.children.map(find).find(Boolean);
        const node = find(director.getScene());
        return node ? { active: node.active, text: node.children.find(child => child.name === 'Attribute')?.getComponent(Label)?.string } : null;
      });
      assert.ok(tail?.active, `upgrade list must reach its last row at ${width}x${height}`);
      assert.match(tail.text, /氧气效率/);

      await page.evaluate(() => window.harborController.view.open('equipment'));
      await page.waitForTimeout(140);
      const slotNames = [0, 1, 2, 3].flatMap(i => [`slot-${i}-title`, `slot-${i}-line1`]);
      const equipment = await inspect([...slotNames, 'SelectedSlot']);
      for (let i = 0; i < 4; i++) {
        const card = stats.slotReadout(state, i);
        assert.deepEqual(equipment.labels[`slot-${i}-title`], [card.title], `slot ${i} title at ${width}x${height}`);
        assert.deepEqual(equipment.labels[`slot-${i}-line1`], [card.line1], `slot ${i} line at ${width}x${height}`);
      }
      await page.screenshot({ path: `${artifacts}/equipment-${width}x${height}-${target}.png` });

      const candidate = state.inventory.find(item => !item.equipped && !item.locked && item.quality < 4 && WEAPON_TEMPLATES.includes(item.template))
        ?? state.inventory.find(item => !item.equipped && !item.locked && item.quality < 4);
      assert.ok(candidate, 'seeded inventory must offer a selectable item');
      await click(`slot-0`); await click(`item-${candidate.id}`);
      const detail = await inspect(['EquipmentDetail-0', 'EquipmentDetail-1', 'EquipmentDetail-2', 'EquipmentCompare']);
      const expectedDetail = stats.itemDetail(state, candidate), slot0 = stats.equipComparison(state, candidate.id, 0);
      expectedDetail.lines.forEach((line, i) => assert.deepEqual(detail.labels[`EquipmentDetail-${i}`], [line], `detail ${i} at ${width}x${height}`));
      assert.deepEqual(detail.labels.EquipmentCompare, [stats.comparisonLine(slot0, 0)], `weapon comparison at ${width}x${height}`);
      await page.screenshot({ path: `${artifacts}/equipment-detail-${width}x${height}-${target}.png` });
      await click('slot-1');
      const slot1 = stats.equipComparison(state, candidate.id, 1);
      assert.deepEqual((await inspect(['EquipmentCompare'])).labels.EquipmentCompare, [stats.comparisonLine(slot1, 1)], `comparison must update with slot at ${width}x${height}`);
      await click('slot-2');
      const incompatible = stats.equipComparison(state, candidate.id, 2);
      assert.equal(incompatible.compatible, false);
      assert.deepEqual((await inspect(['EquipmentCompare'])).labels.EquipmentCompare, [incompatible.reason], `incompatible slot must explain itself at ${width}x${height}`);
      await page.screenshot({ path: `${artifacts}/equipment-compare-incompatible-${width}x${height}-${target}.png` });
      await click('slot-0');
      evidence.push({ viewport: `${width}x${height}`, summary: expectedSummary, comparison: stats.comparisonLine(slot0, 0), incompatible: incompatible.reason });
    }
    assert.deepEqual(errors, []);
    await writeFile(`${artifacts}/result-${target}.json`, JSON.stringify({ evidence, errors, inventory: state.inventory.length }, null, 2));
  }, { navigate: false });
});
