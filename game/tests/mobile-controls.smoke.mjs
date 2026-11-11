import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { withBrowser } from './browser-helpers.mjs';

const target = process.env.WEB_TARGET || 'web-release';
test(`${target}: full-area floating touch, ownership, controls, camera, cancel and lifecycle`, { timeout: 90000 }, async () => {
  await withBrowser(fileURLToPath(new URL(`../build/${target}`, import.meta.url)), async (page, browser, url) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true });
    const mobile = await context.newPage();
    try {
      await mobile.goto(url); await mobile.waitForFunction(() => typeof System !== 'undefined');
      await mobile.evaluate(async () => { window.cc = await System.import('cc'); });
      await mobile.waitForFunction(() => {
        window.c = window.cc.director.getScene()?.getChildByName('Canvas')?.getComponent('DiveController');
        return window.c?.hud?.sea.status === 'ready' && !window.c.session.pause.paused;
      });
      const errors=[]; mobile.on('pageerror',e=>errors.push(e.message));
      await mobile.evaluate(() => { c.session.battle.autoSpawn=false; for(const e of Array.from(c.session.battle.enemies.values()))c.session.battle.enemies.release(e.id); });
      const read = () => mobile.evaluate(() => ({ x:c.session.battle.player.x, y:c.session.battle.player.y }));
      const cdp = await context.newCDPSession(mobile);
      const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
      const stop=async(type='touchEnd')=>{
        await touch(type,[]); const stopped=await read(); await mobile.waitForTimeout(160);
        assert.deepEqual(await read(),stopped,'release/cancel must stop immediately');
        assert.equal(await mobile.evaluate(()=>!!c.hud.joystick),false);
      };
      for(const [x,y] of [[200,220],[20,20],[20,400],[350,400],[180,560]]){
        const before=await read();
        const screenBefore=await mobile.evaluate(()=>c.hud.sea.player.node.position.y);
        await touch('touchStart',[{x,y,id:1}]);
        await mobile.waitForTimeout(80); assert.deepEqual(await read(),before,'touch starts neutral at its own origin');
        await touch('touchMove',[{x,y:y+40,id:1}]);await mobile.waitForTimeout(200);
        assert.ok((await read()).y>before.y+10,`drag from ${x},${y} must move down`);
        if(y===220)assert.ok(await mobile.evaluate(before=>c.hud.sea.player.node.position.y<before-8,screenBefore),'starting diver must travel visibly before camera follows');
        await stop();
      }
      // Long drag moves the diver visibly before camera follows; world offsets stay coherent.
      await touch('touchStart',[{x:200,y:200,id:1}]);
      await touch('touchMove',[{x:235,y:235,id:1}]);await mobile.waitForTimeout(220);
      const mainStick=await mobile.evaluate(()=>({...c.stick}));
      await touch('touchStart',[{x:235,y:235,id:1},{x:90,y:420,id:2}]);
      await touch('touchMove',[{x:235,y:235,id:1},{x:50,y:380,id:2}]);
      assert.deepEqual(await mobile.evaluate(()=>c.stick),mainStick,'second finger must not hijack');
      // CDP touchEnd names changed points (the released finger), not remaining touches.
      await touch('touchEnd',[{x:235,y:235,id:1}]);
      const primaryEnded=await read();
      await touch('touchMove',[{x:50,y:450,id:2}]);await mobile.waitForTimeout(160);
      assert.deepEqual(await read(),primaryEnded,'remaining finger cannot inherit ownership');await stop();
      await touch('touchStart',[{x:200,y:240,id:1}]);await touch('touchMove',[{x:200,y:280,id:1}]);
      await mobile.waitForTimeout(100);await stop('touchCancel');
      // A visible disabled sonar button still excludes movement, and never takes a pointer.
      const layout=await mobile.evaluate(()=>c.hud.layout);
      const center=r=>({x:r.x+r.width/2,y:r.y+r.height/2,id:1});
      const sonar=center(layout.sonar),beforeButton=await read();
      await touch('touchStart',[sonar]);await touch('touchMove',[{...sonar,y:sonar.y-50}]);await mobile.waitForTimeout(130);
      assert.deepEqual(await read(),beforeButton);await stop();
      const pause=center(layout.pause);await touch('touchStart',[pause]);await touch('touchEnd',[]);
      assert.equal(await mobile.evaluate(()=>c.session.pause.has('modal')),true);
      assert.equal(await mobile.evaluate(()=>c.pointer),undefined);
      await mobile.evaluate(()=>c.handleAction('primary'));
      await mobile.waitForFunction(()=>!c.session.pause.paused);
      await touch('touchStart',[{x:200,y:220,id:1}]);await touch('touchMove',[{x:200,y:260,id:1}]);
      await mobile.evaluate(()=>window.dispatchEvent(new Event('blur')));
      assert.equal(await mobile.evaluate(()=>c.pointer),undefined);const hidden=await read();await mobile.waitForTimeout(150);assert.deepEqual(await read(),hidden);
      await touch('touchEnd',[]);await mobile.evaluate(()=>window.dispatchEvent(new Event('focus')));
      await mobile.waitForFunction(()=>!c.session.pause.paused);
      // Keyboard remains supported independently of floating gestures.
      const keyboard=await read();await mobile.keyboard.down('ArrowLeft');await mobile.waitForTimeout(150);await mobile.keyboard.up('ArrowLeft');
      assert.ok((await read()).x<keyboard.x-5,'keyboard moves away from the nearby solid rock');
      for(const [width,height,safe] of [[390,844,false],[320,640,true]]){
        await mobile.setViewportSize({width,height});
        await mobile.evaluate(safe=>{
          document.documentElement.style.setProperty('--safe-top',safe?'44px':'0px');
          document.documentElement.style.setProperty('--safe-bottom',safe?'34px':'0px');
        },safe);await mobile.waitForTimeout(250);
        const start=await read(),x=width*.4,y=height*.3;
        await touch('touchStart',[{x,y,id:1}]);await touch('touchMove',[{x:x-40,y,id:1}]);await mobile.waitForTimeout(180);
        assert.ok((await read()).x<start.x-6,`floating drag at ${width}x${height}, safe=${safe}`);await stop();
      }
      const projection=await mobile.evaluate(()=>{
        const b=c.session.battle,p=b.player;
        const e=b.spawnEnemy({x:p.x+50,y:p.y+90,assetKey:'enemy_normal_01_moon_jelly',speed:0});
        c.hud.render(c.session,'',c.ads.view,c.economy.snapshot);
        const actor=c.hud.sea.actors.get(e.id).node.position;
        const player=c.hud.sea.player.node.position;
        return {dx:actor.x-player.x,dy:actor.y-player.y,alpha:c.hud.projection.alpha,sessionAlpha:c.session.renderAlpha};
      });
      // Static enemy and a stopped player have the same relative screen/world displacement.
      assert.ok(Math.abs(projection.dx-50)<.01 && Math.abs(projection.dy+90)<.01);
      assert.equal(projection.alpha,projection.sessionAlpha);
      assert.deepEqual(errors,[]);
    } finally { await context.close(); }
  }, { navigate:false });
});
