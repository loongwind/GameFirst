import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const scripts = fileURLToPath(new URL('../assets/scripts/', import.meta.url));

/** Load current TS entirely in memory: no Cocos runtime or generated service artifacts. */
function transitionFixture(loadScene) {
  const cache = new Map();
  const cc = {
    _decorator: { ccclass: () => klass => klass },
    Component: class {},
    Color: class {},
    director: { loadScene },
  };
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = readFileSync(filename, 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true },
      fileName: filename,
    });
    const localRequire = id => {
      if (id === 'cc') return cc;
      if (id === 'cc/env') return { WECHAT: false };
      if (id.startsWith('.')) return load(resolve(dirname(filename), `${id}.ts`));
      return require(id);
    };
    runInThisContext(`(function(require, module, exports) {\n${outputText}\n})`, { filename })(localRequire, module, module.exports);
    return module.exports;
  }

  const { EconomyService } = load(resolve(scripts, 'services/local/EconomyService.ts'));
  const { LocalSaveService } = load(resolve(scripts, 'services/local/SaveService.ts'));
  const { LocalDiveService } = load(resolve(scripts, 'services/local/LocalDiveService.ts'));
  const { DiveController } = load(resolve(scripts, 'services/DiveController.ts'));
  const data = new Map();
  const economy = new EconomyService(new LocalSaveService({
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  }));
  const dives = new LocalDiveService(economy);
  const session = dives.open('harbor-transition');
  session.requestReturn();
  session.arriveHarbor();
  dives.settle(session);
  assert.equal(session.state, 'Settled');
  const controller = new DiveController();
  Object.assign(controller, { economy, dives, session });
  return { controller, economy };
}

test('backgrounding during delayed harbor loading preserves the cleared dive checkpoint', () => {
  let completeLoad;
  const { controller, economy } = transitionFixture((_scene, callback) => { completeLoad = callback; return true; });
  controller.handleAction('primary');
  assert.equal(economy.snapshot.activeDive, null);

  // Cocos still owns the Dive scene until its asynchronous load callback runs.
  controller.onHide();
  assert.equal(economy.snapshot.activeDive === null, true, 'onHide must not restore the settled dive while leaving for Harbor');
  completeLoad(null);
  assert.equal(economy.snapshot.activeDive, null);
});

test('a synchronously rejected harbor load restores the settled checkpoint and subsequent saving', () => {
  const { controller, economy } = transitionFixture(() => false);
  controller.handleAction('primary');
  assert.equal(economy.snapshot.activeDive?.session.state, 'Settled', 'rejected loading must restore the current dive checkpoint');
  assert.deepEqual(economy.snapshot.activeDive.session.pauseReasons, []);

  controller.onHide();
  assert.equal(economy.snapshot.activeDive?.session.state, 'Settled');
  assert.deepEqual(economy.snapshot.activeDive.session.pauseReasons, ['background'], 'saving must resume after loadScene returns false');
});
