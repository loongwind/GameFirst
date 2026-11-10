import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadServices, memoryStorage } from './services-loader.mjs';
import { DEFAULT_BALANCE } from '../../shared/dist/index.js';
import { loadBattle } from './battle-loader.mjs';

const api = loadServices(), { Battle, DiveSession, WEAPON_DEFAULTS } = loadBattle();
// Cargo assertions derive from the balance table so tuning edits stay single-source.
const CARGO_BASE = DEFAULT_BALANCE.attributes.baseValues[4];
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const gear = (template, slot, extra = {}) => ({ id: `gear-${template}`, template, slot, quality: 0, level: 1,
  equipped: true, locked: false, invested: { marrow: '0', tickets: 0 }, ...extra });
const loadout = state => {
  assert.equal(typeof api.combatLoadout, 'function', 'growth must project into new dive options');
  return api.combatLoadout(state);
};
const session = state => {
  const options = loadout(state);
  return new DiveSession({ ...options, diveId: 'growth', battle: { ...options.battle, spawn: false } });
};
function hitDamage(state, kind = 'sonic', ticks = 1) {
  const options = loadout(state).battle;
  const battle = new Battle({ ...options, spawn: false, weapons: [options.weapons.find(w => w.kind === kind)] });
  const enemy = battle.spawnEnemy({ x: 0, y: 0, hp: 100000, speed: 0 });
  for (let i = 0; i < ticks; i++) battle.step();
  return { damage: 100000 - enemy.hp, battle };
}

test('all six attributes reach real HP, cargo, oxygen efficiency, damage, cooldown and movement', () => {
  const state = api.initialState();
  Object.assign(state.attributes, { hp: 10, attack: 10, attackSpeed: 100, moveSpeed: 100, cargo: 10, oxygen: 100 });
  const s = session(state);
  assert.equal(s.maxHp, 300); assert.equal(s.snapshot.hp, 300); assert.equal(s.cargoCapacity, Math.floor(CARGO_BASE * 1.5));
  assert.equal(s.oxygenCapacity, 120); assert.equal(s.collect('crystal', 1000), Math.min(1000, Math.floor(CARGO_BASE * 1.5)));
  s.setInput(1, 0);
  for (let i = 0; i < 30; i++) s.advance(1 / 30);
  close(s.battle.player.x, 240); close(s.snapshot.oxygen, 119.5);
  const base = api.initialState();
  assert.equal(hitDamage(base).damage, 20); assert.equal(hitDamage(state).damage, 30);
  const slow = hitDamage(base, 'sonic', 24), fast = hitDamage(state, 'sonic', 24);
  assert.equal(slow.damage, 20); assert.equal(fast.damage, 60);
  assert.ok(fast.battle.weapons[0].spec.cooldownTicks < slow.battle.weapons[0].spec.cooldownTicks);
});

test('all five tech trees affect runtime and duplicate ids cannot multiply the same node', () => {
  const state = api.initialState();
  state.tech = ['attack.20', 'survival.20', 'oxygen.20', 'cargo.20', 'special.20', 'attack.20'];
  const s = session(state);
  close(s.maxHp, 240); assert.equal(s.cargoCapacity, Math.floor(CARGO_BASE * 1.2));
  close(hitDamage(state).damage, 24);
  for (let i = 0; i < 30; i++) s.advance(1 / 30);
  close(s.snapshot.oxygen, 120 - 1 / 1.2);
  close(s.battle.weapons[0].spec.range, WEAPON_DEFAULTS.sonic.range * 1.2);
  const drop = s.battle.loot.acquire(); Object.assign(drop, { x: 25, y: 0, previousX: 25, previousY: 0, radius: 6, value: 10 });
  s.advance(1 / 30); assert.equal(s.snapshot.cargo.crystal, 10);
});

test('torpedoes live long enough to hit within the full special-tech targeting range', () => {
  const state = api.initialState();
  state.tech = Array.from({ length: 20 }, (_, index) => `special.${index + 1}`);
  const options = loadout(state).battle;
  const torpedo = options.weapons.find(weapon => weapon.kind === 'torpedo');
  close(torpedo.range, 1240);
  const battle = new Battle({ ...options, spawn: false, weapons: [torpedo] });
  const enemy = battle.spawnEnemy({ x: 1000, y: 0, hp: 100, speed: 0 });
  const flightTicks = Math.ceil(1000 / torpedo.speed * 30);
  for (let tick = 0; tick <= flightTicks; tick++) battle.step();
  assert.ok(enemy.hp < 100, 'a torpedo must reach an acquired target before its lifetime expires');
  assert.equal(loadout(api.initialState()).battle.weapons[1].lifetimeTicks, WEAPON_DEFAULTS.torpedo.lifetimeTicks);
});

test('four equipped weapon templates use their own configuration and inflict scaled real hits', () => {
  for (const kind of ['sonic', 'torpedo', 'arc', 'mine']) {
    const state = api.initialState(); state.inventory = [gear(kind, 0, { quality: 2, level: 6 })];
    const projected = loadout(state).battle.weapons[0];
    assert.equal(projected.kind, kind);
    close(projected.damage, WEAPON_DEFAULTS[kind].damage * 1.7);
    assert.equal(projected.cooldownTicks, WEAPON_DEFAULTS[kind].cooldownTicks);
    assert.equal(projected.maxJumps, WEAPON_DEFAULTS[kind].maxJumps);
    assert.equal(projected.triggerRadius, WEAPON_DEFAULTS[kind].triggerRadius);
    close(hitDamage(state, kind).damage, projected.damage);
    state.inventory[0].equipped = false;
    assert.deepEqual(loadout(state), loadout(api.initialState()));
  }
});

test('auxiliary gear changes actual health, movement, target range and loot pickup only while equipped', () => {
  for (const template of ['armor', 'fin', 'light', 'magnet']) {
    const state = api.initialState(); state.inventory = [gear(template, 2)];
    const s = session(state);
    if (template === 'armor') close(s.maxHp, 220);
    if (template === 'fin') { s.setInput(1, 0); s.advance(1 / 30); close(s.battle.player.x, 4.4); }
    if (template === 'light') {
      // Arc gear allows a deterministic instant hit just beyond its normal range.
      state.inventory.push(gear('arc', 0));
      const lit = session(state); const enemy = lit.battle.spawnEnemy({ x: 215, y: 0, hp: 100, speed: 0 });
      lit.advance(1 / 30); assert.ok(enemy.hp < 100);
      state.inventory[0].equipped = false;
      const dark = session(state); const outside = dark.battle.spawnEnemy({ x: 215, y: 0, hp: 100, speed: 0 });
      dark.advance(1 / 30); assert.equal(outside.hp, 100);
      state.inventory.pop();
    }
    if (template === 'magnet') {
      const drop = s.battle.loot.acquire(); Object.assign(drop, { x: 50, y: 0, previousX: 50, previousY: 0, radius: 6, value: 11 });
      s.advance(1 / 30); assert.equal(s.snapshot.cargo.crystal, 11);
    }
    state.inventory[0].equipped = false;
    assert.deepEqual(loadout(state), loadout(api.initialState()));
  }
});

test('weapon slot identity is stable and projection leaves inventory and balance data untouched', () => {
  const state = api.initialState(); state.inventory = [gear('mine', 1), gear('arc', 0)];
  const before = JSON.stringify(state), options = loadout(state);
  assert.deepEqual(options.battle.weapons.map(w => w.kind), ['arc', 'mine']);
  assert.equal(JSON.stringify(state), before);
  options.battle.weapons[0].damage = 99999;
  assert.notEqual(loadout(state).battle.weapons[0].damage, 99999);
});

test('explicit equipped slots retain priority when legacy gear precedes them in inventory', () => {
  const state = api.initialState();
  state.inventory = [gear('sonic', undefined), gear('armor', undefined), gear('arc', 0), gear('fin', 2)];
  const options = loadout(state);
  assert.deepEqual(options.battle.weapons.map(w => w.kind), ['arc', 'sonic']);
  close(options.maxHp, 220);
  close(options.battle.playerSpeed, 132);
});

test('economy equip commands enforce unlock levels and project replacement slots into combat', () => {
  const state = api.initialState(), save = new api.LocalSaveService(memoryStorage());
  state.playerLevel = 7; state.totalXp = 195;
  state.inventory = [gear('arc', undefined, { equipped: false }), gear('sonic', undefined, { equipped: false }),
    gear('armor', undefined, { equipped: false })];
  save.save({ schemaVersion: 1, cloudRev: 0, sessionEpoch: 1, state }, 0);
  const economy = new api.EconomyService(save);
  const equip = (opId, itemId, slot) => economy.dispatch({ type: 'equipment.equip', opId, itemId, slot });
  const settle = (id, xp) => economy.dispatch({ type: 'dive.settle', opId: id, settlement: {
    diveId: id, reason: 'return', cargo: { crystal: 0, pearl: 0, marrow: 0, core: 0 }, depth: 0, activeSeconds: 0, xp,
  } });
  assert.throws(() => equip('level-seven', 'gear-arc', 0), /LEVEL_LOCKED/);
  settle('equip-unlock', 50);
  assert.equal(economy.snapshot.playerLevel, 8);
  assert.throws(() => equip('aux-slot', 'gear-arc', 2), /INVALID_SLOT/);
  assert.throws(() => equip('fourth-locked', 'gear-armor', 3), /LEVEL_LOCKED/);
  equip('first-weapon', 'gear-arc', 1);
  const options = loadout(economy.snapshot);
  assert.equal(options.battle.weapons[1].kind, 'arc');
  close(options.battle.weapons[1].damage, WEAPON_DEFAULTS.arc.damage * 1.1);
  equip('move-weapon', 'gear-arc', 0);
  assert.deepEqual(loadout(economy.snapshot).battle.weapons.map(w => w.kind), ['arc', 'torpedo']);
  equip('replace-weapon', 'gear-sonic', 0);
  assert.equal(economy.snapshot.inventory.filter(i => i.equipped).length, 1);
  assert.equal(economy.snapshot.inventory.find(i => i.id === 'gear-arc').equipped, false);
  settle('fourth-unlock', 5000);
  equip('fourth-armor', 'gear-armor', 3);
  close(loadout(economy.snapshot).maxHp, 220);
});

test('reopening an existing dive retains its original HP, oxygen, movement, gear and cooldowns', () => {
  const economy = new api.EconomyService(new api.LocalSaveService(memoryStorage()));
  const dives = new api.LocalDiveService(economy);
  const old = api.initialState(); old.attributes.hp = 4; old.inventory = [gear('arc', 0), gear('magnet', 2)];
  const original = dives.open('original', loadout(old)); original.battle.player.hp = 123; dives.save(original);
  const before = original.checkpoint();
  const current = api.initialState(); current.attributes.hp = 100; current.attributes.moveSpeed = 100;
  current.inventory = [gear('mine', 0, { quality: 4, level: 10 }), gear('fin', 2)];
  const restored = dives.open('ignored-new-id', loadout(current));
  assert.equal(restored.diveId, 'original'); assert.equal(restored.maxHp, 240);
  assert.equal(restored.snapshot.hp, 123); assert.deepEqual(restored.battle.checkpoint(), before.battle);
});
