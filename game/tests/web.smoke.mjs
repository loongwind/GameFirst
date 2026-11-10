import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { withBrowser, enterBuiltScene } from './browser-helpers.mjs';

const target = process.env.WEB_TARGET || 'web-debug';
if (!['web-debug', 'web-release'].includes(target)) throw new Error('Invalid WEB_TARGET');
const root = fileURLToPath(new URL(`../build/${target}`, import.meta.url));
const artifacts = fileURLToPath(new URL('../.artifacts', import.meta.url));

test(`${target}: Boot starts in the browser, renders frames, and loads Dive/Harbor`, { timeout: 90_000 }, async () => {
  await withBrowser(root, async (page, _browser, url) => {
    const errors = [];
    const logs = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
      if (message.text().includes('[Boot]')) logs.push(message.text());
    });
    const ready = page.waitForEvent('console', {
      predicate: message => message.text() === '[Boot] ready (browser); protocol=1', timeout: 60_000,
    });
    await page.goto(url);
    await ready;
    await enterBuiltScene(page, 'Dive');
    const state = await page.evaluate(async () => {
      const { director, Director } = await System.import('cc');
      await new Promise(resolve => {
        let remaining = 6;
        const afterDraw = () => {
          if (--remaining === 0) {
            director.off(Director.EVENT_AFTER_DRAW, afterDraw);
            resolve();
          }
        };
        director.on(Director.EVENT_AFTER_DRAW, afterDraw);
      });
      return { scene: director.getScene().name, frames: director.getTotalFrames(), canvasWidth: document.querySelector('canvas').width, canvasHeight: document.querySelector('canvas').height };
    });
    assert.equal(state.scene, 'Dive');
    assert.ok(state.frames > 5);
    assert.ok(state.canvasWidth > 0 && state.canvasHeight > 0);
    assert.ok(logs.some(line => line === '[Boot] ready (browser); protocol=1'), `Boot init missing: ${logs}`);
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: path.join(artifacts, `boot-${target}.png`) });
    const scenes = [];
    for (const scene of ['Harbor', 'Dive']) {
      const loaded = await page.evaluate(async name => {
        const { director } = await System.import('cc');
        return new Promise((resolve, reject) => director.loadScene(name, error => {
          if (error) reject(error); else resolve(director.getScene().name);
        }));
      }, scene);
      assert.equal(loaded, scene);
      scenes.push(loaded);
    }
    assert.deepEqual(errors, []);
    await writeFile(path.join(artifacts, `${target}-result.json`), JSON.stringify({ target, state, scenes, errors, bootLogs: logs }, null, 2));
  }, { navigate: false });
});
