import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

class FakeNode {
  constructor(name = '') { this.name = name; this.children = []; this.active = true; this.position = { x: 0, y: 0 }; this.angle = 0; this.scale = { x: 1, y: 1 }; this.components = []; }
  addChild(child) { this.children.push(child); }
  addComponent(Type) { const component = new Type(); component.node = this; this.components.push(component); return component; }
  getComponent(Type) { return this.components.find(component => component instanceof Type); }
  setPosition(x, y) { this.position = { x, y }; }
  setScale(x, y) { this.scale = { x, y }; }
  destroy() { this.destroyed = true; }
}
class UITransform { setContentSize(w, h) { this.width = w; this.height = h; } }
class Sprite { constructor() { this.spriteFrame = undefined; this.sizeMode = 0; this.color = undefined; this.trim = true; this.blendState = { targets: [{}] }; } }
Sprite.SizeMode = { CUSTOM: 0 };
class Graphics { clear() { this.paths = []; } stroke() {} fill() {} circle() {} moveTo() {} lineTo() {} rect() {} roundRect() {} }
class Color { constructor(r = 255, g = 255, b = 255, a = 255) { this.r = r; this.g = g; this.b = b; this.a = a; } }
class Frame {
  constructor(name) { this.name = name; this.refCount = 0; this.isValid = true; this.texture = { id: name }; }
  addRef() { assert.ok(this.isValid, 'retained a destroyed frame'); this.refCount++; return this; }
  decRef() { assert.ok(this.refCount > 0, 'unbalanced release'); this.refCount--; return this; }
  reset() {}
}
const cc = {
  Node: FakeNode, UITransform, Sprite, Graphics, Color,
  SpriteFrame: Frame, Rect: class {}, Size: class {}, Vec2: class {},
  Layers: { Enum: { UI_2D: 1 } },
};

function load() {
  const source = readFileSync(new URL('../assets/scripts/ui/SeaFx.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (name === '../battle/model') return { STEP_SECONDS: 1 / 30 };
    assert.equal(name, 'cc', `unexpected dependency ${name}`);
    return cc;
  }, module, module.exports);
  return module.exports;
}
const lib = load();
const step = 1 / 30;
const body = (id, x, y, extra = {}) => ({ id, active: true, x, y, previousX: x, previousY: y, radius: 4, ...extra });
const frames = () => new Map([
  ['loo70_fx_torpedo', new Frame('torpedo')], ['loo70_fx_wake', new Frame('wake')],
  ['loo70_fx_sonar', new Frame('sonar')], ['loo70_fx_mine', new Frame('mine')],
  ['loo70_fx_arc', new Frame('arc')], ['loo70_fx_impact', new Frame('impact')],
]);
const screen = (x, y) => ({ x: 187.5 + x, y: 400 - y });
const battle = overrides => ({ tick: 1, projectiles: { values: () => [] }, effects: { values: () => [] }, texts: { values: () => [] }, ...overrides });

test('torpedoes pool per projectile id with one wake and release cleanly', () => {
  const root = new FakeNode('root'), fx = new lib.SeaFx(root, frames());
  const torpedo = { ...body(1, 10, 10), kind: 'torpedo', vx: 420, vy: 0, damage: 20, bornTick: 0, expiresTick: 60, owner: 0, range: 400, speed: 420, innerRadius: 0, triggerRadius: 0, hits: new Set() };
  fx.sync(battle({ projectiles: { values: () => [torpedo] } }), screen, 1);
  assert.equal(fx.live.size, 2, 'core + wake');
  const core = fx.live.get('p1');
  assert.equal(core.sprite.spriteFrame.name, 'torpedo');
  assert.equal(core.node.scale.x, 1, 'torpedo core never inflates');
  assert.equal(fx.live.get('w1').sprite.spriteFrame.name, 'wake');
  // Re-sync reuses the same visuals (no churn).
  const same = core.node;
  fx.sync(battle({ projectiles: { values: () => [torpedo] } }), screen, 2);
  assert.equal(fx.live.get('p1').node, same);
  // Release returns both visuals to the pool and spawns one impact.
  fx.sync(battle({ projectiles: { values: () => [] } }), screen, 3);
  assert.equal(fx.live.size, 0);
  assert.equal(fx.impacts.length, 1, 'expiry leaves one shared impact burst');
  assert.equal(fx.pool.get('loo70_fx_torpedo').length, 1);
  assert.equal(fx.pool.get('loo70_fx_wake').length, 1);
  fx.destroy();
});

test('sonic rings scale to the live AOE radius, never a cosmetic diameter', () => {
  const root = new FakeNode('root'), fx = new lib.SeaFx(root, frames());
  const ring = { ...body(2, 0, 0), kind: 'sonic', vx: 0, vy: 0, damage: 20, bornTick: 0, expiresTick: 24, owner: 0, range: 180, speed: 240, innerRadius: 60, triggerRadius: 0, hits: new Set() };
  fx.sync(battle({ projectiles: { values: () => [{ ...ring, radius: 60 }] } }), screen, 1);
  assert.equal(fx.live.get('s2').node.scale.x, 120 / 128);
  fx.sync(battle({ projectiles: { values: () => [{ ...ring, radius: 180 }] } }), screen, 2);
  assert.equal(fx.live.get('s2').node.scale.x, 360 / 128);
  fx.destroy();
});

test('hit bursts are capped at 24 and recycle the oldest instead of breaking hits', () => {
  const root = new FakeNode('root'), fx = new lib.SeaFx(root, frames());
  const texts = Array.from({ length: 30 }, (_, i) => ({ ...body(i + 1, i, 0), value: 5, expiresTick: 20 }));
  fx.sync(battle({ texts: { values: () => texts } }), screen, 1);
  assert.equal(fx.impacts.length, lib.IMPACT_CAP);
  fx.destroy();
});

test('low-end keeps cores and rings but drops wakes and hit bursts', () => {
  const root = new FakeNode('root'), fx = new lib.SeaFx(root, frames(), true);
  const torpedo = { ...body(3, 0, 0), kind: 'torpedo', vx: 100, vy: 0, damage: 20, bornTick: 0, expiresTick: 60, owner: 0, range: 400, speed: 420, innerRadius: 0, triggerRadius: 0, hits: new Set() };
  const texts = [{ ...body(9, 0, 0), value: 5, expiresTick: 20 }];
  fx.sync(battle({ projectiles: { values: () => [torpedo] }, texts: { values: () => texts } }), screen, 1);
  assert.equal(fx.live.size, 1, 'core only');
  assert.equal(fx.impacts.length, 0, 'no impact bursts on low quality');
  fx.destroy();
});

test('arc chains use at most six shared segments between real endpoints', () => {
  const root = new FakeNode('root'), fx = new lib.SeaFx(root, frames());
  const arc = { ...body(4, 0, 0), kind: 'arc', endX: 500, endY: 0, expiresTick: 6 };
  fx.sync(battle({ effects: { values: () => [arc] } }), screen, 1);
  const segments = [...fx.live.keys()].filter(key => key.startsWith('e4:'));
  assert.ok(segments.length <= 6 && segments.length >= 2, `segments ${segments.length}`);
  fx.sync(battle({ effects: { values: () => [] } }), screen, 2);
  assert.equal([...fx.live.keys()].filter(key => key.startsWith('e4:')).length, 0, 'chain retires fully');
  fx.destroy();
});

void step;
