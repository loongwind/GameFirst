import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadServices, memoryStorage } from './services-loader.mjs';
const api = loadServices();
const make = (storage = memoryStorage(), now = () => 1794300000000) => {
  const economy = new api.EconomyService(new api.LocalSaveService(storage), { now });
  return { economy, dives: new api.LocalDiveService(economy, now), storage };
};
function run(s, seconds) { for (let i = 0; i < seconds * 30; i++) s.advance(1 / 30); }
function teaching(e, id) {
  const s = e.dives.open(id, { battle: { spawn: false } });
  s.battle.spawnEnemy({ x: 0, y: 0, hp: 1 });
  s.setInput(1, 0); run(s, 1); s.setInput(0, 0); run(s, 60);
  e.dives.save(s); return s;
}
function finish(e, s) { s.requestReturn(); s.arriveHarbor(); e.dives.settle(s); }

test('first tutorial pays a fixed 500 in the settlement transaction, restores, upgrades and redive completes all six steps', () => {
  const e = make(), s = teaching(e, 'first');
  assert.equal(e.economy.snapshot.objectives.tutorial.step, 4);
  assert.ok(s.battle.stats.kills > 0); assert.ok(s.snapshot.cargo.crystal > 0);
  finish(e, s); assert.equal(e.economy.snapshot.wallet.crystal, '500');
  assert.equal(e.economy.snapshot.objectives.tutorial.step, 5);
  const restored = make(e.storage);
  restored.economy.dispatch({ type: 'attribute.upgrade', opId: 'cargo', attribute: 'cargo' });
  assert.equal(restored.economy.snapshot.wallet.crystal, '420');
  restored.economy.checkpoint(null); restored.dives.open('second', { battle: { spawn: false } });
  assert.equal(restored.economy.snapshot.objectives.tutorial.completed, true);
  assert.deepEqual([...new Set(restored.economy.snapshot.events.filter(e => e.name === 'tutorial_step').map(e => e.properties.step))], [1, 2, 3, 4, 5, 6]);
  assert.equal(restored.economy.snapshot.events.filter(e => e.name === 'dive_start').length, 2);
});
test('replay repeats real combat but never grants another first reward or double counts a finalized dive', () => {
  const e = make(); finish(e, teaching(e, 'one'));
  e.economy.dispatch({ type: 'attribute.upgrade', opId: 'oxygen', attribute: 'oxygen' });
  e.economy.checkpoint(null); const second = e.dives.open('two', { battle: { spawn: false } });
  finish(e, second); e.economy.checkpoint(null);
  e.economy.dispatch({ type: 'tutorial.replay', opId: 'replay' });
  const s = teaching(e, 'replay-dive'), before = BigInt(e.economy.snapshot.wallet.crystal);
  finish(e, s);
  assert.equal(BigInt(e.economy.snapshot.wallet.crystal) - before, BigInt(s.snapshot.cargo.crystal));
  e.economy.dispatch({ type: 'dive.settle', opId: 'again', settlement: s.pendingSettlement });
  assert.equal(e.economy.snapshot.objectives.completedDives.length, 2);
  assert.equal(e.economy.snapshot.events.filter(e => e.name === 'deposit_done' && e.properties.tutorial_reward === true).length, 1);
  e.economy.checkpoint(null);
  e.economy.dispatch({ type: 'attribute.upgrade', opId: 'replay-cargo', attribute: 'cargo' });
  e.dives.open('after-replay', { battle: { spawn: false } });
  assert.equal(e.economy.snapshot.objectives.tutorial.active, false);
  assert.deepEqual(e.economy.snapshot.events.filter(e => e.name === 'tutorial_step' && e.properties.run === 1).map(e => e.properties.step), [1, 2, 3, 4, 5, 6]);
});
test('three genuine completed dives unlock the first day claim; telemetry, rescue and repeat snapshots cannot inflate progress', () => {
  const e = make();
  e.economy.dispatch({ type: 'telemetry.record', opId: 'fake', name: 'dive_end', properties: { duration_s: 99 } });
  assert.throws(() => e.economy.dispatch({ type: 'task.claim', opId: 'early', taskId: 'first-day' }), /TASK_INELIGIBLE/);
  for (let i = 0; i < 3; i++) {
    const s = e.dives.open(`trip-${i}`, { battle: { spawn: false } });
    s.battle.spawnEnemy({ x: 0, y: 0, hp: 1 }); run(s, 1);
    if (!i) { s.battle.player.hp = 0; s.advance(0); assert.equal(s.state, 'RescuePending'); s.rescue('unit-rescue'); }
    e.dives.save(s); e.dives.save(s); finish(e, s); e.dives.save(s); e.economy.checkpoint(null);
  }
  assert.equal(e.economy.snapshot.objectives.completedDives.length, 3);
  const task = api.objectiveTasks(e.economy.snapshot).find(t => t.kind === 'first-day');
  assert.equal(task.progress, 3); assert.equal(task.ready, true);
  const xp = e.economy.snapshot.totalXp;
  const a = { type: 'task.claim', opId: 'claim', taskId: task.id };
  e.economy.dispatch(a); make(e.storage).economy.dispatch(a);
  e.economy.dispatch({ ...a, opId: 'another-claim' });
  assert.equal(e.economy.snapshot.totalXp, xp + 20);
});
test('depth is monotonic per dive, milestones and encounter silhouettes survive reload and task claims use unique instances', () => {
  const e = make(), s = e.dives.open('depth', { battle: { spawn: false, content: false } });
  s.setInput(0, 1); run(s, 9); e.dives.save(s); e.dives.save(s);
  const p = e.economy.snapshot.objectives;
  assert.equal(p.milestones.length, 2); assert.ok(p.totalDepth >= 1000);
  s.setInput(0, -1); run(s, 2); e.dives.save(s);
  s.setInput(0, 1); run(s, 2); e.dives.save(s);
  assert.equal(e.economy.snapshot.objectives.totalDepth, p.totalDepth);
  const task = api.objectiveTasks(e.economy.snapshot).find(t => t.kind === 'rotation');
  assert.equal(task.ready, true);
  const xp = e.economy.snapshot.totalXp;
  e.economy.dispatch({ type: 'task.claim', opId: 'depth-claim', taskId: task.id });
  assert.equal(e.economy.snapshot.totalXp, xp + 20);
  assert.notEqual(api.objectiveTasks(e.economy.snapshot).find(t => t.kind === 'rotation').id, task.id);
  const reopened = make(e.storage).economy.snapshot;
  assert.deepEqual(reopened.objectives.milestones, [500, 1000]);
  assert.equal(reopened.events.filter(e => e.name === 'depth_record').length, 2);
});
test('failed durable claim can retry the original instance after reopen without losing progress', () => {
  const e = make(), s = e.dives.open('save-depth', { battle: { spawn: false, content: false } });
  s.setInput(0, 1); run(s, 9); e.dives.save(s);
  const task = api.objectiveTasks(e.economy.snapshot).find(t => t.kind === 'rotation');
  const a = { type: 'task.claim', opId: 'durable-claim', taskId: task.id };
  e.storage.fail = true; assert.throws(() => e.economy.dispatch(a), /quota/);
  e.storage.fail = false; const r = make(e.storage); r.economy.dispatch(a); r.economy.dispatch(a);
  assert.equal(r.economy.snapshot.totalXp, 20);
});

test('arbitrary eligibility callbacks cannot mint task XP or fabricate a task instance', () => {
  const e = make();
  const service = new api.EconomyService(new api.LocalSaveService(e.storage), { taskEligible: () => true });
  assert.throws(() => service.dispatch({ type: 'task.claim', opId: 'forged', taskId: 'not-an-issued-instance' }), /TASK_INELIGIBLE/);
});
test('refresh under a cargo blessing restores the original start receipt without reusing its fingerprint', () => {
  const e = make(), s = e.dives.open('buff-refresh', { battle: { spawn: false } });
  s.setBenefits({ yield: 1, oxygen: 1.2, cargo: 1.2 }); e.dives.save(s);
  const restored = make(e.storage).dives.open('ignored');
  assert.equal(restored.diveId, s.diveId); assert.equal(restored.cargoCapacity, s.cargoCapacity);
  assert.equal(e.economy.snapshot.events.filter(e => e.name === 'dive_start').length, 1);
});
test('first reward survives a committed response loss and retries the original finalization exactly once', () => {
  const e = make(), s = teaching(e, 'lost-response');
  s.requestReturn(); s.arriveHarbor();
  const set = e.storage.setItem.bind(e.storage); let fail = true;
  e.storage.setItem = (key, raw) => {
    set(key, raw);
    if (fail && JSON.parse(raw).payload.state.receipts['settle:lost-response']) { fail = false; throw new Error('response lost'); }
  };
  assert.throws(() => e.dives.settle(s), /response lost/);
  const restored = make(e.storage), resumed = restored.dives.open('ignored');
  assert.equal(resumed.state, 'PendingSettlement'); restored.dives.settle(resumed);
  assert.equal(restored.economy.snapshot.wallet.crystal, '500');
  assert.equal(restored.economy.snapshot.objectives.completedDives.length, 1);
});
test('three accepted boss identities count once per original dive, and encountered silhouettes survive dead enemies and reload', () => {
  const e = make(), s = e.dives.open('bosses', { battle: { spawn: false, content: true } });
  for (const [assetKey, depth] of [['enemy_boss_01_angler_king', 100], ['enemy_boss_02_tentacle_warden', 900], ['enemy_boss_04_abyss_whale', 1700]]) {
    s.battle.player.y = depth;
    s.battle.spawnEnemy({ x: 0, y: depth, hp: 1, assetKey }); run(s, 2);
  }
  s.setInput(0, 1); run(s, 1); e.dives.save(s); e.dives.save(s);
  assert.equal(e.economy.snapshot.objectives.bossKills, 3);
  assert.equal(e.economy.snapshot.objectives.record.encounters.length, 3);
  const r = make(e.storage).dives.open('ignored');
  assert.equal(r.checkpoint().battle.encounters.length, 3);
});
test('legacy checksum snapshots migrate without issuing another onboarding reward', () => {
  const storage = memoryStorage(), state = api.initialState();
  delete state.objectives; state.settlements.legacy = 'legacy'; state.wallet.crystal = '123';
  const payload = { schemaVersion: 1, cloudRev: 0, sessionEpoch: 1, state }, sequence = 1;
  storage.setItem('save-v1:1', JSON.stringify({ sequence, payload, checksum: api.checksum(JSON.stringify({ sequence, payload })) }));
  const e = make(storage).economy;
  assert.equal(e.snapshot.wallet.crystal, '123'); assert.equal(e.snapshot.objectives.tutorial.completed, true);
  e.dispatch({ type: 'tutorial.replay', opId: 'legacy-replay' });
  assert.equal(e.snapshot.objectives.tutorial.rewarded, true);
});
test('teaching paces ordinary encounters without replacing HP, damage, growth or the later free-dive profile', () => {
  const e = make(), normal = api.combatLoadout(e.economy.snapshot), teaching = api.tutorialLoadout(e.economy.snapshot, normal);
  assert.equal(teaching.battle.spawnIntervalTicks, 90);
  assert.equal(teaching.maxHp, normal.maxHp); assert.deepEqual(teaching.battle.weapons, normal.battle.weapons);
  const state = e.economy.snapshot; state.objectives.tutorial.active = false;
  assert.deepEqual(api.tutorialLoadout(state, normal), normal);
});
test('refreshing a settled tutorial restores the receipt screen and still requires the real harbor upgrade before redive', () => {
  const e = make(), s = teaching(e, 'settled-refresh'); finish(e, s);
  const r = make(e.storage), restored = r.dives.open('must-not-start');
  assert.equal(restored.state, 'Settled'); assert.equal(restored.diveId, 'settled-refresh');
  assert.equal(r.economy.snapshot.wallet.crystal, '500');
  assert.equal(r.economy.snapshot.objectives.tutorial.step, 5);
  assert.equal(r.economy.snapshot.events.filter(e => e.name === 'dive_start').length, 1);
});
