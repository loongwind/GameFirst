import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function fixture() {
  const source = readFileSync(new URL('../assets/scripts/ui/SeaBundleLease.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} }; new Function('module', 'exports', compiled)(module, module.exports);
  const pending = new Map(), released = [], before = [];
  const lease = new module.exports.SeaBundleLease(layer => new Promise((resolve, reject) => pending.set(layer, { resolve, reject })), value => released.push(value), layer => before.push(layer));
  return { lease, pending, released, before };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('sea lease holds current and next layer, releases old view before resource disposal', async () => {
  const f = fixture(); f.lease.select('sunlight');
  assert.deepEqual([...f.pending.keys()], ['sunlight', 'twilight']);
  f.pending.get('sunlight').resolve('sun'); f.pending.get('twilight').resolve('dusk'); await flush();
  assert.equal(f.lease.current, 'sunlight'); assert.equal(f.lease.get('twilight'), 'dusk');
  f.lease.select('twilight'); assert.equal(f.lease.get('sunlight'), undefined);
  assert.deepEqual(f.before, ['sunlight']); assert.deepEqual(f.released, ['sun']);
  assert.ok(f.pending.has('abyss')); assert.equal(f.lease.get('twilight'), 'dusk');
});

test('late and reverse-order loads cannot revive a released layer or leak after scene destruction', async () => {
  const f = fixture(); f.lease.select('sunlight'); f.lease.select('abyss');
  f.pending.get('abyss').resolve('deep'); await flush();
  assert.equal(f.lease.get('abyss'), 'deep');
  f.pending.get('sunlight').resolve('stale'); await flush();
  assert.equal(f.lease.get('sunlight'), undefined); assert.deepEqual(f.released, ['stale']);
  f.lease.dispose(); f.pending.get('twilight').resolve('late'); await flush();
  assert.deepEqual(f.released.sort(), ['deep', 'late', 'stale']); assert.equal(f.lease.get('abyss'), undefined);
  f.lease.select('sunlight'); assert.equal(f.pending.size, 3);
});

test('failed current load is observable, retry uses one new request and stale rejection is harmless', async () => {
  const f = fixture(); f.lease.select('sunlight');
  f.pending.get('sunlight').reject(new Error('offline')); await flush();
  assert.equal(f.lease.state('sunlight'), 'error');
  f.lease.retry(); assert.equal(f.lease.state('sunlight'), 'loading');
  f.pending.get('sunlight').resolve('retry'); await flush();
  assert.equal(f.lease.get('sunlight'), 'retry'); assert.equal(f.lease.state('sunlight'), 'ready');
  f.lease.dispose();
});
