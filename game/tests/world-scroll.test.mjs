import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
async function api() {
  const source = readFileSync(new URL('../assets/scripts/ui/WorldScroll.ts', import.meta.url), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020 } }).outputText).toString('base64')}`);
}
test('camera-based strips rise while diving, descend while ascending and stay fixed when stopped', async () => {
  const { wallTiles } = await api();
  const a = wallTiles(100, 812, .78), b = wallTiles(120, 812, .78);
  assert.ok(b[1].y > a[1].y); assert.ok(Math.abs(b[1].y - a[1].y - 15.6) < 1e-7);
  assert.deepEqual(wallTiles(100, 812, .78), a);
  assert.ok(wallTiles(120, 812, .18)[1].y < b[1].y, 'far plane moves slower');
});
test('mirrored strip identity is continuous at positive/negative wraps and covers every viewport without gaps', async () => {
  const { wallTiles } = await api();
  for (const height of [375, 667, 750, 844, 1200]) for (const depth of [-1600, -812.001, -812, -.001, 0, 811.999, 812, 1600, 2400]) {
    const span = Math.max(812, height), tiles = wallTiles(depth, span, 1), later = wallTiles(depth + .01, span, 1);
    assert.ok(tiles[0].y - span / 2 <= -height / 2);
    assert.ok(tiles[2].y + span / 2 >= height / 2);
    for (let i = 1; i < tiles.length; i++) { assert.ok(Math.abs(tiles[i].y - tiles[i - 1].y - span) < 1e-7); assert.notEqual(tiles[i].flip, tiles[i - 1].flip); }
    for (const tile of tiles) {
      const match = later.find(t => t.index === tile.index); if (!match) continue;
      assert.ok(Math.abs(match.y - tile.y - .01) < 1e-7); assert.equal(match.flip, tile.flip);
    }
  }
});
