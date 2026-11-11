import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withBrowser, enterBuiltScene } from './browser-helpers.mjs';
const root = process.env.PREVIEW_ROOT || fileURLToPath(new URL('../build/web-preview', import.meta.url));
const artifacts = fileURLToPath(new URL('../.artifacts/loo-67/ads/', import.meta.url));

async function click(page, name) {
  const box = await page.evaluate(name => {
    const find = n => n.name === name && n.activeInHierarchy ? n : n.children.map(find).find(Boolean);
    const node = find(window.cc.director.getScene()); if (!node) throw new Error(`Missing ${name}`);
    const t = node.getComponent(window.cc.UITransform), b = t.getBoundingBoxToWorld();
    const canvas = document.querySelector('canvas').getBoundingClientRect(), v = window.cc.view.getVisibleSize();
    return { x: canvas.x + (b.x + b.width / 2) / v.width * canvas.width, y: canvas.y + (1 - (b.y + b.height / 2) / v.height) * canvas.height, width: b.width / v.width * canvas.width, height: b.height / v.height * canvas.height };
  }, name);
  assert.ok(box.height >= 43.9 && box.width >= 43.9, `${name} touch area ${JSON.stringify(box)}`);
  assert.ok(box.y >= 0 && box.y <= page.viewportSize().height, `${name} visible`);
  await page.mouse.click(box.x, box.y); return box;
}
async function harbor(page) {
  await enterBuiltScene(page, 'Harbor');
  await page.waitForFunction(() => {
    window.h = window.cc.director.getScene()?.getChildByName('Canvas')?.getComponent('HarborController');
    return !!window.h?.view;
  });
  await page.waitForTimeout(250); // independent preview boot wires this scene
}
async function supply(page, index) { await page.evaluate(i => window.h.view.open('supply', i), index); await page.waitForTimeout(150); }
async function show(page, button, { skip = false, shot } = {}) {
  const box = await click(page, button);
  await page.locator('#preview-ad-skip').waitFor();
  assert.match(await page.locator('.preview-ad-overlay').innerText(), /演示用模拟广告，不产生真实广告收入/);
  const skipBox = await page.locator('#preview-ad-skip').boundingBox();
  assert.ok(skipBox.height >= 44 && skipBox.width >= 44);
  if (shot) await page.screenshot({ path: `${artifacts}/${shot}.png` });
  if (skip) await page.locator('#preview-ad-skip').click();
  await page.locator('.preview-ad-overlay').waitFor({ state: 'detached', timeout: 10000 });
  await page.waitForFunction(() => !(window.h?.model?.busy || window.c?.ads?.view.busy));
  await page.waitForTimeout(150);
  return box;
}
const count = (page, slot) => page.evaluate(slot => window.h.model.adRemaining(slot), slot);

for (const [width, height] of [[320,640],[375,667],[390,844]]) {
  test(`preview ${width}x${height}: real seven-slot payouts, skip, durable counters and usable overlay`, { timeout: 300000 }, async () => {
    await mkdir(artifacts, { recursive: true });
    await withBrowser(root, async (page, _browser, url) => {
      const errors = [], evidence = [];
      page.on('pageerror', e => errors.push(e.message));
      await harbor(page);
      await page.evaluate(() => {
        // Fixture unlock only. No fixture rewards bypass ad.prepare/complete/claim.
        window.h.economy.dispatch({ type:'dive.settle', opId:'preview-fixture-xp', settlement:{ diveId:'preview-fixture-xp', reason:'return', cargo:{crystal:0,pearl:0,marrow:0,core:0}, xp:10000, activeSeconds:0, depth:0 }});
        window.h.view.update();
      });
      assert.equal(await page.locator('#preview-ad-badge').innerText(), '演示版 · 模拟广告');
      await supply(page,0);
      const original = await page.evaluate(() => JSON.stringify(window.h.economy.snapshot.wallet));
      await show(page, 'ad-gift', {skip:true, shot:`${width}-skip`});
      assert.equal(await count(page,'gift'),5);
      assert.equal(await page.evaluate(() => JSON.stringify(window.h.economy.snapshot.wallet)), original);
      evidence.push({slot:'gift',box:await show(page,'ad-gift',{shot:`${width}-countdown`})});
      assert.equal(await count(page,'gift'),4);
      const wallet = await page.evaluate(() => JSON.stringify(window.h.economy.snapshot.wallet));
      await page.waitForTimeout(300); assert.equal(await page.evaluate(() => JSON.stringify(window.h.economy.snapshot.wallet)), wallet);
      await page.reload(); await harbor(page); assert.equal(await count(page,'gift'),4);
      for (const [slot,index,button] of [['blessing',1,'blessing-yield'],['sonar',2,'ad-sonar'],['silver',3,'ad-silver'],['gold',4,'ad-gold']]) {
        await supply(page,index);
        const before = await count(page,slot), inventory = await page.evaluate(() => window.h.economy.snapshot.inventory.length + window.h.economy.snapshot.tickets);
        evidence.push({slot,box:await show(page,button)});
        assert.equal(await count(page,slot),before-1);
        if (slot==='silver'||slot==='gold') {
          const reward=await page.evaluate(()=>({inventory:window.h.economy.snapshot.inventory,tickets:window.h.economy.snapshot.tickets,intents:window.h.economy.snapshot.intents,notice:window.h.model.notice}));
          assert.equal(reward.inventory.length+reward.tickets,inventory+1,JSON.stringify({slot,before:inventory,reward}));
        }
        if (slot==='sonar') assert.ok(await page.evaluate(() => window.h.model.buffSeconds('sonar') > 890));
      }
      // Exhaustion and all blessing choices on the main viewport. Only the wall clock is varied.
      if (width===375) {
        await supply(page,0); for(let i=0;i<4;i++) await show(page,'ad-gift');
        assert.equal(await count(page,'gift'),0);
        await page.evaluate(() => { window.adClock=Date.now(); window.h.economy.now=()=>window.adClock; window.h.model.now=()=>window.adClock; });
        for (const choice of ['oxygen','cargo']) {
          if (choice==='cargo') await page.evaluate(() => window.adClock += 86400000);
          await supply(page,1); await show(page,`blessing-${choice}`);
          assert.equal(await page.evaluate(() => window.h.economy.snapshot.buffs.blessing.choice),choice);
        }
        for (const [slot,index] of [['silver',3],['gold',4],['sonar',2]]) {
          while (await count(page,slot)>0) {
            if(slot==='sonar') await page.evaluate(() => window.adClock+=900001);
            await supply(page,index); await show(page,`ad-${slot}`);
          }
          assert.equal(await count(page,slot),0);
        }
        await page.evaluate(() => { window.h.economy.now=Date.now; window.h.model.now=Date.now; });
      }
      await click(page,'close'); await click(page,'LaunchButton');
      await page.waitForFunction(() => {
        window.c=window.cc.director.getScene()?.getChildByName('Canvas')?.getComponent('DiveController');
        return window.c?.hud?.sea.status==='ready' && !window.c.session.pause.paused;
      });
      await page.waitForTimeout(250);
      await page.evaluate(() => { window.h=undefined; const c=window.c;c.enabled=false;c.economy.now=()=>Date.now()+172800000;c.ads.now=()=>Date.now()+172800000;c.session.oxygen=c.session.oxygenCapacity*.14;c.hud.render(c.session,'',c.ads.view,c.economy.snapshot); });
      evidence.push({slot:'oxygen',box:await show(page,'oxygen-touch',{shot:`${width}-oxygen`})});
      assert.equal(await page.evaluate(()=>window.c.session.oxygen),await page.evaluate(()=>window.c.session.oxygenCapacity));
      assert.equal(await page.evaluate(()=>window.c.ads.view.oxygenRemaining),2);
      await page.evaluate(() => { const c=window.c;c.session.battle.player.hp=0;c.session.advance(1/30);c.hud.render(c.session,'',c.ads.view,c.economy.snapshot); });
      evidence.push({slot:'rescue',box:await show(page,'primary-touch')});
      assert.equal(await page.evaluate(()=>window.c.session.battle.player.hp),await page.evaluate(()=>window.c.session.maxHp*.5));
      assert.equal(await page.evaluate(()=>window.c.ads.view.rescueRemaining),2);
      if (width===375) {
        for (let i=0;i<2;i++) {
          await page.evaluate(()=>{const c=window.c;c.session.oxygen=c.session.oxygenCapacity*.14;c.hud.render(c.session,'',c.ads.view,c.economy.snapshot);});
          await show(page,'oxygen-touch');
          await page.evaluate(()=>{const c=window.c;c.session.battle.player.hp=0;c.session.advance(1/30);c.hud.render(c.session,'',c.ads.view,c.economy.snapshot);});
          await show(page,'primary-touch');
        }
        assert.equal(await page.evaluate(()=>window.c.ads.view.oxygenRemaining),0);
        assert.equal(await page.evaluate(()=>window.c.ads.view.rescueRemaining),0);
      }
      // Sonar in-dive uses its actual HUD entry, with the real renewal clock.
      await page.evaluate(() => { const c=window.c;c.hud.render(c.session,'',c.ads.view,c.economy.snapshot); });
      evidence.push({slot:'dive-sonar',box:await show(page,'sonar-touch')});
      assert.ok(await page.evaluate(()=>window.c.ads.view.sonarSeconds>890));
      assert.deepEqual(errors,[]);
      await writeFile(`${artifacts}/${width}.json`,JSON.stringify({fixture:'XP-only unlock; real AdService rewards',evidence,errors},null,2));
    },{width,height});
  });
}

test('preview load failure clears overlay, cancels reservation and keeps reward/counter unchanged', {timeout:60000}, async()=>{
  await withBrowser(root,async(page,_b,url)=>{
    await page.goto(`${url}/?previewAdFailure=always`); await harbor(page);
    await page.evaluate(()=>{window.h.economy.dispatch({type:'dive.settle',opId:'failure-unlock',settlement:{diveId:'failure-unlock',reason:'return',cargo:{crystal:0,pearl:0,marrow:0,core:0},xp:10000,activeSeconds:0,depth:0}});window.h.view.update();});
    await supply(page,0); const wallet=await page.evaluate(()=>JSON.stringify(window.h.economy.snapshot.wallet));
    await click(page,'ad-gift'); await page.waitForFunction(()=>!window.h.model.busy);
    assert.equal(await page.locator('.preview-ad-overlay').count(),0);
    assert.equal(await count(page,'gift'),5); assert.equal(await page.evaluate(()=>window.h.economy.snapshot.pendingAd),null);
    assert.equal(await page.evaluate(()=>JSON.stringify(window.h.economy.snapshot.wallet)),wallet);
    assert.match(await page.evaluate(()=>window.h.model.notice),/失败/);
  });
});

for(const reason of ['scene','pagehide']) test(`loading cancellation ${reason} cannot reopen or reward an abandoned ad`,{timeout:60000},async()=>{
  await withBrowser(root,async(page)=>{
    await harbor(page);await supply(page,0);await click(page,'ad-gift');
    await page.locator('.preview-ad-overlay').waitFor();
    await page.evaluate(async reason=>{
      window.abandoned=window.h.economy;
      if(reason==='scene') await new Promise((resolve,reject)=>window.cc.director.loadScene('Dive',e=>e?reject(e):resolve()));
      else window.dispatchEvent(new PageTransitionEvent('pagehide'));
    },reason);
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.preview-ad-overlay').count(),0,'abandoned load must not reopen show');
    assert.equal(await page.evaluate(()=>Object.values(window.abandoned.snapshot.daily).reduce((n,d)=>n+(d.gift||0),0)),0);
    assert.equal(await page.evaluate(()=>window.abandoned.snapshot.pendingAd),null);
  });
});

test('preview retries one load failure and holds its countdown while document is hidden', {timeout:60000},async()=>{
  await withBrowser(root,async(page,_b,url)=>{
    await page.goto(`${url}/?previewAdFailure=once`);await harbor(page);await supply(page,0);
    await click(page,'ad-gift');await page.locator('#preview-ad-skip').waitFor();
    // Browser visibility is simulated here; reward services and countdown timers are real.
    await page.evaluate(()=>{window.previewHidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.previewHidden});});
    await page.waitForTimeout(3300);
    assert.equal(await page.locator('#preview-ad-skip').count(),1);
    assert.equal(await count(page,'gift'),5);
    await page.evaluate(()=>window.previewHidden=false);
    await page.locator('.preview-ad-overlay').waitFor({state:'detached'});
    await page.waitForFunction(()=>!window.h.model.busy);
    assert.equal(await count(page,'gift'),4);
  });
});

test('preview badge never covers key HUD labels across the three viewports', {timeout:60000},async()=>{
  await withBrowser(root,async(page)=>{
    await page.waitForFunction(()=>typeof System!=='undefined');
    await page.evaluate(async()=>{window.cc=await System.import('cc');});
    await page.waitForFunction(()=>{window.c=window.cc.director.getScene()?.getChildByName('Canvas')?.getComponent('DiveController');return window.c?.hud?.sea.status==='ready';});
    for(const [width,height] of [[320,640],[375,667],[390,844]]){
      await page.setViewportSize({width,height});await page.waitForTimeout(250);
      const intersections=await page.evaluate(()=>{
        const badge=document.getElementById('preview-ad-badge').getBoundingClientRect(),canvas=document.querySelector('canvas').getBoundingClientRect(),v=window.cc.view.getVisibleSize();
        return ['hp','oxygenGauge','cargo','depth','status','guidance'].filter(key=>{
          const label=window.c.hud.labels.get(key),b=label.node.getComponent(window.cc.UITransform).getBoundingBoxToWorld();
          const left=canvas.x+b.x/v.width*canvas.width,right=left+b.width/v.width*canvas.width,top=canvas.y+(1-(b.y+b.height)/v.height)*canvas.height,bottom=top+b.height/v.height*canvas.height;
          return badge.left<right&&badge.right>left&&badge.top<bottom&&badge.bottom>top;
        });
      });
      assert.deepEqual(intersections,[],`${width}: badge covers HUD`);
      await page.screenshot({path:`${artifacts}/badge-${width}.png`});
    }
  });
});
