import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withBrowser } from './browser-helpers.mjs';
const root = fileURLToPath(new URL('../build/web-preview/',import.meta.url));
const artifacts=fileURLToPath(new URL('../.artifacts/loo-67/input/',import.meta.url));
async function ready(page){
  await page.waitForFunction(()=>typeof System!=='undefined');
  await page.evaluate(async()=>{window.cc=await System.import('cc');});
  await page.waitForFunction(()=>{window.c=window.cc.director.getScene()?.getChildByName('Canvas')?.getComponent('DiveController');return window.c?.hud?.sea.status==='ready'&&!window.c.session.pause.paused;});
}
async function click(page,name){
  const point=await page.evaluate(name=>{
    const find=n=>n.name===name&&n.activeInHierarchy?n:n.children.map(find).find(Boolean);
    const n=find(window.cc.director.getScene());if(!n)throw new Error(`Missing ${name}`);
    const b=n.getComponent(window.cc.UITransform).getBoundingBoxToWorld(),v=window.cc.view.getVisibleSize(),c=document.querySelector('canvas').getBoundingClientRect();
    return{x:c.x+(b.x+b.width/2)/v.width*c.width,y:c.y+(1-(b.y+b.height/2)/v.height)*c.height};
  },name);await page.mouse.click(point.x,point.y);await page.waitForTimeout(150);
}
test('three fresh-save dives with real elapsed time and pointer input, no injected resources or ads', {timeout:540000},async()=>{
  await mkdir(artifacts,{recursive:true});
  await withBrowser(root,async(page)=>{
    const errors=[],dives=[];page.on('pageerror',e=>errors.push(e.message));
    await ready(page);
    for(let trip=1;trip<=3;trip++){
      const origin=await page.evaluate(()=>{const l=window.c.hud.layout.joystick;return{x:l.x+56,y:l.y+56};});
      await page.mouse.move(origin.x,origin.y);await page.mouse.down();
      let record;
      do{
        record=await page.evaluate(()=>{
          const c=window.c,s=c.session,p=s.battle.player,l=c.hud.layout.joystick;
          const enemy=[...s.battle.enemies.values()].sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
          const loot=[...s.battle.loot.values()].filter(e=>e.y>25&&e.y<150).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
          let x=Math.sin(s.snapshot.activeSeconds/4)*80,y=p.y<60?40:-10;
          if(enemy&&Math.hypot(enemy.x-p.x,enemy.y-p.y)<100){x=p.x-enemy.x;y=p.y-enemy.y;}
          else if(loot){x=loot.x-p.x;y=loot.y-p.y;}
          if(p.y<25&&y<0)y=40;if(p.y>160&&y>0)y=-50;
          if(p.x>280)x=-80;if(p.x< -280)x=80;
          const norm=Math.hypot(x,y)||1;
          return{x:l.x+56+x/norm*45,y:l.y+56+y/norm*45,state:s.state,seconds:s.snapshot.activeSeconds,hp:p.hp,maxHp:s.maxHp,kills:s.battle.stats.kills,depth:s.battle.stats.maxDepth,step:c.economy.snapshot.objectives.tutorial.step};
        });
        assert.equal(record.state,'Running',JSON.stringify(record));
        await page.mouse.move(record.x,record.y);await page.waitForTimeout(350);
      }while(record.seconds<(trip===1?61:125)||(trip===1&&record.step<4));
      await page.mouse.up();dives.push({trip,...record});
      await page.screenshot({path:`${artifacts}/trip-${trip}-before-return.png`});
      await click(page,'return-touch');await page.waitForFunction(()=>window.c.session.state==='Settled');
      await page.screenshot({path:`${artifacts}/trip-${trip}-settled.png`});
      await click(page,'primary-touch');
      await page.waitForFunction(()=>{window.h=window.cc.director.getScene()?.getChildByName('Canvas')?.getComponent('HarborController');return !!window.h?.view;});
      if(await page.evaluate(()=>window.h.view.panel==='poster'))await click(page,'close');
      if(trip===1){
        await click(page,'upgrade');await click(page,'upgrade-cargo');await page.waitForFunction(()=>window.h.economy.snapshot.attributes.cargo===1);await click(page,'close');
        await click(page,'supply');await page.waitForTimeout(150);
        assert.ok(await page.evaluate(()=>window.h.model.adRemaining('gift')>0),'tutorial unlocks a visible ad within three minutes');
        await page.screenshot({path:`${artifacts}/tutorial-ad-unlocked.png`});await click(page,'close');
      }
      if(trip<3){await click(page,'LaunchButton');await ready(page);}
    }
    assert.deepEqual(errors,[]);
    await writeFile(`${artifacts}/result.json`,JSON.stringify({mode:'automated real-time pointer input; not human acceptance',dives,errors},null,2));
  },{width:375,height:667,recordVideo:artifacts});
});
