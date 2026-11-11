import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withBrowser } from './browser-helpers.mjs';

const target=process.env.WEB_TARGET||'web-release';
const phase=process.env.REWORK_PHASE||'after';
const artifacts=fileURLToPath(new URL(`../.artifacts/mobile-rework-${phase}/`,import.meta.url));
async function ready(page,url){
  const entry=new URL(process.env.MOBILE_URL||url);for(const [key,value]of new URL(url).searchParams)entry.searchParams.set(key,value);
  await page.goto(entry.href);await page.waitForFunction(()=>typeof System!=='undefined');
  await page.evaluate(async()=>{window.cc=await System.import('cc');});
  await page.waitForFunction(()=>{
    window.c=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('DiveController');
    return c?.hud?.sea.status==='ready'&&!c.session.pause.paused;
  });
}
for(const tier of ['high','low'])test(`${target}: ${tier} AI avoidance data has no damage cues, including restored sessions`,{timeout:60000},async()=>{
  await mkdir(artifacts,{recursive:true});
  await withBrowser(fileURLToPath(new URL(`../build/${target}`,import.meta.url)),async(page,browser,url)=>{
    await ready(page,`${url}?quality=${tier}`);
    const rows=[];
    for(const restored of [false,true]){
      if(restored){await page.reload();await page.evaluate(async()=>{window.cc=await System.import('cc');});await page.waitForFunction(()=>{window.c=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('DiveController');return c?.hud?.sea.status==='ready'&&!c.session.pause.paused;});}
      rows.push(await page.evaluate(restored=>{
        c.enabled=false;const s=c.session,b=s.battle;b.autoSpawn=false;b.enemies.clear();
        b.player.x=b.player.previousX=135;b.player.y=b.player.previousY=400;
        const zones=b.dangerZones,g=c.hud.world,commands=[],originals={};
        for(const name of ['moveTo','lineTo','circle','fill','stroke','close']){
          originals[name]=g[name];g[name]=function(...args){commands.push([name,...args]);return originals[name].apply(this,args);};
        }
        const samples=[];
        try{
          for(const tutorial of [true,false]){
            const state=c.economy.snapshot;state.objectives.tutorial.active=tutorial;
            commands.length=0;b.dangerZones=zones;c.hud.render(s,'',c.ads.view,state);const withMetadata=JSON.stringify(commands);
            const guidance=c.hud.labels.get('guidance').string;
            commands.length=0;b.dangerZones=[];c.hud.render(s,'',c.ads.view,state);
            samples.push({tutorial,guidance,sameDrawing:withMetadata===JSON.stringify(commands)});
          }
        }finally{b.dangerZones=zones;for(const [name,fn]of Object.entries(originals))g[name]=fn;}
        const hp=b.player.hp,tick=b.tick;for(let i=0;i<180;i++)s.advance(1/30);
        c.dives.save(s);c.hud.render(s,'',c.ads.view,c.economy.snapshot);
        return {restored,samples,hpBefore:hp,hpAfter:b.player.hp,advanced:b.tick-tick,zones:b.dangerZones,low:c.hud.lowEnd};
      },restored));
      await page.screenshot({path:`${artifacts}/avoidance-${tier}-${restored?'restored':'fresh'}.png`});
    }
    await writeFile(`${artifacts}/avoidance-${tier}.json`,JSON.stringify(rows,null,2));
    for(const row of rows){assert.equal(row.low,tier==='low');assert.equal(row.advanced,180);assert.equal(row.hpAfter,row.hpBefore);assert.ok(row.zones.length>0,'internal steering data retained');
      for(const s of row.samples){assert.equal(s.sameDrawing,true,'AI-only metadata must not create a player-facing world overlay');assert.doesNotMatch(s.guidance,/红色|危险区.*伤害/);}}
  },{navigate:false,width:375,height:667,deviceScaleFactor:1});
});

test(`${target}: actual UITransform-to-canvas CSS targets fit safe areas across resize, DPR and orientation`,{timeout:90000},async()=>{
  await mkdir(artifacts,{recursive:true});
  const rows=[];
  await withBrowser(fileURLToPath(new URL(`../build/${target}`,import.meta.url)),async(_page,browser,url)=>{
    for(const dpr of [1,3]){
      const context=await browser.newContext({viewport:{width:375,height:667},deviceScaleFactor:dpr,hasTouch:true});const page=await context.newPage();
      try{
        await ready(page,`${url}?quality=${dpr===1?'high':'low'}`);await page.evaluate(()=>{c.enabled=false;c.session.battle.autoSpawn=false;c.session.battle.enemies.clear();});
        for(const [width,height,safe]of [[320,640,true],[375,667,false],[390,844,true],[667,375,false],[844,390,false],[375,400,false]]){
          await page.setViewportSize({width,height});await page.evaluate(safe=>{
            document.documentElement.style.setProperty('--safe-top',safe?'44px':'0px');document.documentElement.style.setProperty('--safe-bottom',safe?'34px':'0px');
          },safe);await page.waitForTimeout(200);
          for(const modal of [false,true]){
            await page.evaluate(modal=>{if(modal)c.session.pause.add('modal');else c.session.pause.remove('modal');c.session.oxygen=c.session.oxygenCapacity*.14;c.update(0);},modal);
            await page.waitForTimeout(50);
            rows.push(await page.evaluate(({width,height,safe,dpr,modal})=>{
              const canvas=document.querySelector('canvas').getBoundingClientRect(),visible=cc.view.getVisibleSize();
              const names=modal?['primary','secondary']:['pause','return','sonar','oxygen','dismissOxygen'];
              const targets=names.map(name=>{
                const n=c.hud.buttons.get(name).node,b=n.getComponent(cc.UITransform).getBoundingBoxToWorld();
                return {name,width:b.width*canvas.width/visible.width,height:b.height*canvas.height/visible.height,
                  x:canvas.left+b.x*canvas.width/visible.width,y:canvas.top+(visible.height-b.y-b.height)*canvas.height/visible.height};
              });
              // Presentation-only state fixture; reward/rescue transitions are covered by sonar-ads.smoke.
              let body;
              if(modal){
                const s=c.session,old=s.currentState;s.currentState='RescuePending';c.hud.render(s,'',c.ads.view,c.economy.snapshot);s.currentState=old;
                const label=c.hud.labels.get('modalBody'),box=label.node.getComponent(cc.UITransform).contentSize;
                body={height:box.height,lineHeight:label.lineHeight,lines:label.string.split('\n').length};
              }
              return {width,height,safe,dpr,modal,targets,body,canvas:{width:canvas.width,height:canvas.height},visible:{width:visible.width,height:visible.height}};
            },{width,height,safe,dpr,modal}));
            if(dpr===1)await page.screenshot({path:`${artifacts}/targets-${width}x${height}-${modal?'modal':'oxygen'}.png`});
          }
        }
        // Original terrain, actual session movement: approach, stop and go around.
        await page.setViewportSize({width:320,height:640});await page.waitForTimeout(200);
        const rock=await page.evaluate(()=>{
          const s=c.session,b=s.battle;s.pause.remove('modal');s.oxygen=s.oxygenCapacity;
          b.player.x=b.player.previousX=70;b.player.y=b.player.previousY=100;s.setInput(0,1,true);
          for(let i=0;i<30;i++)s.advance(1/30);s.setInput(0,0);c.update(0);
          return {x:b.player.x,y:b.player.y,distance:Math.hypot(b.player.x-70,b.player.y-180),obstacle:b.obstacles[0]};
        });
        await page.waitForTimeout(80);await page.screenshot({path:`${artifacts}/rock-${dpr===1?'high':'low'}-approach.png`});
        const around=await page.evaluate(()=>{const s=c.session,b=s.battle;s.setInput(1,0,true);for(let i=0;i<24;i++)s.advance(1/30);s.setInput(0,1,true);for(let i=0;i<28;i++)s.advance(1/30);s.setInput(0,0);c.update(0);return{x:b.player.x,y:b.player.y};});
        await page.waitForTimeout(80);await page.screenshot({path:`${artifacts}/rock-${dpr===1?'high':'low'}-around.png`});
        rows.push({dpr,rock,around});
      }finally{await context.close();}
    }
  },{navigate:false});
  await writeFile(`${artifacts}/targets-and-rock.json`,JSON.stringify(rows,null,2));
  for(const row of rows){if(row.rock){assert.ok(row.rock.distance>=46);assert.ok(row.rock.y<180&&row.around.y>180);continue;}
    if(row.body)assert.ok(row.body.height>=row.body.lineHeight*row.body.lines,`modal copy fits ${row.width}x${row.height}: ${JSON.stringify(row.body)}`);
    for(const r of row.targets){assert.ok(r.width>=43.99&&r.height>=43.99,`${row.width}px DPR${row.dpr} ${r.name}: ${r.width}x${r.height} CSSpx`);
      assert.ok(r.x>=-.01&&r.x+r.width<=row.width+.01,`${r.name} horizontal bounds`);
      assert.ok(r.y>=(row.safe?44:0)-.01&&r.y+r.height<=row.height-(row.safe?34:0)+.01,`${r.name} vertical safe bounds`);}}
});
