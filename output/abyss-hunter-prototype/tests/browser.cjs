// 运行前设置 PLAYWRIGHT_MODULE，或在环境中安装 playwright；只启动前台浏览器。
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const fs=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
  const root=path.resolve(__dirname,'..');const out=path.join(root,'evidence');fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto('file://'+root+'/index.html');await page.waitForFunction(()=>window.prototype&&window.prototype.view.getHits().length>0);
    await page.waitForFunction(()=>Object.values(prototype.images).every(i=>i.complete&&i.naturalWidth>0));
    const act=a=>page.evaluate(a=>window.prototype.act(a),a);
    await page.screenshot({path:path.join(out,'01-review-workspace.png'),fullPage:true});
    await act('route:harbor');await page.locator('canvas').screenshot({path:path.join(out,'02-harbor.png')});
    await page.locator('#hit-layer').getByRole('button',{name:'↓  出发下潜',exact:true}).click();
    await page.locator('#hit-layer').getByRole('button',{name:'↑ 上浮',exact:true}).click();
    await page.locator('#hit-layer').getByRole('button',{name:'卸货并返回母港',exact:true}).click();
    assert.equal(await page.evaluate(()=>prototype.state.screen),'harbor');
    for(const screen of ['battle','abyss','upgrade','tech','equipment','rewards','codex']){
      await act('route:'+screen);await page.locator('canvas').screenshot({path:path.join(out,screen+'.png')});
    }
    await act('route:abyss');await page.locator('#hit-layer').getByRole('button',{name:'▷ 应急供氧',exact:true}).click();
    await page.locator('canvas').screenshot({path:path.join(out,'oxygen.png')});
    await page.locator('#hit-layer').getByRole('button',{name:'▷ 补满氧气',exact:true}).click();
    await page.locator('#hit-layer').getByRole('button',{name:'提前关闭 · 不领奖',exact:true}).click();
    assert.equal(await page.evaluate(()=>prototype.state.panel),'oxygen');
    await act('close');await act('die');await page.locator('canvas').screenshot({path:path.join(out,'rescue.png')});
    await page.locator('#hit-layer').getByRole('button',{name:'▷ 救援并保住荧晶',exact:true}).click();
    await page.locator('#hit-layer').getByRole('button',{name:'模拟完整观看',exact:true}).click();
    assert.equal(await page.evaluate(()=>prototype.state.rescueUsed),1);
    await act('ascend');await page.locator('canvas').screenshot({path:path.join(out,'settlement.png')});await act('unload');
    await page.selectOption('#size','667');
    for(const screen of ['harbor','battle','upgrade','tech','equipment','rewards','codex']){
      await act('route:'+screen);
      assert(await page.evaluate(()=>prototype.view.getHits().every(h=>h.y>=0&&h.y+h.h<=667)),screen+' has offscreen controls');
    }
    await page.locator('canvas').screenshot({path:path.join(out,'short-screen.png')});
    for(const value of ['loading','empty','error']){
      await page.selectOption('#ui-state',value);await page.locator('canvas').screenshot({path:path.join(out,value+'.png')});
      if(value==='empty'){
        await page.locator('#hit-layer').getByRole('button',{name:'前往下潜',exact:true}).click();
        assert.equal(await page.evaluate(()=>prototype.state.uiState),'default');
      }
    }
    await page.setViewportSize({width:375,height:812});await act('route:harbor');
    const box=await page.locator('canvas').boundingBox();assert(box.x>=0&&box.x+box.width<=375);
    await page.screenshot({path:path.join(out,'mobile-browser.png'),fullPage:true});
    assert.deepEqual(errors,[]);console.log('PASS: browser navigation, unload, oxygen cancel, rescue, 8 scenes, 3 states, short screen bounds, mobile layout; 0 page errors');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
