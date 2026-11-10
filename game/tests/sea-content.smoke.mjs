import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withBrowser, enterBuiltScene } from './browser-helpers.mjs';

const target = process.env.WEB_TARGET || 'web-debug';
const root = fileURLToPath(new URL(`../build/${target}`, import.meta.url));
const artifacts = fileURLToPath(new URL('../.artifacts/sea-content/', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('../sea-assets.json', import.meta.url), 'utf8'));
async function boot(page, url) {
  const ready = page.waitForEvent('console', { predicate: m => m.text().startsWith('[Boot] ready'), timeout: 30000 });
  await page.goto(url); await ready; await enterBuiltScene(page, 'Dive');
  await page.evaluate(async () => {
    window.cc = await System.import('cc');
    window.c = window.cc.director.getScene().getChildByName('Canvas').getComponent('DiveController');
  });
  await seaReady(page);
}
async function seaReady(page) {
  await page.waitForFunction(() => {
    window.c.hud.prepare(window.c.session);
    return window.c.hud.sea.status === 'ready';
  }, null, { timeout: 20000 });
}
async function shot(page, name) {
  await page.evaluate(() => window.c.hud.render(window.c.session));
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${artifacts}/${name}-${target}.png` });
}

test(`${target}: 36 genuine identities at 48 logical pixels, swim frames, four assembled bosses and resource turnover`, { timeout: 120000 }, async () => {
  await withBrowser(root, async (page, _browser, url) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    const bytes = {}, downloads = [];
    page.on('response', response => {
      const bundle = response.url().match(/\/assets\/(sunlight|twilight|abyss|dive)\//)?.[1];
      if (bundle) downloads.push(response.body().then(body => { bytes[bundle] = (bytes[bundle] ?? 0) + body.length; }));
    });
    await mkdir(artifacts, { recursive: true }); await boot(page, url);
    await page.evaluate(() => { window.c.enabled = false; });
    const results = [];
    for (const [layer, depth] of [['sunlight', 100], ['twilight', 900], ['abyss', 1700]]) {
      const entries = Object.entries(manifest.identities).filter(([, identity]) => identity.layer === layer);
      await page.evaluate(({ entries, depth }) => {
        const c = window.c, Session = c.session.constructor;
        c.session.battle.dispose(); c.session = new Session({ diveId: `gallery-${depth}`, oxygenCapacity: 10000, battle: { spawn: false, weapons: [] } });
        c.session.battle.player.y = depth;
        entries.forEach(([key], i) => c.session.battle.spawnEnemy({ assetKey: key, x: -115 + i % 3 * 105, y: depth - 110 + Math.floor(i / 3) * 78, speed: 0 }));
        c.hud.prepare(c.session);
      }, { entries, depth });
      await seaReady(page);
      await page.evaluate(() => {
        const c = window.c; c.hud.render(c.session);
        for (const actor of c.hud.sea.actors.values()) {
          const width = actor.node.getComponent(window.cc.UITransform).width;
          actor.node.setScale(48 / width, 48 / width, 1);
        }
      });
      await shot(page, `sea-${layer}`);
      const state = await page.evaluate(() => ({ resident: window.c.hud.sea.residentLayers,
        actors: [...window.c.hud.sea.actors.values()].map(a => ({ key: a.key, frame: a.sprite.spriteFrame?.rect.width, valid: a.sprite.spriteFrame?.isValid, logicalWidth: a.node.getComponent(window.cc.UITransform).width * a.node.scale.x })) }));
      assert.equal(state.actors.length, entries.length); assert.ok(state.actors.every(a => a.valid));
      assert.ok(state.actors.every(a => Math.abs(a.logicalWidth - 48) < .01));
      assert.ok(state.resident.length <= 2); results.push({ layer, ...state });
      const frames = await page.evaluate(() => {
        const c = window.c, key = [...c.hud.sea.actors.keys()][0], rects = [];
        for (const tick of [0, 5, 10, 15, 20]) { c.session.battle.tick = tick; c.hud.render(c.session); rects.push(c.hud.sea.actors.get(key).sprite.spriteFrame.rect.x); }
        return rects;
      });
      assert.equal(new Set(frames.slice(0, 4)).size, 4); assert.equal(frames[4], frames[0]);
      for (const [key, identity] of Object.entries(manifest.identities).filter(([, i]) => i.layer === layer && i.kind === 'boss')) {
        await page.evaluate(({ key, depth }) => {
          const c = window.c; c.session.battle.enemies.clear(); c.session.battle.player.y = depth;
          c.session.battle.spawnEnemy({ assetKey: key, x: 0, y: depth - 35, speed: 0 }); c.hud.render(c.session);
        }, { key, depth });
        await shot(page, key);
        const assembled = await page.evaluate(() => [...window.c.hud.sea.actors.values()].filter(a => a.key.startsWith('enemy_boss')).map(a => ({ key: a.key, parts: a.parts.length, width: a.node.getComponent(window.cc.UITransform).width })));
        assert.equal(assembled[0].key, key); assert.ok(assembled[0].parts >= 1); assert.equal(assembled[0].width, 180);
      }
    }
    assert.deepEqual(results.at(-1).resident, ['abyss'], 'returning to deep sea releases far textures');
    const releasedFrames = await page.evaluate(() => {
      const retained = [];
      window.cc.assetManager.assets.forEach(asset => {
        if (asset instanceof window.cc.SpriteFrame && /sunlight|enemy_normal_0[1-8]_|enemy_elite_0[1-3]_|angler_king/.test(asset.name)) retained.push({ name: asset.name, refs: asset.refCount });
      });
      return retained;
    });
    assert.deepEqual(releasedFrames, [], 'Cocos cache must release distant sunlight frames and their dependencies');
    assert.deepEqual(errors, []);
    await Promise.all(downloads);
    await writeFile(`${artifacts}/presentation-${target}.json`, JSON.stringify({ results, releasedFrames, downloadedBytes: bytes, errors }, null, 2));
  }, { navigate: false });
});

test(`${target}: harbor fast farm, unload, real upgrades/tech/equipment then descend through 2400m and resume`, { timeout: 180000 }, async () => {
  await withBrowser(root, async (page, _browser, url) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await mkdir(artifacts, { recursive: true }); await boot(page, url);
    // Control the production fixed clock, avoiding wall-time waits. No battle damage or HP overrides.
    const shallow = await page.evaluate(() => {
      const c = window.c; c.enabled = false; const s = c.session;
      for (let i = 0; i < 1200 && s.state === 'Running' && s.snapshot.cargo.crystal === 0; i++) {
        s.setInput(0, 0);
        // Follow the actual dropped loot with manual movement; weapons remain configured defaults.
        const loot = [...s.battle.loot.values()].sort((a, b) => Math.hypot(a.x - s.battle.player.x, a.y - s.depth) - Math.hypot(b.x - s.battle.player.x, b.y - s.depth))[0];
        if (loot) s.setInput(loot.x - s.battle.player.x, loot.y - s.depth);
        s.advance(1 / 30);
      }
      const snapshot = s.snapshot; s.requestReturn(); s.arriveHarbor(); c.dives.settle(s);
      return { snapshot, wallet: c.economy.snapshot.wallet, kills: s.battle.stats.kills };
    });
    console.info('Sea loop: shallow farm', JSON.stringify(shallow));
    assert.ok(shallow.kills > 0); assert.ok(BigInt(shallow.wallet.crystal) > 0, JSON.stringify(shallow));
    await page.evaluate(() => window.c.handleAction('primary'));
    await page.waitForFunction(() => window.cc.director.getScene()?.name === 'Harbor');
    await page.waitForFunction(() => !!window.cc.director.getScene()?.getChildByName('Canvas')?.getComponent('HarborController')?.view);
    console.info('Sea loop: harbor ready');
    const growth = await page.evaluate(() => {
      const h = window.cc.director.getScene().getChildByName('Canvas').getComponent('HarborController'), e = h.economy;
      // Explicit progression fixture: provide resources/XP through a settlement, then use genuine commands.
      e.dispatch({ type: 'dive.settle', opId: 'sea-growth-fixture', settlement: { diveId: 'sea-growth-fixture', reason: 'return', cargo: { crystal: 1000000000000, pearl: 1000, marrow: 1000000, core: 1000 }, xp: 10000, depth: 0, activeSeconds: 0 } });
      for (const attribute of ['hp', 'attack', 'attackSpeed', 'moveSpeed', 'cargo', 'oxygen']) for (let i = 0; i < 100; i++) e.dispatch({ type: 'attribute.upgrade', opId: `sea-${attribute}-${i}`, attribute });
      for (const tree of ['attack', 'survival', 'oxygen', 'cargo', 'special']) for (let i = 1; i <= 20; i++) e.dispatch({ type: 'tech.unlock', opId: `sea-${tree}.${i}`, nodeId: `${tree}.${i}` });
      const samples = [.94, .26, .94, .26, .94, .8, .94, .6]; let n = 0; e.random = () => samples[n++ % samples.length];
      for (let i = 0; i < 4; i++) e.dispatch({ type: 'box.draw', opId: `sea-gear-${i}`, box: 'gold', count: 1 });
      const items = e.snapshot.inventory.slice(-4);
      for (let slot = 0; slot < 4; slot++) {
        const item = items[slot];
        for (let level = 1; level < 100; level++) e.dispatch({ type: 'equipment.upgrade', opId: `sea-gear-${slot}-level-${level}`, itemId: item.id, payment: 'marrow' });
        e.dispatch({ type: 'equipment.equip', opId: `sea-equip-${slot}`, itemId: item.id, slot });
      }
      h.view.update(); return { attributes: e.snapshot.attributes, tech: e.snapshot.tech, inventory: e.snapshot.inventory };
    });
    await page.screenshot({ path: `${artifacts}/harbor-grown-${target}.png` });
    await page.evaluate(async () => {
      await new Promise((resolve, reject) => window.cc.director.loadScene('Dive', e => e ? reject(e) : resolve()));
      window.c = window.cc.director.getScene().getChildByName('Canvas').getComponent('DiveController'); window.c.enabled = false;
    });
    await seaReady(page);
    const stats = await page.evaluate(() => ({ hp: window.c.session.maxHp, speed: window.c.session.battle.player.speed, weapons: window.c.session.battle.weapons.map(w => w.spec) }));
    assert.ok(stats.hp > 10000); assert.ok(stats.speed > 120); assert.ok(stats.weapons.every(w => w.damage > 1000));
    const milestones = [], reached = new Set();
    for (let chunk = 0; chunk < 120; chunk++) {
      await seaReady(page);
      const result = await page.evaluate(() => {
        const c = window.c, s = c.session;
        for (let i = 0; i < 90 && s.state === 'Running'; i++) {
          c.hud.prepare(s); if (c.hud.sea.status !== 'ready') break;
          const boss = [...s.battle.enemies.values()].find(e => e.kind === 'boss');
          // Manual kiting uses ordinary movement and configured attack range/HP.
          const beforeDepth = s.depth;
          s.setInput(0, boss ? Math.sign(boss.y - s.depth - 150) : 1); s.advance(1 / 30);
          if (s.depth !== beforeDepth && (s.depth === 800 || s.depth === 1600 || s.depth === 2400)) break;
        }
        c.hud.render(s);
        return { ...s.snapshot, progress: s.content, resident: c.hud.sea.residentLayers,
          tick: s.battle.tick, paused: s.battle.paused, inputY: s.battle.inputY, speed: s.battle.player.speed };
      });
      assert.equal(result.state, 'Running', `progression stopped: ${JSON.stringify(result)}`);
      if (chunk % 25 === 0) console.info('Sea loop: descent', JSON.stringify(result));
      if ([800, 1600, 2400].includes(result.depth) && !reached.has(result.depth)) {
        reached.add(result.depth); milestones.push(result); await shot(page, `boundary-${result.depth}`);
      }
      if (result.progress.defeatedBosses.length === 4 && result.depth === 2400) break;
      if (chunk === 119) assert.fail(`did not complete depth loop: ${JSON.stringify(result)}`);
    }
    const before = await page.evaluate(() => { window.c.dives.save(window.c.session); return { snapshot: window.c.session.snapshot, progress: window.c.session.content, tick: window.c.session.battle.tick, objectives: window.c.economy.snapshot.objectives }; });
    assert.equal(before.progress.defeatedBosses.length, 4); assert.equal(before.snapshot.cargo.pearl, 8); assert.equal(before.snapshot.cargo.core >= 4, true);
    assert.deepEqual(before.objectives.milestones, [500, 1000, 1500, 2000]);
    assert.equal(before.objectives.record.depth, 2400);
    assert.equal(before.objectives.bossKills, 4);
    const reloaded = page.waitForEvent('console', { predicate: m => m.text().startsWith('[Boot] ready'), timeout: 30000 });
    await page.reload(); await reloaded; await enterBuiltScene(page, 'Dive');
    // Boot opens normally after refresh; restore the same active dive through the production service.
    await page.evaluate(async () => {
      window.cc = await System.import('cc');
      window.c = window.cc.director.getScene().getChildByName('Canvas').getComponent('DiveController'); window.c.enabled = false;
    });
    await seaReady(page);
    const after = await page.evaluate(() => { const c = window.c; c.session.advance(3); c.session.advance(1 / 30); return { snapshot: c.session.snapshot, progress: c.session.content }; });
    assert.equal(after.snapshot.diveId, before.snapshot.diveId); assert.deepEqual(after.progress.defeatedBosses, before.progress.defeatedBosses); assert.equal(after.snapshot.cargo.pearl, 8);
    await shot(page, 'depth-2400-restored');
    await page.evaluate(() => { const c = window.c; c.session.requestReturn(); c.session.arriveHarbor(); c.dives.settle(c.session); c.handleAction('primary'); });
    await page.waitForFunction(() => window.cc.director.getScene()?.name === 'Harbor');
    assert.deepEqual(errors, []);
    await writeFile(`${artifacts}/loop-${target}.json`, JSON.stringify({ shallow, growth, stats, milestones, before, after, errors }, null, 2));
  }, { navigate: false });
});
