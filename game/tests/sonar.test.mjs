import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadBattle } from './battle-loader.mjs';
import { loadServices, memoryStorage } from './services-loader.mjs';
const { DiveSession, Battle } = loadBattle(), api = loadServices();
const benefits = sonar => ({ yield: 1, oxygen: 1, cargo: 1, sonar });
const steps = (s, n) => { for (let i = 0; i < n; i++) s.advance(1/30); };
test('sonar moves toward loot; manual vector and neutral held joystick take immediate priority; expiry stops movement', () => {
  const s = new DiveSession({ diveId: 'sonar', battle: { spawn: false, weapons: [] } });
  s.battle.addLoot(90, 0, 10); s.setBenefits(benefits(true)); steps(s, 25);
  assert.equal(s.snapshot.cargo.crystal, 10);
  s.setInput(-1, 0); const x = s.battle.player.x; steps(s, 1); assert.ok(s.battle.player.x < x);
  s.setInput(0, 0, true); const held = s.battle.player.x; steps(s, 5); assert.equal(s.battle.player.x, held);
  s.setInput(0, 0); s.setBenefits(benefits(false)); const p = { x: s.battle.player.x, y: s.battle.player.y };
  steps(s, 20); assert.deepEqual({ x: s.battle.player.x, y: s.battle.player.y }, p);
});
test('free automatic attacks work without sonar; authorized movement seeks enemies and retreats from contact', () => {
  const b = new Battle({ spawn: false }); b.spawnEnemy({ x: 50, y: 0, hp: 1, speed: 0 }); b.advance(.1); assert.equal(b.stats.kills, 1);
  const s = new DiveSession({ diveId: 'seek', battle: { spawn: false, weapons: [] } });
  const enemy = s.battle.spawnEnemy({ x: 220, y: 0, speed: 0 }); s.setBenefits(benefits(true)); steps(s, 5); assert.ok(s.battle.player.x > 0);
  enemy.x = s.battle.player.x + 25; const x = s.battle.player.x; steps(s, 1); assert.ok(s.battle.player.x < x);
});
test('local steering skirts a solid obstacle, collects behind it and restores terrain checkpoint', () => {
  const s = new DiveSession({ diveId: 'avoid', battle: { spawn: false, weapons: [], obstacles: [{ x: 60, y: 0, radius: 24 }] } });
  s.battle.addLoot(135, 0, 10); s.setBenefits(benefits(true));
  let sideways = false;
  for (let i = 0; i < 150; i++) { steps(s, 1); sideways ||= Math.abs(s.battle.player.y) > 8; assert.ok(Math.hypot(s.battle.player.x - 60, s.battle.player.y) >= 36 - 1e-6); }
  assert.equal(sideways, true); assert.equal(s.snapshot.cargo.crystal, 10);
  assert.deepEqual(DiveSession.restore(s.checkpoint()).battle.obstacles, s.battle.obstacles);
});
test('danger retreat and low oxygen override pickups; stacked pauses freeze active time', () => {
  const s = new DiveSession({ diveId: 'danger', oxygenCapacity: 1, battle: { spawn: false, weapons: [], dangerZones: [{ x: 30, y: 0, radius: 40 }] } });
  s.battle.addLoot(60, 0, 10); s.setBenefits(benefits(true)); steps(s, 1); assert.ok(s.battle.player.x < 0);
  steps(s, 26); s.battle.player.y = 100; s.setInput(0, 0); const depth = s.depth; steps(s, 1); assert.ok(s.depth < depth);
  s.pause.add('ad'); s.hide(); const before = s.snapshot; steps(s, 30); assert.deepEqual(s.snapshot, before);
});
test('absolute sonar expires during background and ads; <=60s renews from now rather than extending', async () => {
  let now = Date.UTC(2026, 10, 10);
  const economy = new api.EconomyService(new api.LocalSaveService(memoryStorage()), { now: () => now });
  economy.dispatch({ type: 'dive.settle', opId: 'seed', settlement: { diveId: 'seed', reason: 'return', cargo: { crystal: 0, pearl: 0, marrow: 0, core: 0 }, depth: 0, activeSeconds: 0, xp: 10000 } });
  const ads = new api.AdService(economy, { isMock: true, async load() {}, async show() { return 'completed'; } });
  await ads.watch({ opId: 'first', slot: 'sonar' }); const first = economy.snapshot.buffs.sonarUntil;
  const s = new DiveSession({ diveId: 'absolute', battle: { spawn: false } }); s.setBenefits(economy.activeBenefits()); s.hide(); s.pause.add('ad');
  now += 839999; await assert.rejects(() => ads.watch({ opId: 'too-early', slot: 'sonar' }), /SONAR_ACTIVE/); now += 1; await ads.watch({ opId: 'renew', slot: 'sonar' }); assert.equal(economy.snapshot.buffs.sonarUntil, now + 900000); assert.notEqual(economy.snapshot.buffs.sonarUntil, first + 900000);
  now += 900001; s.setBenefits(economy.activeBenefits()); s.pause.remove('ad'); s.show(); s.advance(3); const x = s.battle.player.x, y = s.battle.player.y; steps(s, 3);
  assert.equal(s.battle.player.x, x); assert.equal(s.battle.player.y, y); assert.equal(economy.activeBenefits().sonar, false);
});
