import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
test('irregular rock faces enclose the unchanged circle with a bounded decorative corner margin',async()=>{
  const source=readFileSync(new URL('../assets/scripts/ui/ReefRock.ts',import.meta.url),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2020}}).outputText;
  const {reefRockHull}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  for(const radius of [34,46])for(const rotation of [0,.7]){
    const hull=reefRockHull(radius,rotation);
    for(let i=0;i<hull.length;i++){
      const a=hull[i],b=hull[(i+1)%hull.length];
      const distance=Math.abs(a.x*b.y-a.y*b.x)/Math.hypot(b.x-a.x,b.y-a.y);
      assert.ok(Math.abs(distance-radius)<1e-5,'each solid face is tangent to the collider');
      assert.ok(Math.hypot(a.x,a.y)<=radius*1.15,'corners extend at most 15% beyond collider');
    }
    assert.ok(hull.some(p=>Math.hypot(p.x,p.y)>radius*1.05),'angular corners differ from a disk regardless of rotation');
  }
});
