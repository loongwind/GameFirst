const {chromium}=require('../../../game/node_modules/playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try{const p=await b.newPage({viewport:{width:1668,height:1800},deviceScaleFactor:1});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(pathToFileURL(path.resolve(__dirname,'index.html')).href);await p.waitForFunction(()=>[...document.images].every(i=>i.complete));const broken=await p.locator('img').evaluateAll(a=>a.filter(i=>!i.naturalWidth).map(i=>i.src.slice(0,100)));if(broken.length)throw Error('Broken images '+broken);await p.screenshot({path:path.resolve(__dirname,'design-board.png'),fullPage:true});
if(await p.locator('.dock').count())throw Error('tab bar remains');
const harbor=p.locator('section[data-index="0"] .phone');
const entryRects=await harbor.locator('button').evaluateAll(bs=>bs.map(b=>{const r=b.getBoundingClientRect();return {name:b.getAttribute('aria-label')||b.textContent.trim(),w:r.width,h:r.height,x:r.x,y:r.y,visible:getComputedStyle(b).display!=='none'&&!!r.width}}).filter(x=>x.visible));
if(entryRects.length!==6||entryRects.some(r=>r.w<44||r.h<44))throw Error('harbor count/target size '+JSON.stringify(entryRects));
for(let i=0;i<entryRects.length;i++)for(let j=i+1;j<entryRects.length;j++){const a=entryRects[i],c=entryRects[j];if(a.x<c.x+c.w&&a.x+a.w>c.x&&a.y<c.y+c.h&&a.y+a.h>c.y)throw Error('overlap '+a.name+'/'+c.name)}
if(await harbor.locator('.beacon:visible').count()!==3)throw Error('red indicators');
await harbor.screenshot({path:path.resolve(__dirname,'harbor-r2-375x667.png')});
for(const [name,index] of [['机体强化工作台',2],['挂载装备吊臂',4],['潜航科技声呐台',3],['深海补给',5]]){
await p.getByRole('button',{name,exact:true}).click();
if(await p.locator('section:visible').getAttribute('data-index')!==String(index))throw Error('entry '+name);
await p.locator('section:visible').getByRole('button',{name:'← 返回母港',exact:true}).click();
if(await p.locator('section:visible').getAttribute('data-index')!=='0')throw Error('one step return '+name);
}
await p.evaluate(()=>showAll());
await p.getByRole('button',{name:'错误态',exact:true}).click();if(await p.locator('.status:visible').count()!==7)throw Error('error state count='+await p.locator('.status:visible').count());await p.getByRole('button',{name:'默认',exact:true}).click();await p.getByRole('button',{name:'重放跨层 · 1.2s'}).click();if(await p.locator('section:visible').count()!==1)throw Error('navigation');await p.getByRole('button',{name:'显示全部设计屏'}).click();await p.setViewportSize({width:390,height:844});if(await p.evaluate(()=>document.documentElement.scrollWidth)>390)throw Error('mobile overflow');if(errors.length)throw Error(errors.join('\n'));console.log('PASS: 7 screens; no bottom tab bar; 6 harbor targets >=44px, no overlaps, 3 red indicators; all 4 panels return in one step; images, states, replay and mobile width');}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
