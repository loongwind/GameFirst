import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withBrowser } from './browser-helpers.mjs';
const target = process.env.WEB_TARGET || 'web-debug';
const root = fileURLToPath(new URL(`../build/${target}`, import.meta.url));
const artifacts = fileURLToPath(new URL('../.artifacts/harbor-ui/', import.meta.url));
test(`${target}: real Cocos harbor panels, safe areas, commands, virtual inventory and listener release`, { timeout: 120000 }, async () => {
  await withBrowser(root, async (page, _browser, url) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const boot = page.waitForEvent('console', { predicate: m => m.text().startsWith('[Boot] ready'), timeout: 30000 });
    const click = async name => {
      const pos = await page.evaluate(async name => {
        const { director, UITransform, view, Vec3 } = await System.import('cc');
        const find = n => n.name === name ? n : n.children.map(find).find(Boolean);
        const n = find(director.getScene()); if (!n) throw new Error(`Missing node ${name}`);
        const t = n.getComponent(UITransform), p = t.convertToWorldSpaceAR(new Vec3((.5 - t.anchorX) * t.width, (.5 - t.anchorY) * t.height));
        const canvas = document.querySelector('canvas').getBoundingClientRect(), size = view.getVisibleSize();
        return { x: canvas.left + p.x / size.width * canvas.width, y: canvas.top + (1 - p.y / size.height) * canvas.height };
      }, name);
      await page.mouse.click(pos.x, pos.y); await page.waitForTimeout(120);
    };
    await page.goto(url); await boot;
    await page.evaluate(async () => { window.acceptCc = await System.import('cc'); });
    await page.waitForFunction(() => { const find = n => n.name === 'EnterHarbor' || n.children.some(find); return find(window.acceptCc.director.getScene()); });
    await click('EnterHarbor');
    await page.waitForFunction(() => window.acceptCc.director.getScene().name === 'Harbor');
    await page.evaluate(async () => { const { director } = await System.import('cc'); window.harborController = director.getScene().getChildByName('Canvas').getComponent('HarborController'); });
    await page.waitForFunction(() => !!window.harborController.view, null, { timeout: 30000 });
    // First-run gates are real UI; fixture progression then uses genuine economy commands.
    await mkdir(artifacts, { recursive: true });
    await click('equipment'); await page.screenshot({ path: `${artifacts}/equipment-lv1-${target}.png` }); await click('close');
    await page.evaluate(() => {
      const e = window.harborController.economy; e.dispatch({ type: 'dive.settle', opId: 'accept-seed', settlement: { diveId: 'accept-seed', reason: 'return', cargo: { crystal: 1000000, pearl: 10000, marrow: 1000, core: 100 }, xp: 245, depth: 0, activeSeconds: 0 } });
      e.random = () => 0;
      for (let i = 0; i < 20; i++) e.dispatch({ type: 'box.draw', opId: `accept-box-${i}`, box: 'silver', count: 10 });
      e.dispatch({ type: 'equipment.upgrade', opId: 'seed-main-level', itemId: 'accept-box-0.0', payment: 'marrow' });
      e.dispatch({ type: 'equipment.upgrade', opId: 'seed-aux1-level1', itemId: 'accept-box-0.1', payment: 'marrow' });
      e.dispatch({ type: 'equipment.upgrade', opId: 'seed-aux1-level2', itemId: 'accept-box-0.1', payment: 'marrow' });
      e.dispatch({ type: 'equipment.upgrade', opId: 'seed-aux2-level', itemId: 'accept-box-0.2', payment: 'marrow' });
      window.harborController.view.open('equipment');
    });
    await page.screenshot({ path: `${artifacts}/equipment-lv8-${target}.png` });
    const fourthSlotLocked = await page.evaluate(async () => { const { Button, director } = await System.import('cc'); const find = n => n.name === 'slot-3' ? n : n.children.map(find).find(Boolean); return !find(director.getScene()).getComponent(Button).interactable; });
    assert.equal(fourthSlotLocked, true);
    await page.evaluate(() => { const c = window.harborController; c.economy.dispatch({ type: 'dive.settle', opId: 'accept-level40', settlement: { diveId: 'accept-level40', reason: 'return', cargo: { crystal: 0, pearl: 0, marrow: 0, core: 0 }, xp: 9755, depth: 0, activeSeconds: 0 } }); c.view.open('upgrade'); });
    const read = () => page.evaluate(() => ({ panel: window.harborController.view.panel, layout: window.harborController.view.layout, listeners: window.harborController.model.listenerCount, rows: window.harborController.view.liveRows, state: window.harborController.economy.snapshot, phase: window.harborController.model.phase, pending: window.harborController.model.hasPending }));
    const results = [];
    for (const height of [667, 750, 812]) {
      await page.setViewportSize({ width: 375, height }); await page.waitForTimeout(200);
      await click('close'); assert.equal((await read()).panel, undefined);
      await page.screenshot({ path: `${artifacts}/harbor-${height}-${target}.png` });
      await click('upgrade'); await page.screenshot({ path: `${artifacts}/upgrade-${height}-${target}.png` });
      const current = await read(); assert.ok(Math.abs(current.layout.height - height) < .01);
      assert.equal(current.listeners, 2); assert.ok(current.rows <= 9); results.push({ height, listeners: current.listeners, rows: current.rows });
    }
    const before = (await read()).state;
    await click('upgrade-hp'); const upgraded = await read();
    assert.equal(upgraded.state.attributes.hp, 1); assert.equal(BigInt(before.wallet.crystal) - BigInt(upgraded.state.wallet.crystal), 80n);
    for (let i = 0; i < 8; i++) { await click('close'); assert.equal((await read()).listeners, 1); await click('upgrade'); assert.equal((await read()).listeners, 2); }
    await click('close'); await click('tech'); await click('tree-survival'); await click('unlock-survival.1');
    assert.ok((await read()).state.tech.includes('survival.1'));
    await page.screenshot({ path: `${artifacts}/tech-${target}.png` });
    await click('close'); await click('equipment'); assert.ok((await read()).rows < 10);
    await page.screenshot({ path: `${artifacts}/equipment-${target}.png` });
    // Recycled inventory scrolls to the tail while holding a bounded number of Cocos nodes.
    const tail = await page.evaluate(async () => {
      const { director, ScrollView, Vec2 } = await System.import('cc'); const find = n => n.name === 'VirtualInventory' ? n : n.children.map(find).find(Boolean);
      const n = find(director.getScene()); n.getComponent(ScrollView).scrollToBottom(0); n.emit(ScrollView.EventType.SCROLLING);
      return n.getChildByName('Content').children.filter(n => n.active).map(n => n.name);
    });
    assert.ok(tail.includes('Row-199')); assert.ok(tail.length < 10);
    await page.evaluate(async () => {
      const { director, ScrollView } = await System.import('cc'); const find = n => n.name === 'VirtualInventory' ? n : n.children.map(find).find(Boolean);
      const n = find(director.getScene()); n.getComponent(ScrollView).scrollToTop(0); n.emit(ScrollView.EventType.SCROLLING);
    });
    const marrowBeforeMerge = (await read()).state.wallet.marrow;
    await click('main-accept-box-0.0'); await click('aux-accept-box-0.1'); await click('aux-accept-box-0.2');
    await click('merge'); await page.screenshot({ path: `${artifacts}/synthesis-confirm-${target}.png` }); await click('merge');
    const merged = (await read()).state;
    assert.equal(merged.inventory.length, 198); assert.equal(BigInt(merged.wallet.marrow) - BigInt(marrowBeforeMerge), 17n);
    assert.ok(merged.inventory.some(i => i.quality === 1 && i.level === 2));
    await click('close'); await click('supply'); await click('ad-gift');
    assert.equal((await read()).phase, 'error'); assert.equal((await read()).state.pendingAd, null);
    await page.screenshot({ path: `${artifacts}/ad-unavailable-${target}.png` });
    await click('retry'); await click('close'); await click('archive');
    await page.screenshot({ path: `${artifacts}/archive-${target}.png` });
    await click('close');
    // Real device bounds are injected through the platform port; Widget respects both capsule and bottom inset.
    await page.setViewportSize({ width: 375, height: 667 });
    await page.evaluate(() => { const p = window.harborController.platform, get = p.getDeviceInfo.bind(p); p.getDeviceInfo = () => ({ ...get(), safeArea: { left: 8, top: 44, width: 359, height: 589 }, capsule: { bottom: 88 } }); });
    await page.waitForTimeout(200); await click('equipment');
    await page.screenshot({ path: `${artifacts}/safe-area-667-${target}.png` });
    const safe = await read(); assert.ok(safe.layout.panel.y >= 88); assert.ok(safe.layout.targets.supply.y + 60 <= 633); results.push({ safe: safe.layout });
    // Leaving the scene releases every model listener and owned texture reference.
    await click('close');
    await page.evaluate(async () => { const { director } = await System.import('cc'); window.oldHarborResources = { model: window.harborController.model, frames: window.harborController.frames }; await new Promise((resolve, reject) => director.loadScene('Dive', e => e ? reject(e) : resolve())); });
    const released = await page.evaluate(() => ({ listeners: window.oldHarborResources.model.listenerCount, frames: window.oldHarborResources.frames.size }));
    assert.deepEqual(released, { listeners: 0, frames: 0 });
    // Settle via the actual Dive controller and return through its real button.
    await page.evaluate(async () => { const { director } = await System.import('cc'); const c = director.getScene().getChildByName('Canvas').getComponent('DiveController'); c.session.requestReturn(); });
    await page.evaluate(async () => { const { director } = await System.import('cc'); window.acceptDive = director.getScene().getChildByName('Canvas').getComponent('DiveController'); });
    await page.waitForFunction(() => window.acceptDive.session.state === 'Settled');
    await click('primary-touch');
    await page.waitForTimeout(350);
    await page.evaluate(async () => { const { director } = await System.import('cc'); window.harborController = director.getScene().getChildByName('Canvas').getComponent('HarborController'); });
    await page.waitForFunction(() => !!window.harborController?.view);
    assert.equal((await read()).state.activeDive, null);
    assert.deepEqual(errors, []);
    await writeFile(`${artifacts}/result-${target}.json`, JSON.stringify({ results, tail, released, errors, inventory: safe.state.inventory.length, listeners: safe.listeners }, null, 2));
  }, { navigate: false });
});
