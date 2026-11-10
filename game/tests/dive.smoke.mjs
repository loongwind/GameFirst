import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withBrowser } from './browser-helpers.mjs';

const target = process.env.WEB_TARGET || 'web-debug';
const root = fileURLToPath(new URL(`../build/${target}`, import.meta.url));
const artifacts = new URL('../.artifacts/hud/', import.meta.url);

test(`${target}: real Cocos Dive renders HUD, accepts touches and preserves overlapping pauses`, { timeout: 90_000 }, async () => {
  await withBrowser(root, async (page, _browser, url) => {
    page.setDefaultTimeout(15_000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    const boot = page.waitForEvent('console', { predicate: e => e.text() === '[Boot] ready (browser); protocol=1', timeout: 30_000 });
    await page.goto(url); await boot;
    console.info('Dive acceptance: Boot ready');
    await page.evaluate(async () => { const { director } = await System.import('cc'); await new Promise((resolve, reject) => director.loadScene('Dive', error => error ? reject(error) : resolve())); });
    assert.equal(await page.evaluate(async () => { const { director } = await System.import('cc'); return !!director.getScene().getChildByName('Canvas').getComponent('DiveController')?.session; }), true);
    console.info('Dive acceptance: scene loaded');
    await mkdir(artifacts, { recursive: true });
    const invoke = (method, ...args) => page.evaluate(async ({ method, args }) => {
      const { director } = await System.import('cc');
      const c = director.getScene().getChildByName('Canvas').getComponent('DiveController');
      return c[method](...args);
    }, { method, args });
    const read = () => page.evaluate(async () => {
      const { director } = await System.import('cc'); const c = director.getScene().getChildByName('Canvas').getComponent('DiveController');
      return { ...c.session.snapshot, tick: c.session.battle.tick, layout: c.hud.layout };
    });
    // Screenshots use the real rendered scene at the three acceptance heights.
    for (const height of [667, 750, 812]) {
      await page.setViewportSize({ width: 375, height }); await page.waitForTimeout(250);
      const s = await read(); assert.ok(Math.abs(s.layout.height - height) < 0.01, `HUD height ${s.layout.height}, viewport ${height}`);
      await page.screenshot({ path: new URL(`dive-${height}-${target}.png`, artifacts).pathname });
    }
    await page.setViewportSize({ width: 375, height: 667 });
    await page.evaluate(() => { document.documentElement.style.setProperty('--safe-top', '44px'); document.documentElement.style.setProperty('--safe-bottom', '34px'); });
    await page.waitForTimeout(300);
    assert.equal((await read()).layout.top, 44);
    await page.screenshot({ path: new URL(`safe-667-${target}.png`, artifacts).pathname });
    await page.evaluate(() => { document.documentElement.style.removeProperty('--safe-top'); document.documentElement.style.removeProperty('--safe-bottom'); });
    await page.setViewportSize({ width: 375, height: 812 }); await page.waitForTimeout(300);
    const stick = (await read()).layout.joystick;
    await page.mouse.move(stick.x + 56, stick.y + 90); await page.mouse.down(); await page.waitForTimeout(200); await page.mouse.up();
    assert.ok((await read()).depth > 0, 'actual joystick touch must move the diver downward');
    // Click the actual Cocos pause touch target, then return through the modal.
    let s = await read(); const p = s.layout.pause;
    await page.mouse.click(p.x + p.width / 2, p.y + p.height / 2); await page.waitForTimeout(100);
    s = await read(); assert.ok(s.pauseReasons.includes('modal'));
    await invoke('onAdStarted'); await page.waitForTimeout(100);
    const hidden = (await read()).layout.secondary;
    await page.mouse.click(hidden.x + hidden.width / 2, hidden.y + hidden.height / 2);
    s = await read(); assert.equal(s.state, 'Running', 'invisible return action must not terminate the dive');
    assert.ok(s.pauseReasons.includes('modal'), 'waiting panel must retain the manual modal');
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    await invoke('onAdClosed'); const frozen = await read();
    assert.ok(frozen.pauseReasons.includes('background')); assert.ok(frozen.pauseReasons.includes('modal'));
    await page.waitForTimeout(200); assert.equal((await read()).tick, frozen.tick);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow')));
    const button = (await read()).layout.primary;
    await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
    await page.waitForTimeout(100); s = await read(); assert.ok(s.pauseReasons.includes('countdown'));
    await page.screenshot({ path: new URL(`countdown-${target}.png`, artifacts).pathname });
    await page.waitForTimeout(3300); assert.ok((await read()).tick > frozen.tick);
    const resumed = await page.evaluate(async () => {
      const { director } = await System.import('cc'); const c = director.getScene().getChildByName('Canvas').getComponent('DiveController');
      c.session.hide(); c.onShow(); c.update(99); return c.session.snapshot;
    });
    assert.equal(resumed.countdown, 3, 'first resumed frame cannot consume the hidden elapsed time');
    await page.waitForTimeout(3300);
    await page.evaluate(() => window.dispatchEvent(new Event('offline'))); const disconnected = await read();
    await page.waitForTimeout(150); assert.equal((await read()).tick, disconnected.tick);
    assert.ok(disconnected.pauseReasons.includes('reconnect'));
    await page.evaluate(() => window.dispatchEvent(new Event('online'))); await page.waitForTimeout(150);
    assert.ok((await read()).tick > disconnected.tick);
    // A short oxygen tank exercises the production low-O2 branch without a two-minute wait.
    await page.evaluate(async () => {
      const { director } = await System.import('cc'); const c = director.getScene().getChildByName('Canvas').getComponent('DiveController');
      const Session = c.session.constructor; c.session.battle.dispose();
      c.session = new Session({ diveId: 'oxygen-acceptance', oxygenCapacity: 0.6, battle: { spawn: false, weapons: [] } });
      for (let i = 0; i < 16; i++) c.session.advance(1 / 30);
    });
    await page.waitForTimeout(200); s = await read(); assert.equal(s.oxygen, 0); assert.equal(s.state, 'Running');
    assert.ok(s.hp < 200 && s.hp > 195); assert.deepEqual(s.pauseReasons, []);
    await page.screenshot({ path: new URL(`oxygen-${target}.png`, artifacts).pathname });
    // Force real model boundary conditions; UI and render continue using the production session.
    const diveId = (await read()).diveId;
    await page.evaluate(async () => {
      const { director } = await System.import('cc'); const s = director.getScene().getChildByName('Canvas').getComponent('DiveController').session;
      s.collect('crystal', 100); s.collect('pearl', 3); s.collect('marrow', 2); s.collect('core', 1);
      s.battle.player.hp = 0;
    });
    await page.waitForTimeout(100); assert.equal((await read()).state, 'RescuePending');
    await page.screenshot({ path: new URL(`rescue-${target}.png`, artifacts).pathname });
    assert.equal(await invoke('onRescueAuthorized', 'unclaimed-token'), false);
    await page.evaluate(async () => {
      const { director } = await System.import('cc'), c = director.getScene().getChildByName('Canvas').getComponent('DiveController');
      const token = c.economy.dispatch({ type: 'ad.prepare', opId: 'hud-rescue.prepare', slot: 'rescue', context: { diveId: c.session.diveId, eventId: c.session.deathEventId } }).token;
      c.economy.dispatch({ type: 'ad.complete', opId: 'hud-rescue.complete', token });
      c.economy.dispatch({ type: 'ad.claim', opId: 'hud-rescue.claim', token }); c.onRescueAuthorized(token);
    }); assert.equal((await read()).diveId, diveId);
    await page.evaluate(async () => { const { director } = await System.import('cc'); director.getScene().getChildByName('Canvas').getComponent('DiveController').session.battle.player.hp = 0; });
    await page.waitForTimeout(100); const secondary = (await read()).layout.secondary;
    await page.mouse.click(secondary.x + secondary.width / 2, secondary.y + secondary.height / 2);
    await page.waitForTimeout(100); s = await read(); assert.equal(s.state, 'Settled');
    assert.deepEqual(s.cargo, { crystal: 0, pearl: 3, marrow: 2, core: 1 });
    assert.equal(s.diveId, diveId);
    const pendingImage = await page.screenshot({ path: new URL(`pending-${target}.png`, artifacts).pathname });
    const color = await page.evaluate(async ({ encoded, x, y }) => {
      const image = new Image(); image.src = `data:image/png;base64,${encoded}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      return Array.from(context.getImageData(Math.floor(x * image.width / 375), Math.floor(y * image.height / 812), 1, 1).data);
    }, { encoded: pendingImage.toString('base64'), x: s.layout.modal.x + 8, y: s.layout.modal.y + 32 });
    assert.ok(color[1] > 30, 'disabled actions must preserve the visible modal panel');
    assert.deepEqual(errors, []);
    await writeFile(new URL(`result-${target}.json`, artifacts), JSON.stringify({ state: s, errors }, null, 2));
  }, { navigate: false });
});
