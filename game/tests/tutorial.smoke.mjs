import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withBrowser } from './browser-helpers.mjs';

const target = process.env.WEB_TARGET || 'web-debug';
const root = fileURLToPath(new URL(`../build/${target}`, import.meta.url));
const artifacts = fileURLToPath(new URL('../.artifacts/tutorial/', import.meta.url));
async function diveReady(page) {
  await page.waitForFunction(() => typeof System !== 'undefined');
  await page.evaluate(async () => { window.cc = await System.import('cc'); });
  await page.waitForFunction(() => {
    window.c = window.cc.director.getScene()?.getChildByName('Canvas')?.getComponent('DiveController');
    return window.c?.hud?.sea.status === 'ready';
  }, null, { timeout: 30000 });
}
async function harborReady(page) {
  await page.waitForFunction(() => {
    window.h = window.cc.director.getScene()?.getChildByName('Canvas')?.getComponent('HarborController');
    return !!window.h?.view;
  });
}
async function click(page, name) {
  const point = await page.evaluate(name => {
    const find = n => n.name === name && n.activeInHierarchy ? n : n.children.map(find).find(Boolean);
    const n = find(window.cc.director.getScene()); if (!n) throw new Error(`Missing ${name}`);
    const t = n.getComponent(window.cc.UITransform), b = t.getBoundingBoxToWorld(), visible = window.cc.view.getVisibleSize();
    return { x: (b.x + b.width / 2) / visible.width * innerWidth, y: innerHeight - (b.y + b.height / 2) / visible.height * innerHeight };
  }, name);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(120);
}
async function steer(page) {
  const vector = await page.evaluate(() => {
    const c = window.c, s = c.session, p = s.battle.player, l = c.hud.layout.joystick;
    const enemies = [...s.battle.enemies.values()].sort((a, b) => Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
    const loot = [...s.battle.loot.values()].sort((a, b) => Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
    let x = 0, y = 0;
    const enemy = enemies[0], drop = loot.find(e => e.y < 140);
    if (enemy && Math.hypot(enemy.x-p.x,enemy.y-p.y) < 95) { x=p.x-enemy.x; y=p.y-enemy.y; }
    else if (drop) { x=drop.x-p.x; y=drop.y-p.y; }
    else { x=Math.sin(s.snapshot.activeSeconds / 4) * 30; y=p.y < 40 ? 10 : -10; }
    if (p.x > 280) x=-100; if (p.x < -280) x=100;
    if (p.y > 130) y=-100; if (p.y < 5 && y < 0) { y=10; x=x || 50; }
    const norm = Math.hypot(x,y) || 1;
    return { x: l.x+56+x/norm*45, y: l.y+56+y/norm*45, state:s.state, step:c.economy.snapshot.objectives.tutorial.step, seconds:s.snapshot.activeSeconds };
  });
  assert.equal(vector.state, 'Running', JSON.stringify(vector));
  await page.mouse.move(vector.x, vector.y);
  return vector;
}

test(`${target}: fresh save real-time six-step loop, refresh, replay, three finalized dives and local poster download`, { timeout: 240000 }, async () => {
  await mkdir(artifacts, { recursive: true });
  await withBrowser(root, async (page, _browser, url) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    const started = Date.now(); await page.goto(url); await diveReady(page);
    const initial = await page.evaluate(() => ({ wallet: window.c.economy.snapshot.wallet, hp:window.c.session.maxHp, weapons:window.c.session.battle.weapons.map(w=>w.spec.damage) }));
    assert.equal(initial.wallet.crystal, '0');
    // Real elapsed game time, actual pointer input, untouched loadout/HP/enemy damage.
    await page.waitForTimeout(10500);
    const origin = await page.evaluate(() => { const l=window.c.hud.layout.joystick;return {x:l.x+56,y:l.y+56}; });
    await page.mouse.move(origin.x,origin.y); await page.mouse.down();
    let point = await steer(page);
    const timeline = [point];
    while (point.seconds < 32) { await page.waitForTimeout(350); point = await steer(page); }
    timeline.push(point); await page.mouse.up();
    const before = await page.evaluate(() => { const c=window.c; c.dives.save(c.session); return { id:c.session.diveId, seconds:c.session.snapshot.activeSeconds, kills:c.session.battle.stats.kills, cargo:c.session.snapshot.cargo.crystal }; });
    await page.screenshot({ path:`${artifacts}/pressure-${target}.png` });
    await page.reload(); await diveReady(page);
    assert.equal(await page.evaluate(() => window.c.session.diveId), before.id);
    await page.waitForFunction(() => !window.c.session.pause.paused);
    const restoredOrigin=await page.evaluate(()=>{const l=window.c.hud.layout.joystick;return{x:l.x+56,y:l.y+56};});
    await page.mouse.move(restoredOrigin.x,restoredOrigin.y);await page.mouse.down();await steer(page);
    do { await page.waitForTimeout(350); point = await steer(page); } while (point.seconds < 61 || point.step < 4);
    await page.mouse.up(); timeline.push(point);
    await page.screenshot({ path:`${artifacts}/return-guide-${target}.png` });
    await click(page, 'return-touch');
    await page.waitForFunction(() => window.c.session.state === 'Settled');
    const first = await page.evaluate(() => ({ state:window.c.economy.snapshot, seconds:window.c.session.snapshot.activeSeconds, kills:window.c.session.battle.stats.kills, hp:window.c.session.snapshot.hp }));
    assert.equal(first.state.wallet.crystal, '500'); assert.equal(first.state.objectives.tutorial.step, 5);
    await page.reload(); await diveReady(page);
    assert.equal(await page.evaluate(()=>window.c.session.state),'Settled');
    assert.equal(await page.evaluate(()=>window.c.session.diveId),before.id);
    await click(page, 'primary-touch'); await harborReady(page);
    if (await page.evaluate(() => window.h.view.panel === 'poster')) {
      await page.waitForFunction(() => { const n=window.h.view.root; const find=n=>n.name==='DepthPosterPNG'?n:n.children.map(find).find(Boolean); return !!find(n)?.getComponent(window.cc.Sprite)?.spriteFrame; });
      await page.screenshot({ path:`${artifacts}/poster-${target}.png` });
      const download = page.waitForEvent('download'); await click(page, 'save-depth-poster');
      const file = await download; await file.saveAs(`${artifacts}/${target}-${file.suggestedFilename()}`);
      await click(page, 'close');
    }
    await click(page, 'upgrade');
    await click(page, 'upgrade-cargo');
    await page.waitForFunction(() => window.h.economy.snapshot.attributes.cargo === 1);
    await click(page, 'close'); await click(page, 'LaunchButton'); await diveReady(page);
    const elapsed = (Date.now()-started)/1000;
    const second = await page.evaluate(() => ({ tutorial:window.c.economy.snapshot.objectives.tutorial, cargo:window.c.session.cargoCapacity, wallet:window.c.economy.snapshot.wallet.crystal }));
    assert.equal(second.tutorial.completed, true); assert.equal(second.cargo, 2100); assert.equal(second.wallet, '420'); assert.ok(elapsed < 180, `activation ${elapsed}s`);
    // Subsequent regressions use the production fixed clock; this part is not real-time timing evidence.
    for (let trip = 2; trip <= 3; trip++) {
      await page.evaluate(() => { window.c.enabled = false; });
      const settled = await page.evaluate(() => {
        const c=window.c,s=c.session;
        for(let i=0;i<3000 && s.state==='Running' && s.battle.stats.kills===0;i++) s.advance(1/30);
        c.dives.save(s); s.requestReturn(); s.arriveHarbor(); c.dives.settle(s); c.hud.render(s,'',c.ads.view,c.economy.snapshot);
        return { id:s.diveId, state:s.state, count:c.economy.snapshot.objectives.completedDives.length };
      });
      assert.equal(settled.state,'Settled'); assert.equal(settled.count,trip);
      await click(page,'primary-touch'); await harborReady(page);
      if (await page.evaluate(()=>window.h.view.panel==='poster')) await click(page,'close');
      if(trip===2) { await click(page,'LaunchButton'); await diveReady(page); }
    }
    await click(page,'archive'); await click(page,'open-tasks');
    const xp = await page.evaluate(()=>window.h.economy.snapshot.totalXp);
    await click(page,'claim-first-day');
    await page.waitForFunction(xp=>window.h.economy.snapshot.totalXp===xp+20,xp);
    await page.screenshot({ path:`${artifacts}/three-dives-${target}.png` });
    for (const height of [667, 750, 812]) {
      await page.setViewportSize({ width:375, height });
      await page.evaluate(()=> { document.documentElement.style.setProperty('--safe-top','44px'); document.documentElement.style.setProperty('--safe-bottom','34px'); });
      await page.waitForTimeout(150);
      const bounds = await page.evaluate(()=> {
        const find=n=>n.name==='replay-tutorial'&&n.activeInHierarchy?n:n.children.map(find).find(Boolean);
        const n=find(window.h.view.root),t=n.getComponent(window.cc.UITransform),p=window.h.view.layout.panel;
        return {top:-n.position.y,bottom:-n.position.y+t.height,panelHeight:p.height,rows:window.h.view.liveRows};
      });
      assert.ok(bounds.top>=88&&bounds.bottom<=bounds.panelHeight,JSON.stringify(bounds));assert.ok(bounds.rows<=2);
      await page.screenshot({path:`${artifacts}/tasks-safe-${height}-${target}.png`});
    }
    await page.evaluate(()=> { document.documentElement.style.removeProperty('--safe-top'); document.documentElement.style.removeProperty('--safe-bottom'); });
    await page.waitForTimeout(150);
    await click(page,'replay-tutorial'); await diveReady(page);
    const replay = await page.evaluate(() => {
      const c=window.c;c.enabled=false;const s=c.session;
      for(let i=0;i<2100 && s.state==='Running';i++) {
        const loot=[...s.battle.loot.values()][0], p=s.battle.player;
        s.setInput(loot?loot.x-p.x:0,loot?loot.y-p.y:0); s.advance(1/30);
      }
      c.dives.save(s);const wallet=BigInt(c.economy.snapshot.wallet.crystal),cargo=s.snapshot.cargo.crystal;
      s.requestReturn();s.arriveHarbor();c.dives.settle(s);
      return {delta:String(BigInt(c.economy.snapshot.wallet.crystal)-wallet),cargo,state:c.economy.snapshot};
    });
    assert.equal(replay.delta,String(replay.cargo));
    assert.equal(replay.state.events.filter(e=>e.name==='deposit_done'&&e.properties.tutorial_reward).length,1);
    assert.deepEqual(errors,[]);
    await writeFile(`${artifacts}/loop-${target}.json`,JSON.stringify({elapsed,initial,timeline,before,first,second,replay,errors},null,2));
  }, { navigate:false });
});
