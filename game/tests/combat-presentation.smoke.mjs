import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withBrowser } from './browser-helpers.mjs';

const target=process.env.WEB_TARGET||'web-release';
const artifacts=fileURLToPath(new URL('../.artifacts/combat-presentation/',import.meta.url));
for(const tier of ['high','low'])test(`${target}: ${tier} four-weapon presentation and solid terrain create no projectile nodes`,{timeout:60000},async()=>{
  await mkdir(artifacts,{recursive:true});
  await withBrowser(fileURLToPath(new URL(`../build/${target}`,import.meta.url)),async(page,browser,url)=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${url}?quality=${tier}`);await page.waitForFunction(()=>typeof System!=='undefined');
    await page.evaluate(async()=>{window.cc=await System.import('cc');});
    await page.waitForFunction(()=>{
      window.c=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('DiveController');
      return c?.hud?.sea.status==='ready'&&!c.session.pause.paused;
    });
    const state=await page.evaluate(()=>{
      c.enabled=false;
      const previous=c.session,Session=previous.constructor;
      const s=new Session({diveId:'four-weapon-presentation',battle:{spawn:false,content:true,
        weapons:[{kind:'torpedo'},{kind:'sonic'},{kind:'mine'},{kind:'arc'}],
        obstacles:previous.battle.obstacles,dangerZones:previous.battle.dangerZones}});
      previous.battle.dispose();c.session=s;
      const b=s.battle;b.player.y=b.player.previousY=200;
      for(const [x,y] of [[80,270],[-90,280],[120,300]])b.spawnEnemy({x,y,hp:10000,speed:0,assetKey:'enemy_normal_01_moon_jelly'});
      for(let i=0;i<5;i++)s.advance(1/30);
      c.hud.render(s,'四武器表现夹具：鱼雷 / 声波 / 电弧 / 锚雷',c.ads.view);
      return {projectiles:[...b.projectiles.values()].map(p=>p.kind),effects:[...b.effects.values()].map(e=>e.kind),
        worldChildren:c.hud.world.node.children.length,low:c.hud.lowEnd,hits:b.stats.hits};
    });
    assert.equal(state.low,tier==='low');
    for(const kind of ['torpedo','sonic','mine'])assert.ok(state.projectiles.includes(kind),kind);
    assert.ok(state.effects.includes('arc'));assert.ok(state.hits>0);
    assert.equal(state.worldChildren,0,'projectiles and effects must remain Graphics, with no per-shot nodes');
    await page.screenshot({path:`${artifacts}/${tier}-${target}.png`});
    assert.deepEqual(errors,[]);await writeFile(`${artifacts}/${tier}-${target}.json`,JSON.stringify({state,errors},null,2));
  },{navigate:false});
});
