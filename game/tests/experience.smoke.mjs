import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withBrowser, enterBuiltScene } from './browser-helpers.mjs';

const target = process.env.WEB_TARGET || 'web-release';
const phase = process.env.EXPERIENCE_PHASE || 'after';
const artifacts = fileURLToPath(new URL(`../.artifacts/loo-64/${phase}/`, import.meta.url));
const root = fileURLToPath(new URL(`../build/${target}/`, import.meta.url));
async function ready(page, url) {
  await page.goto(url); await page.waitForFunction(() => typeof System !== 'undefined');
  await page.evaluate(async () => { window.cc = await System.import('cc'); });
  await page.waitForFunction(() => {
    window.c = cc.director.getScene()?.getChildByName('Canvas')?.getComponent('DiveController');
    return c?.hud?.sea.status === 'ready' && !c.session.pause.paused;
  });
}
test(`${phase}: native harbor panel inventory at mobile sizes`, { timeout: 120000 }, async () => {
  await mkdir(artifacts, { recursive: true });
  await withBrowser(root, async (page, browser, url) => {
    await ready(page, url); await enterBuiltScene(page, 'Harbor');
    await page.waitForFunction(() => {
      window.h = cc.director.getScene()?.getChildByName('Canvas')?.getComponent('HarborController'); return !!h?.view;
    });
    const rows = [];
    for (const [width, height, safe] of [[375, 667, false], [390, 844, false], [320, 640, true], [375, 400, false]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(safe => {
        document.documentElement.style.setProperty('--safe-top', safe ? '44px' : '0px');
        document.documentElement.style.setProperty('--safe-bottom', safe ? '34px' : '0px');
        h.view.close();
      }, safe);
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${artifacts}/harbor-${width}x${height}.png` });
      const panels = width === 375 && height === 667 ? ['upgrade', 'tech', 'equipment', 'supply', 'tasks', 'archive'] : ['upgrade'];
      for (const panel of panels) {
        await page.evaluate(panel => h.view.open(panel), panel); await page.waitForTimeout(80);
        await page.screenshot({ path: `${artifacts}/${panel}-${width}x${height}.png` });
      }
      rows.push(await page.evaluate(({ width, height }) => {
        const cv = document.querySelector('canvas').getBoundingClientRect(), v = cc.view.getVisibleSize();
        const find = (n, name) => n.name === name ? n : n.children.map(c => find(c, name)).find(Boolean);
        return { width, height, layout: h.view.layout, targets: ['close', 'upgrade-hp'].map(name => {
          const n = find(h.view.root, name); if (!n) return { name, absent: true };
          const b = n.getComponent(cc.UITransform).getBoundingBoxToWorld();
          return { name, width: b.width * cv.width / v.width, height: b.height * cv.height / v.height };
        }) };
      }, { width, height }));
      await page.evaluate(() => h.view.close());
    }
    await writeFile(`${artifacts}/panels.json`, JSON.stringify(rows, null, 2));
    if (phase === 'after') for (const row of rows) for (const t of row.targets) if (!t.absent) assert.ok(t.height >= 43.99, JSON.stringify(row));
  }, { navigate: false, width: 375, height: 667, deviceScaleFactor: 1 });
});

test(`${phase}: native surface return and scenery repro`, { timeout: 90000 }, async () => {
  await mkdir(artifacts, { recursive: true });
  await withBrowser(root, async (page, browser, url) => {
    await ready(page, url);
    await page.evaluate(() => {
      c.session.battle.autoSpawn = false; c.session.battle.enemies.clear(); c.session.battle.obstacles = [];
      c.session.collect('crystal', 17); c.session.collect('pearl', 2);
    });
    await page.keyboard.down('ArrowDown'); await page.waitForTimeout(1600); await page.keyboard.up('ArrowDown');
    await page.waitForTimeout(200); await page.screenshot({ path: `${artifacts}/dive-down.png` });
    const down = await page.evaluate(() => ({ depth: c.session.depth, camera: c.hud.projection.y }));
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(1600); await page.keyboard.up('ArrowUp');
    await page.waitForTimeout(200); await page.screenshot({ path: `${artifacts}/dive-up.png` });
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(1300); await page.keyboard.up('ArrowUp');
    await page.screenshot({ path: `${artifacts}/surface.png` });
    const result = await page.evaluate(() => ({ state: c.session.state, depth: c.session.depth, wallet: c.economy.snapshot.wallet, settlement: c.session.pendingSettlement }));
    await writeFile(`${artifacts}/surface.json`, JSON.stringify({ down, result }, null, 2));
    if (phase === 'after') assert.equal(result.state, 'Settled');
  }, { navigate: false, width: 375, height: 667, deviceScaleFactor: 1 });
});
