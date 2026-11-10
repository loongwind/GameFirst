import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const target = process.env.WEB_TARGET || 'web-debug';
const root = fileURLToPath(new URL('..', import.meta.url));
const artifacts = fileURLToPath(new URL('../.artifacts/dev-entry/', import.meta.url));

function startDevServe(port) {
  const child = spawn(process.execPath, ['tools/dev-serve.mjs'], { cwd: root, env: { ...process.env, DEV_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  const ready = new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => { if (String(chunk).includes('http://')) resolve(); });
    child.on('exit', code => reject(new Error(`dev-serve exited ${code}`)));
  });
  return { child, ready, url: `http://127.0.0.1:${port}/` };
}

test(`${target}: development mock entry wires every-day real ad flow and reinjects after refresh`, { timeout: 240000 }, async () => {
  await mkdir(artifacts, { recursive: true });
  const dev = startDevServe(8177);
  await dev.ready;
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    await page.goto(dev.url);
    await page.waitForFunction(() => typeof System !== 'undefined');
    await page.evaluate(async () => { window.cc = await System.import('cc'); });
    await page.waitForFunction(() => {
      window.c = window.cc.director.getScene()?.getChildByName('Canvas')?.getComponent('DiveController');
      return window.c?.hud?.sea?.status === 'ready';
    }, null, { timeout: 30000 });
    await page.waitForFunction(() => !!document.getElementById('dev-mock-badge'), null, { timeout: 15000 });
    // The boot must have configured the driver on the live controller.
    const wired = await page.evaluate(() => { window.c.hud.render(window.c.session, '', window.c.ads.view, window.c.economy.snapshot); return window.c.ads.view.oxygenRemaining; });
    assert.equal(wired, 3, 'oxygen slot starts at its real daily allowance');
    await page.waitForFunction(() => !window.c.session.pause.paused, null, { timeout: 30000 });
    // Drain the bar through the real clock path, then play the oxygen ad through the boot-wired driver.
    await page.evaluate(() => { window.c.enabled = false; });
    await page.evaluate(async () => {
      const c = window.c, s = c.session;
      for (let i = 0; i < 20000 && s.oxygen / s.oxygenCapacity >= .14; i++) s.advance(1 / 6);
      c.hud.render(s, '', c.ads.view, c.economy.snapshot);
    });
    const promptVisible = await page.evaluate(() => window.c.ads.view.oxygenPrompt && window.c.hud.oxygenCard.active);
    assert.equal(promptVisible, true, 'the real 15% prompt must appear');
    // Real button click: HUD action → DiveAdModel.watch → real AdService → mock driver show → real claim.
    const point = await page.evaluate(() => {
      const find = n => n.name === 'oxygen-touch' && n.activeInHierarchy ? n : n.children.map(find).find(Boolean);
      const n = find(window.cc.director.getScene());
      const t = n.getComponent(window.cc.UITransform), b = t.getBoundingBoxToWorld(), v = window.cc.view.getVisibleSize();
      return { x: (b.x + b.width / 2) / v.width * innerWidth, y: innerHeight - (b.y + b.height / 2) / v.height * innerHeight };
    });
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => window.c.session.oxygen / window.c.session.oxygenCapacity > .9, null, { timeout: 20000 });
    const after = await page.evaluate(() => {
      const c = window.c, day = c.economy.snapshot.daily;
      return { oxygen: c.session.oxygen, remaining: c.ads.view.oxygenRemaining,
        counted: Object.values(day).flatMap(d => [d.oxygen ?? 0])[0] ?? 0, driver: !!document.getElementById('dev-mock-badge') };
    });
    assert.equal(after.remaining, 2, 'the real daily counter must have consumed one oxygen slot');
    assert.ok(after.counted >= 1, 'economy daily ledger records the claim');
    await page.screenshot({ path: `${artifacts}/dev-entry-${target}.png` });
    // Refresh: the server re-injects the boot, so the entry survives reloads.
    await page.reload();
    await page.waitForFunction(() => typeof System !== 'undefined');
    await page.evaluate(async () => { window.cc = await System.import('cc'); });
    await page.waitForFunction(() => {
      window.c = window.cc.director.getScene()?.getChildByName('Canvas')?.getComponent('DiveController');
      return window.c?.hud?.sea?.status === 'ready';
    }, null, { timeout: 30000 });
    await page.waitForFunction(() => !!document.getElementById('dev-mock-badge'), null, { timeout: 15000 });
    const afterReload = await page.evaluate(() => window.c.ads.view.oxygenRemaining);
    assert.equal(afterReload, 2, 'daily usage survives the refresh through the real store');
    assert.deepEqual(errors, []);
    await writeFile(`${artifacts}/dev-entry-${target}.json`, JSON.stringify({ wired, after, afterReload, errors }, null, 2));
  } finally {
    await browser?.close();
    dev.child.kill();
  }
});
