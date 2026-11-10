import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startBattleFixture } from '../tools/battle-fixture-server.mjs';

const artifacts = new URL('../.artifacts/', import.meta.url);
test('ordinary combat camera keeps the interpolated player centered during movement', { timeout: 15_000 }, async () => {
  const server = await startBattleFixture();
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 800, height: 1000 } });
    await page.goto(`${server.url}/?enemies=40&seed=7`);
    await page.waitForFunction(() => window.battleFixture?.report().frames >= 10);
    await page.keyboard.down('ArrowRight');
    const centers = await page.evaluate(async () => {
      const ctx = document.querySelector('canvas').getContext('2d'), positions = [];
      for (let i = 0; i < 18; i++) {
        await new Promise(requestAnimationFrame);
        const row = ctx.getImageData(330, 300, 60, 1).data, pixels = [];
        for (let x = 0; x < 60; x++) if (row[x * 4] === 215 && row[x * 4 + 1] === 255 && row[x * 4 + 2] === 252) pixels.push(x + 330);
        positions.push((pixels[0] + pixels.at(-1)) / 2);
      }
      return positions;
    });
    await page.keyboard.up('ArrowRight');
    assert.ok(centers.every(Number.isFinite));
    assert.ok(Math.max(...centers) - Math.min(...centers) <= 1, `player camera jitter: ${centers}`);
  } finally { await browser?.close(); await server.close(); }
});

for (const enemies of [40, 80]) test(`${enemies}/200/100 browser rAF fixture, virtual joystick, sustained work and timing`, { timeout: 35_000 }, async () => {
  const server = await startBattleFixture();
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 800, height: 1000 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${server.url}/?enemies=${enemies}&seed=7&stress=1`);
    await page.waitForFunction(() => window.battleFixture?.report().frames >= 45);
    const canvas = page.locator('canvas'), bounds = await canvas.boundingBox();
    const initialX = await page.evaluate(() => window.battleFixture.battle.player.x);
    await page.mouse.move(bounds.x + 95 * bounds.width / 720, bounds.y + 580 * bounds.height / 680);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 150 * bounds.width / 720, bounds.y + 580 * bounds.height / 680);
    const tick = await page.evaluate(() => window.battleFixture.battle.tick);
    await page.waitForFunction(t => window.battleFixture.battle.tick >= t + 6, tick);
    await page.mouse.up();
    const movedX = await page.evaluate(() => window.battleFixture.battle.player.x);
    assert.ok(movedX > initialX + 16, `joystick must move the player: ${initialX} -> ${movedX}`);
    await page.evaluate(() => window.battleFixture.resetMetrics());
    await page.waitForFunction(() => window.battleFixture.report().frames >= 360);
    const report = await page.evaluate(() => window.battleFixture.report());
    assert.deepEqual(report.minima, { enemies, projectiles: 200, loot: 100 });
    assert.ok(report.stats.hits > 0 && report.stats.kills > 0);
    assert.ok(report.logicStepMs.n >= 150);
    assert.ok(report.logicStepMs.p95 < 8, `logic p95 ${report.logicStepMs.p95} ms`);
    assert.ok(report.frameCpuMs.p95 < 16.7, `CPU p95 ${report.frameCpuMs.p95} ms`);
    assert.ok(report.frameMs.p95 < 40, `rAF p95 ${report.frameMs.p95} ms`);
    assert.deepEqual(errors, []);
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: new URL(`battle-${enemies}.png`, artifacts).pathname });
    await writeFile(new URL(`battle-${enemies}-result.json`, artifacts), JSON.stringify({ ...report, errors }, null, 2));
    console.info(JSON.stringify({ enemies, logic: report.logicStepMs, cpu: report.frameCpuMs, raf: report.frameMs }));
  } finally { await browser?.close(); await server.close(); }
});
