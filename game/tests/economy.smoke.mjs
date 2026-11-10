import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withBrowser } from './browser-helpers.mjs';
const target = process.env.WEB_TARGET || 'web-debug';
const root = fileURLToPath(new URL(`../build/${target}`, import.meta.url));
const artifacts = new URL('../.artifacts/economy/', import.meta.url);
test(`${target}: actual Cocos death checkpoint, browser refresh and settlement receipt preserve assets exactly once`, { timeout: 90000 }, async () => {
  await withBrowser(root, async (page, _browser, url) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    const enter = async () => {
      const boot = page.waitForEvent('console', { predicate: e => e.text() === '[Boot] ready (browser); protocol=1', timeout: 30000 });
      await page.goto(url); await boot;
      await page.evaluate(async () => { const { director } = await System.import('cc'); await new Promise((resolve, reject) => director.loadScene('Dive', error => error ? reject(error) : resolve())); });
    };
    const read = () => page.evaluate(async () => {
      const { director } = await System.import('cc'), c = director.getScene().getChildByName('Canvas').getComponent('DiveController');
      return { session: c.session.snapshot, state: c.economy.snapshot, pending: c.session.pendingSettlement, saveStatus: c.economy.saveStatus };
    });
    await enter();
    await page.evaluate(async () => {
      const { director } = await System.import('cc'), c = director.getScene().getChildByName('Canvas').getComponent('DiveController');
      c.session.battle.dispose(); c.session.collect('crystal', 77); c.session.collect('pearl', 2); c.session.collect('marrow', 3); c.session.collect('core', 1);
      c.session.battle.player.hp = 0; c.session.advance(0);
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
    });
    const death = await read(); assert.equal(death.session.state, 'RescuePending');
    await enter(); let restored = await read();
    assert.equal(restored.session.diveId, death.session.diveId); assert.equal(restored.session.state, 'RescuePending');
    assert.deepEqual(restored.session.cargo, { crystal: 77, pearl: 2, marrow: 3, core: 1 });
    await page.evaluate(async () => {
      const { director } = await System.import('cc');
      window.economyAcceptanceController = director.getScene().getChildByName('Canvas').getComponent('DiveController');
      window.economyAcceptanceController.session.declineRescue();
    });
    await page.waitForFunction(() => window.economyAcceptanceController.session.state === 'Settled');
    const settled = await read(); assert.equal(settled.session.state, 'Settled');
    assert.deepEqual(settled.state.wallet, { crystal: '0', pearl: '2', marrow: '3', core: '1' });
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: fileURLToPath(new URL(`settled-${target}.png`, artifacts)) });
    await enter(); restored = await read(); assert.deepEqual(restored.state.wallet, settled.state.wallet);
    assert.notEqual(restored.session.diveId, death.session.diveId);
    await page.evaluate(async ({ pending }) => { const { director } = await System.import('cc'); const c = director.getScene().getChildByName('Canvas').getComponent('DiveController');
      c.economy.dispatch({ type: 'dive.settle', opId: `settle:${pending.diveId}`, settlement: pending });
    }, { pending: settled.pending });
    assert.deepEqual((await read()).state.wallet, settled.state.wallet); assert.deepEqual(errors, []);
    await writeFile(new URL(`result-${target}.json`, artifacts), JSON.stringify({ death: death.session, settled: settled.state.wallet, restored: (await read()).state.wallet, errors }, null, 2));
  }, { navigate: false });
});
