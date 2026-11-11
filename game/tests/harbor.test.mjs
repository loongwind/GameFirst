import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { loadServices, memoryStorage } from './services-loader.mjs';
const require = createRequire(import.meta.url);
let loaded;
function harbor() {
  assert.ok(existsSync(new URL('../assets/scripts/meta/HarborModel.ts', import.meta.url)), 'Harbor presentation model must exist');
  if (!loaded) { execFileSync(new URL('../node_modules/.bin/tsc', import.meta.url).pathname, ['-p', 'tsconfig.harbor.json'], { cwd: new URL('..', import.meta.url), stdio: 'inherit' });
    loaded = { ...require('../.artifacts/harbor/assets/scripts/meta/HarborModel.js'), ...require('../.artifacts/harbor/assets/scripts/ui/harborLayout.js') }; }
  return loaded;
}
test('harbor touch targets fit three heights, capsule and all safe area edges', () => {
  const { harborLayout } = harbor();
  for (const height of [667, 750, 812]) for (const safe of [{ top: 0, bottom: 0, left: 0, right: 0, capsuleBottom: 0 }, { top: 44, bottom: 34, left: 8, right: 8, capsuleBottom: 88 }]) {
    const l = harborLayout(375, height, safe);
    for (const r of Object.values(l.targets)) {
      assert.ok(r.width >= 44 && r.height >= 44);
      assert.ok(r.x >= safe.left && r.x + r.width <= 375 - safe.right);
      assert.ok(r.y >= safe.capsuleBottom && r.y + r.height <= height - safe.bottom);
    }
    assert.ok(l.panel.y >= Math.max(safe.top, safe.capsuleBottom));
    assert.ok(l.panel.y + l.panel.height <= height - (safe.bottom ?? 0));
  }
  assert.equal(harborLayout(750, 1624, { top: 88, bottom: 68 }).height, 812);
});

test('harbor uses actual CSS viewport for targets and focuses one launch on compact and safe screens', () => {
  const { harborLayout } = harbor();
  for (const [cssWidth, cssHeight, top, bottom] of [[320,640,44,34],[375,667,0,0],[390,844,44,34],[375,400,0,0]]) {
    const ratio = 375 / cssWidth, l = harborLayout(375, cssHeight * ratio, { top: top * ratio, bottom: bottom * ratio }, { width: cssWidth, height: cssHeight });
    assert.ok(l.touch * cssWidth / 375 >= 43.99);
    assert.equal(Object.keys(l.targets).filter(n => /launch/.test(n)).length, 1);
    assert.ok(!('gift' in l.targets) && !('sonar' in l.targets), 'supply subfeatures belong in supply');
    for (const rect of Object.values(l.targets)) {
      assert.ok(rect.height * cssWidth / 375 >= 43.99);
      assert.ok(rect.y >= top * ratio && rect.y + rect.height <= (cssHeight-bottom) * ratio);
    }
    assert.ok(l.panel.height >= 250 && l.panel.y >= top * ratio);
  }
});
test('cost previews use shared formulas and synthesis requires explicit main and actual auxiliary investments', () => {
  const { HarborModel } = harbor(), { EconomyService, LocalSaveService } = loadServices();
  const e = new EconomyService(new LocalSaveService(memoryStorage())); const m = new HarborModel(e);
  assert.equal(m.attributes()[0].cost.crystal, '80'); assert.equal(m.attributes().length, 6);
  assert.equal(m.tech('attack').length, 20); assert.equal(m.tech('attack')[1].enabled, false);
  const item = (id, level, marrow, tickets) => ({ id, template: 'sonic', quality: 0, level, locked: false, equipped: false, invested: { marrow, tickets } });
  assert.throws(() => m.synthesis([item('a', 1, '0', 0), item('b', 8, '77', 2), item('c', 4, '21', 1)], ''), /main/i);
  const p = m.synthesis([item('a', 1, '0', 0), item('b', 8, '77', 2), item('c', 4, '21', 1)], 'a');
  assert.equal(p.item.level, 1); assert.deepEqual(p.refund, { marrow: '98', tickets: 3 });
  assert.deepEqual(m.redDots(), []); assert.equal(m.adRemaining('gift'), 0);
  m.dispose();
});
test('failed async command keeps same opId, duplicate taps do not spend twice and unsubscribed panels receive nothing', async () => {
  const { HarborModel } = harbor(), { EconomyService, LocalSaveService } = loadServices();
  const storage = memoryStorage(), e = new EconomyService(new LocalSaveService(storage));
  e.dispatch({ type: 'dive.settle', opId: 'seed', settlement: { diveId: 'seed', reason: 'return', cargo: { crystal: 1000, pearl: 0, marrow: 0, core: 0 }, depth: 0, activeSeconds: 0 } });
  const sent = []; const m = new HarborModel({ get snapshot() { return e.snapshot; }, async dispatch(a) { sent.push(a.opId); await Promise.resolve(); return e.dispatch(a); } });
  let notifications = 0; const off = m.subscribe(() => notifications++); storage.fail = true;
  const first = m.execute({ type: 'attribute.upgrade', attribute: 'hp' });
  await assert.rejects(m.execute({ type: 'attribute.upgrade', attribute: 'hp' }), /BUSY/); await first;
  assert.equal(m.phase, 'error'); assert.equal(e.snapshot.wallet.crystal, '1000');
  off(); const before = notifications; storage.fail = false; await m.retry();
  assert.equal(m.phase, 'normal'); assert.equal(e.snapshot.wallet.crystal, '920'); assert.equal(e.snapshot.attributes.hp, 1);
  assert.equal(new Set(sent).size, 1); assert.equal(notifications, before);
  m.dispose(); assert.equal(m.listenerCount, 0);
});
test('virtual range bounds nodes at inventory capacity and clamps overscroll', () => {
  const { virtualRange } = harbor();
  assert.deepEqual(virtualRange(200, 100000, 240, 72), { start: 195, end: 200 });
  assert.ok(virtualRange(200, 720, 240, 72).end - virtualRange(200, 720, 240, 72).start <= 7);
  assert.deepEqual(virtualRange(0, 0, 240, 72), { start: 0, end: 0 });
});
test('full inventory blocks rewarded box before video, and pending reward permits only synthesis to free space', async () => {
  const { HarborModel } = harbor(), { EconomyService, LocalSaveService } = loadServices();
  const storage = memoryStorage();
  const e = new EconomyService(new LocalSaveService(storage), { random: () => 0 });
  e.dispatch({ type: 'dive.settle', opId: 'seed-capacity', settlement: { diveId: 'seed-capacity', reason: 'return', cargo: { crystal: 0, pearl: 10000, marrow: 0, core: 0 }, xp: 10000, depth: 0, activeSeconds: 0 } });
  for (let i = 0; i < 20; i++) e.dispatch({ type: 'box.draw', opId: `cap-box-${i}`, box: 'silver', count: 10 });
  let watches = 0;
  const ads = { async watch() { watches++; return { status: 'pending' }; }, async retryClaim() { return { status: 'completed' }; } };
  const m = new HarborModel(e, ads); await m.watch('silver');
  assert.equal(watches, 0); assert.equal(m.phase, 'error'); assert.match(m.notice, /收纳舱/);
  await m.retry(); await m.watch('gift'); assert.equal(watches, 1); assert.equal(m.rewardPending, true);
  const ids = e.snapshot.inventory.slice(0, 3).map(i => i.id);
  storage.fail = true; await m.execute({ type: 'equipment.synthesize', itemIds: ids, mainId: ids[0] });
  assert.equal(e.snapshot.inventory.length, 200); storage.fail = false; await m.retry();
  assert.equal(e.snapshot.inventory.length, 198); assert.equal(m.rewardPending, true);
  await m.retry(); assert.equal(m.hasPending, false);
});
test('reward confirmation retries the original AdService token without replay; buff labels follow absolute time', async () => {
  const { HarborModel } = harbor(), { EconomyService, LocalSaveService, AdService } = loadServices();
  const storage = memoryStorage(); let now = 1000000, shows = 0;
  const e = new EconomyService(new LocalSaveService(storage), { now: () => now, random: () => 0 });
  e.dispatch({ type: 'dive.settle', opId: 'seed-ad', settlement: { diveId: 'seed-ad', reason: 'return', cargo: { crystal: 0, pearl: 0, marrow: 0, core: 0 }, xp: 500, depth: 0, activeSeconds: 0 } });
  const ads = new AdService(e, { isMock: true, async load() {}, async show() { shows++; storage.fail = true; return 'completed'; } });
  const m = new HarborModel(e, ads, () => now);
  await m.watch('blessing', { choice: 'oxygen' }); const token = e.snapshot.pendingAd;
  assert.ok(token); assert.equal(m.rewardPending, true); await m.watch('blessing', { choice: 'oxygen' }); assert.equal(shows, 1);
  storage.fail = false; await m.retry(); assert.equal(m.hasPending, false); assert.equal(e.snapshot.intents[token].status, 'claimed'); assert.equal(shows, 1);
  assert.equal(m.buffSeconds('blessing'), 1200); now += 900000; assert.equal(m.buffSeconds('blessing'), 300); now += 301000; assert.equal(m.buffSeconds('blessing'), 0);
  assert.deepEqual(m.redDots(), []); m.dispose();
});
