import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

async function api() {
  const source = readFileSync(new URL('../assets/scripts/ui/WorldProjection.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target:ts.ScriptTarget.ES2020, module:ts.ModuleKind.ES2020 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
test('camera lets player travel inside dead zone, follows sustained exploration and preserves relative world offsets', async () => {
  const { WorldProjection } = await api(); const c = new WorldProjection();
  c.follow(0,0,667); const start = c.point(0,0);
  c.follow(30,40,667); assert.deepEqual(c.point(30,40), {x:start.x+30,y:start.y+40});
  for (let y=41;y<=2000;y++) c.follow(30,y,667);
  const p = c.point(30,2000), e = c.point(50,2050);
  assert.ok(p.y < 450 && p.y > start.y, 'diver stays visible while camera continues following');
  assert.deepEqual({x:e.x-p.x,y:e.y-p.y}, {x:20,y:50});
  const stopped = c.point(30,2000); c.follow(30,2000,667); assert.deepEqual(c.point(30,2000),stopped);
  c.follow(-100,1960,844); assert.ok(c.point(-100,1960).x >= 100);
});
