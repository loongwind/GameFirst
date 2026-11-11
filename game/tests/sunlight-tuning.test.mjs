import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadBattle } from './battle-loader.mjs';
const api = loadBattle();
test('sunlight is survivable while twilight and abyss retain their original strength', () => {
  assert.ok(api.enemyStrength('normal', 200).attack < 4);
  assert.equal(api.enemyStrength('boss', 700).maxHp,50*1.18**7*40*api.SUNLIGHT_TUNING.bossHp);
  assert.ok(api.enemyStrength('boss', 700).attack < 45);
  for (const depth of [800, 900, 1600, 2300, 2400]) {
    const band = Math.min(23, Math.floor(depth / 100));
    assert.equal(api.enemyStrength('normal', depth).maxHp, 50 * 1.18 ** band);
    assert.equal(api.enemyStrength('boss', depth).attack, 8 * 1.12 ** band * 4);
  }
});
test('sunlight oxygen pacing leaves at least two minutes without changing deep-water oxygen', () => {
  const session = new api.DiveSession({ diveId: 'sunlight-o2', battle: { spawn: false, content: true } });
  for (let i = 0; i < 120 * 30; i++) session.advance(1 / 30);
  assert.ok(session.snapshot.oxygen > 30, 'oxygen pressure remains, with room for a two-minute dive');
  const deep = new api.DiveSession({ diveId: 'deep-o2', battle: { spawn: false, content: true } });
  deep.battle.defeatedBosses.add('enemy_boss_01_angler_king');
  deep.battle.player.y = 1000;
  for (let i = 0; i < 30; i++) deep.advance(1 / 30);
  assert.ok(Math.abs(deep.snapshot.oxygen - (120 - 1.4)) < 1e-6);
  const gate = new api.DiveSession({diveId:'sunlight-gate',battle:{spawn:false,content:true,weapons:[]}});
  gate.battle.player.y=800;
  for(let i=0;i<30;i++) gate.advance(1/30);
  assert.ok(Math.abs(gate.snapshot.oxygen-(120-.6))<1e-6,'blocked 800m gate belongs to sunlight');
});
test('slower sunlight cadence preserves one elite per six encounters', () => {
  const battle = new api.Battle({content:true,spawnIntervalTicks:1,weapons:[]});
  const interval = api.SUNLIGHT_TUNING.spawnIntervalMultiplier;
  for(let i=0;i<interval*5+1;i++) battle.step();
  assert.equal(battle.enemies.size,6);
  assert.equal([...battle.enemies.values()].filter(e=>e.kind==='elite').length,1);
});
test('custom sunlight cadence survives checkpoints; old checkpoints without it still load', () => {
  const session=new api.DiveSession({diveId:'cadence-save',battle:{content:true,weapons:[],spawnIntervalTicks:90,sunlightSpawnIntervalTicks:90}});
  const saved=session.checkpoint();
  const restored=api.DiveSession.restore(saved);restored.advance(3);
  for(let i=0;i<91;i++)restored.advance(1/30);
  assert.equal(restored.battle.enemies.size,2);
  delete saved.battle.options.sunlightSpawnIntervalTicks;
  const legacy=api.DiveSession.restore(saved);legacy.advance(3);
  for(let i=0;i<91;i++)legacy.advance(1/30);
  assert.equal(legacy.battle.enemies.size,2,'legacy teaching cadence is retained');
});
