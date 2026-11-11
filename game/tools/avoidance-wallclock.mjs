import { mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withBrowser } from '../tests/browser-helpers.mjs';
import assert from 'node:assert/strict';

const artifacts=fileURLToPath(new URL('../.artifacts/mobile-rework-wallclock/',import.meta.url));
await mkdir(artifacts,{recursive:true});
await withBrowser(fileURLToPath(new URL('../build/web-release',import.meta.url)),async(_page,browser,localUrl)=>{
  const context=await browser.newContext({viewport:{width:375,height:667},deviceScaleFactor:1,
    recordVideo:{dir:artifacts,size:{width:375,height:667}}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',r=>errors.push(`${r.url()}: ${r.failure()?.errorText}`));
  const url=process.env.MOBILE_URL||localUrl;
  try{
    await page.goto(url);await page.waitForFunction(()=>typeof System!=='undefined');
    await page.evaluate(async()=>{window.cc=await System.import('cc');});
    await page.waitForFunction(()=>{window.c=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('DiveController');return c?.hud?.sea.status==='ready'&&!c.session.pause.paused;});
    await page.evaluate(()=>{const b=c.session.battle;b.autoSpawn=false;b.enemies.clear();b.player.x=b.player.previousX=135;b.player.y=b.player.previousY=400;});
    const read=()=>page.evaluate(()=>({hp:c.session.snapshot.hp,oxygen:c.session.snapshot.oxygen,tick:c.session.battle.tick,
      zones:c.session.battle.dangerZones,player:{x:c.session.battle.player.x,y:c.session.battle.player.y},
      state:c.session.state,pause:c.session.snapshot.pauseReasons,guidance:c.hud.labels.get('guidance').string}));
    await page.waitForTimeout(100);const started=Date.now(),before=await read();
    await page.screenshot({path:`${artifacts}/before.png`});await page.waitForTimeout(6000);const after=await read(),elapsed=Date.now()-started;
    await page.screenshot({path:`${artifacts}/after.png`});
    const version=await page.evaluate(async()=>{const r=await fetch('/playtest-version.json',{cache:'no-store'});return r.json();});
    await writeFile(`${artifacts}/result.json`,JSON.stringify({url,version,fixture:'Only spawner/enemies/position isolated; original HP, damage, controller and wall clock retained',startedAt:new Date(started).toISOString(),elapsedMs:elapsed,before,after,errors},null,2));
    assert.equal(after.hp,before.hp);assert.ok(after.tick-before.tick>=150);assert.ok(after.oxygen<before.oxygen);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({version,elapsedMs:elapsed,before,after,errors}));
  }finally{const video=page.video();await context.close();await video.saveAs(`${artifacts}/avoidance.webm`);}
},{navigate:false});
