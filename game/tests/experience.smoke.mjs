import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withBrowser, enterBuiltScene } from './browser-helpers.mjs';

const target = process.env.WEB_TARGET || 'web-release';
const phase = process.env.EXPERIENCE_PHASE || 'after';
const artifacts = fileURLToPath(new URL(`../.artifacts/loo-64/${phase}/`, import.meta.url));
const root = process.env.EXPERIENCE_ROOT || fileURLToPath(new URL(`../build/${target}/`, import.meta.url));
async function ready(page, url) {
  await page.goto(url); await page.waitForFunction(() => typeof System !== 'undefined');
  await page.evaluate(async () => { window.cc = await System.import('cc'); });
  await page.waitForFunction(() => {
    window.c = cc.director.getScene()?.getChildByName('Canvas')?.getComponent('DiveController');
    return c?.hud?.sea.status === 'ready' && !c.session.pause.paused;
  });
}
test(`${phase}: native harbor panel inventory at mobile sizes`, { timeout: 120000 }, async () => {
  await mkdir(artifacts, { recursive: true });
  await withBrowser(root, async (page, browser, url) => {
    await ready(page, url);await page.evaluate(()=>window.savedDiveCheckpoint=c.session.checkpoint());await enterBuiltScene(page, 'Harbor');
    await page.waitForFunction(() => {
      window.h = cc.director.getScene()?.getChildByName('Canvas')?.getComponent('HarborController'); return !!h?.view;
    });
    const rows = [];
    for (const [width, height, safe] of [[375, 667, false], [390, 844, false], [320, 640, true], [375, 400, false]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(safe => {
        document.documentElement.style.setProperty('--safe-top', safe ? '44px' : '0px');
        document.documentElement.style.setProperty('--safe-bottom', safe ? '34px' : '0px');
        h.view.close();
      }, safe);
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${artifacts}/harbor-${width}x${height}.png` });
      const panels = width === 375 && height === 667 ? ['upgrade', 'tech', 'equipment', 'supply', 'tasks', 'archive'] : ['upgrade'];
      for (const panel of panels) {
        await page.evaluate(panel => h.view.open(panel), panel); await page.waitForTimeout(80);
        await page.screenshot({ path: `${artifacts}/${panel}-${width}x${height}.png` });
      }
      rows.push(await page.evaluate(({ width, height }) => {
        const cv = document.querySelector('canvas').getBoundingClientRect(), v = cc.view.getVisibleSize();
        const find = (n, name) => n.name === name ? n : n.children.map(c => find(c, name)).find(Boolean);
        return { width, height, layout: h.view.layout, targets: ['close', 'upgrade-hp'].map(name => {
          const n = find(h.view.root, name); if (!n) return { name, absent: true };
          const b = n.getComponent(cc.UITransform).getBoundingBoxToWorld();
          return { name, width: b.width * cv.width / v.width, height: b.height * cv.height / v.height };
        }) };
      }, { width, height }));
      await page.evaluate(() => h.view.close());
    }
    await writeFile(`${artifacts}/panels.json`, JSON.stringify(rows, null, 2));
    if (phase === 'after') for (const row of rows) for (const t of row.targets) if (!t.absent) assert.ok(t.height >= 43.99, JSON.stringify(row));
    // An established save uses the genuine economy/upgrade pipeline, not another UI mockup.
    await page.setViewportSize({width:375,height:667});
    await page.evaluate(()=>{
      const e=h.economy;e.dispatch({type:'dive.settle',opId:'loo64-seed',settlement:{diveId:'loo64-seed',reason:'return',cargo:{crystal:1000000,pearl:10000,marrow:1000,core:100},xp:10000,depth:0,activeSeconds:0}});
      e.random=()=>0;e.dispatch({type:'box.draw',opId:'loo64-box',box:'silver',count:10});
      const session=window.savedDiveCheckpoint;session.battle.stats.maxDepth=800;
      e.checkpoint({savedAt:Date.now(),startedAt:Date.now(),session});e.checkpoint(null);
      h.view.close();
    });
    await page.waitForTimeout(100);await page.evaluate(()=>h.view.close());
    for(const panel of ['equipment','supply','tasks','archive','poster']){
      await page.evaluate(panel=>h.view.open(panel),panel);await page.waitForTimeout(200);
      await page.screenshot({path:`${artifacts}/${panel}-established.png`});
    }
    if(phase==='after'){
      await page.setViewportSize({width:375,height:400});
      await page.evaluate(()=>h.view.open('poster'));await page.waitForTimeout(200);
      await page.evaluate(()=>{
        const find=n=>n.name==='PanelScroll'?n:n.children.map(find).find(Boolean);
        find(h.view.root).getComponent(cc.ScrollView).scrollToBottom(0);
      });await page.waitForTimeout(100);
      await page.screenshot({path:`${artifacts}/poster-short-scrolled.png`});
      const buttons=await page.evaluate(()=>{
        const cv=document.querySelector('canvas').getBoundingClientRect(),v=cc.view.getVisibleSize();
        const find=(n,name)=>n.name===name?n:n.children.map(n=>find(n,name)).find(Boolean);
        return ['close','save-depth-poster'].map(name=>{
          const b=find(h.view.root,name).getComponent(cc.UITransform).getBoundingBoxToWorld();
          return {name,x:cv.left+(b.x+b.width/2)*cv.width/v.width,y:cv.top+(v.height-b.y-b.height/2)*cv.height/v.height,height:b.height*cv.height/v.height};
        });
      });
      for(const b of buttons){assert.ok(b.height>=43.99);assert.ok(b.y-b.height/2>=0&&b.y+b.height/2<=400);}
      const close=buttons[0];await page.mouse.click(close.x,close.y);await page.waitForTimeout(80);
      assert.equal(await page.evaluate(()=>h.view.panel),undefined);
      const launch=await page.evaluate(()=>{
        const n=h.view.root.children.find(n=>n.name==='HarborCanvas').getChildByName('LaunchButton'),b=n.getComponent(cc.UITransform).getBoundingBoxToWorld();
        const cv=document.querySelector('canvas').getBoundingClientRect(),v=cc.view.getVisibleSize();return{x:cv.left+(b.x+b.width/2)*cv.width/v.width,y:cv.top+(v.height-b.y-b.height/2)*cv.height/v.height};
      });await page.mouse.click(launch.x,launch.y);
      await page.waitForFunction(()=>cc.director.getScene().name==='Dive');
    }
  }, { navigate: false, width: 375, height: 667, deviceScaleFactor: 1 });
});

for(const quality of ['high','low'])test(`${phase}: ${quality} semantic objects and absolute wall phases`,{timeout:60000},async()=>{
  await mkdir(artifacts,{recursive:true});
  await withBrowser(root,async(page,browser,url)=>{
    await ready(page,`${url}?quality=${quality}`);
    await page.evaluate(()=>{
      c.enabled=false;const b=c.session.battle;b.autoSpawn=false;b.enemies.clear();b.loot.clear();b.projectiles.clear();
      b.player.y=b.player.previousY=240;c.hud.projection.y=240;
      b.spawnEnemy({x:80,y:220,assetKey:'enemy_normal_01_moon_jelly',speed:0});
      for(let i=0;i<4;i++)b.addLoot(-80+i*11,185+(i%2)*14,7);
      const mine=b.projectiles.acquire();Object.assign(mine,{kind:'mine',x:-65,previousX:-65,y:295,previousY:295,radius:6});
      const sonic=b.projectiles.acquire();Object.assign(sonic,{kind:'sonic',x:90,previousX:90,y:330,previousY:330,radius:30});
      c.hud.render(c.session,'',c.ads.view,c.economy.snapshot);
    });
    await page.setViewportSize({width:320,height:640});await page.waitForTimeout(150);await page.evaluate(()=>c.update(0));await page.waitForTimeout(80);
    await page.screenshot({path:`${artifacts}/objects-${quality}-320.png`});
    const samples=[];
    if(phase==='after')for(const depth of [799,800,801,1599,1600,1601,1041,1042,1043]){
      await page.evaluate(depth=>{
        const b=c.session.battle;b.player.y=b.player.previousY=depth;b.enemies.clear();
        for(const key of ['enemy_boss_01_angler_king','enemy_boss_02_tentacle_warden'])b.defeatedBosses.add(key);
        c.hud.projection.y=depth;c.hud.prepare(c.session);c.hud.render(c.session,'',c.ads.view,c.economy.snapshot);
      },depth);
      await page.waitForFunction(()=>{c.hud.prepare(c.session);c.hud.render(c.session,'',c.ads.view,c.economy.snapshot);return c.hud.sea.status==='ready';});
      samples.push(await page.evaluate(depth=>({depth,layer:c.hud.sea.activeLayer,strips:c.hud.sea.scenery.map(s=>({rate:s.rate,span:s.span,ys:s.nodes.map(n=>n.position.y),flips:s.nodes.map(n=>n.scale.y)}))}),depth));
      if([801,1601,1041,1042].includes(depth))await page.screenshot({path:`${artifacts}/walls-${quality}-${depth}.png`});
    }
    await writeFile(`${artifacts}/world-${quality}.json`,JSON.stringify(samples,null,2));
    for(const sample of samples)for(const strip of sample.strips.filter(s=>s.rate===.78&&s.flips.some(y=>y===-1))){
      assert.ok(strip.ys[0]-strip.span/2<=-375);assert.ok(strip.ys[2]+strip.span/2>=375);
    }
  },{navigate:false,width:375,height:667,deviceScaleFactor:1});
});

test(`${phase}: native surface return and scenery repro`, { timeout: 90000 }, async () => {
  await mkdir(artifacts, { recursive: true });
  await withBrowser(root, async (_page, browser, url) => {
    const context=await browser.newContext({viewport:{width:375,height:667},deviceScaleFactor:1,hasTouch:true,recordVideo:{dir:`${artifacts}/video`,size:{width:375,height:667}}});
    const page=await context.newPage();
    try {
    await ready(page, url);
    await page.evaluate(() => {
      c.session.battle.autoSpawn = false; c.session.battle.enemies.clear(); c.session.battle.obstacles = [];
      c.session.collect('crystal', 17); c.session.collect('pearl', 2);
    });
    const cdp=await context.newCDPSession(page);
    const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
    const drag=async(dy)=>{await touch('touchStart',[{x:200,y:300,id:1}]);await touch('touchMove',[{x:200,y:300+dy,id:1}]);};
    const read=()=>page.evaluate(()=>({depth:c.session.depth,camera:c.hud.projection.y,state:c.session.state,
      walls:c.hud.sea.scenery?.map(s=>({rate:s.rate,positions:s.nodes.map(n=>n.position.y)}))}));
    const start=await read();
    await drag(55); await page.waitForTimeout(2600); await touch('touchEnd',[]);
    await page.waitForTimeout(200); await page.screenshot({ path: `${artifacts}/dive-down.png` });
    const down = await read();
    await drag(-55); await page.waitForFunction(()=>c.session.depth===0); await touch('touchEnd',[]);
    await page.waitForTimeout(200); await page.screenshot({ path: `${artifacts}/dive-up.png` });
    const surface=await read();await page.waitForTimeout(500);const released=await read();
    await drag(-55); await page.waitForTimeout(700); await touch('touchEnd',[]);
    await page.screenshot({ path: `${artifacts}/surface.png` });
    const result = await page.evaluate(() => ({ state: c.session.state, depth: c.session.depth, wallet: c.economy.snapshot.wallet, settlement: c.session.pendingSettlement }));
    await writeFile(`${artifacts}/surface.json`, JSON.stringify({ start, down, surface, released, result }, null, 2));
    if (phase === 'after') {
      assert.ok(down.depth>200);assert.equal(surface.state,'Running');assert.equal(released.state,'Running');assert.equal(result.state, 'Settled');
      assert.ok(down.walls[1].positions[1]>start.walls[1].positions[1]);
      assert.ok(surface.walls[1].positions[1]<down.walls[1].positions[1]);
      assert.deepEqual(released.walls,surface.walls,'stationary camera never drifts');
      await page.reload();await page.waitForFunction(()=>typeof System!=='undefined');await page.evaluate(async()=>{window.cc=await System.import('cc');});
      await page.waitForFunction(()=>{window.c=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('DiveController');return c?.session.state==='Settled';});
      assert.deepEqual(await page.evaluate(()=>c.economy.snapshot.wallet),result.wallet,'settled receipt survives refresh without another payout');
    }
    } finally { await context.close();await page.video().saveAs(`${artifacts}/surface-return.webm`); }
  }, { navigate: false, width: 375, height: 667, deviceScaleFactor: 1 });
});
