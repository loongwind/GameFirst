import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

test('375-wide HUD fits 667/750/812, notches and bottom safe area with >=44 touch targets', async () => {
  const source = await readFile(new URL('../assets/scripts/ui/hudLayout.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } }).outputText;
  const { hudLayout } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  for (const height of [667, 750, 812]) for (const inset of [{ top: 0, bottom: 0 }, { top: 44, bottom: 34 }]) {
    const l = hudLayout(375, height, inset);
    for (const name of ['joystick', 'pause', 'return', 'primary', 'secondary']) {
      const r = l[name]; assert.ok(r.width >= 44 && r.height >= 44, name);
      assert.ok(r.x >= 0 && r.x + r.width <= 375, name);
      assert.ok(r.y >= inset.top && r.y + r.height <= height - inset.bottom, name);
    }
    assert.ok(l.oxygen.y >= inset.top); assert.ok(l.rail.y + l.rail.height < l.joystick.y);
    assert.ok(l.modal.y >= l.status.y + l.status.height);
    assert.ok(l.modal.y + l.modal.height <= l.joystick.y);
    assert.ok(l.pause.x + l.pause.width <= l.return.x);
  }
  const wide = hudLayout(750, 1624, { top: 88, bottom: 68 });
  assert.equal(wide.scale, 2); assert.equal(wide.height, 812);
});

test('phone HUD reserves at most 20% of safe height and keeps emergency actions below the battle center', async () => {
  const source = await readFile(new URL('../assets/scripts/ui/hudLayout.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module:ts.ModuleKind.ES2020 } }).outputText;
  const { hudLayout } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  for (const [w,h,top,bottom] of [[375,667,0,0], [390,844,0,0], [320,640,44,34]]) {
    const cssScale=w/375;
    const l = hudLayout(375,h/cssScale,{top:top/cssScale,bottom:bottom/cssScale},{width:w,height:h});
    assert.ok(l.status.y+l.status.height-l.top <= (h-top-bottom)/cssScale*.2, 'normal HUD fits safe-height budget');
    assert.ok(l.oxygenCard.y > l.height*.6, 'low oxygen card stays below main combat area');
    for (const key of ['sonar','pause','return','oxygenAd','oxygenDismiss','primary','secondary']) assert.ok(l[key].height*cssScale >= 44-1e-8, key);
  }
});
