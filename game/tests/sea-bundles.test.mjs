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

test('sea lease keeps the depth-derived wanted set, releases evicted layers before resource disposal', async () => {
  const f = fixture(); f.lease.select('sunlight', ['sunlight', 'twilight']);
  assert.deepEqual([...f.pending.keys()].sort(), ['sunlight', 'twilight']);
  f.pending.get('sunlight').resolve('sun'); f.pending.get('twilight').resolve('dusk'); await flush();
  assert.equal(f.lease.current, 'sunlight'); assert.equal(f.lease.get('twilight'), 'dusk');
  // Leaving the twilight preload window evicts it; the current layer always stays.
  f.lease.select('sunlight', ['sunlight']);
  assert.equal(f.lease.get('twilight'), undefined);
  assert.deepEqual(f.before, ['twilight']); assert.deepEqual(f.released, ['dusk']);
  // Re-entry inside the preload window restarts the released layer.
  f.lease.select('sunlight', ['sunlight', 'twilight']);
  assert.ok(f.pending.has('twilight')); assert.equal(f.lease.get('sunlight'), 'sun');
});

test('late and reverse-order loads cannot revive a released layer or leak after scene destruction', async () => {
  const f = fixture(); f.lease.select('sunlight', ['sunlight', 'twilight']); f.lease.select('abyss', ['abyss']);
  f.pending.get('abyss').resolve('deep'); await flush();
  assert.equal(f.lease.get('abyss'), 'deep');
  f.pending.get('sunlight').resolve('stale'); await flush();
  assert.equal(f.lease.get('sunlight'), undefined); assert.deepEqual(f.released, ['stale']);
  f.lease.dispose(); f.pending.get('twilight').resolve('late'); await flush();
  assert.deepEqual(f.released.sort(), ['deep', 'late', 'stale']); assert.equal(f.lease.get('abyss'), undefined);
  const releasesBefore = f.released.length;
  f.lease.select('sunlight', ['sunlight', 'twilight']); // disposed: no restart, no new releases
  assert.equal(f.lease.state('sunlight'), 'absent');
  assert.equal(f.released.length, releasesBefore);
});

test('failed current load is observable, retry uses one new request and stale rejection is harmless', async () => {
  const f = fixture(); f.lease.select('sunlight', ['sunlight']);
  f.pending.get('sunlight').reject(new Error('offline')); await flush();
  assert.equal(f.lease.state('sunlight'), 'error');
  f.lease.retry(); assert.equal(f.lease.state('sunlight'), 'loading');
  f.pending.get('sunlight').resolve('retry'); await flush();
  assert.equal(f.lease.get('sunlight'), 'retry'); assert.equal(f.lease.state('sunlight'), 'ready');
  f.lease.dispose();
});

test('in-flight loads are never cancelled by a shrinking wanted set and settle if still wanted', async () => {
  let loads = 0;
  const read = readFileSync(new URL('../assets/scripts/ui/SeaBundleLease.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(read, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} }; new Function('module', 'exports', compiled)(module, module.exports);
  const pending = new Map(), released = [];
  const lease = new module.exports.SeaBundleLease(layer => { loads++; return new Promise((resolve, reject) => pending.set(layer, { resolve, reject })); }, value => released.push(value));
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
  lease.select('sunlight', ['sunlight', 'twilight']);
  assert.equal(loads, 2); assert.equal(lease.state('twilight'), 'loading');
  // Depth darts back up: the twilight request keeps flying (no cancel/resend churn).
  lease.select('sunlight', ['sunlight']); await flush();
  assert.ok(pending.has('twilight'), 'in-flight request must keep flying');
  lease.select('sunlight', ['sunlight', 'twilight']);
  assert.equal(loads, 2, 'no duplicate request for the same layer');
  pending.get('twilight').resolve('dusk'); await flush();
  assert.equal(lease.get('twilight'), 'dusk'); assert.equal(lease.state('twilight'), 'ready');
  lease.dispose();
});
