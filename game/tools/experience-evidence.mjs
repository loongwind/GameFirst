import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Comparison figures only embed unchanged native Cocos screenshots. No product UI mockups.
const root=fileURLToPath(new URL('../.artifacts/loo-64/',import.meta.url));
const pairs=[['harbor-375x667','母港 · 375×667'],['harbor-320x640','母港 · 320×640 / 安全区'],['harbor-375x400','母港 · 短屏'],['upgrade-375x667','机体强化'],['tech-375x667','潜航科技'],['equipment-established','装备收纳舱'],['supply-established','远航补给'],['tasks-established','航程任务'],['archive-established','探索档案'],['poster-established','深度海报'],['objects-high-320','战斗物体 · 高档'],['objects-low-320','战斗物体 · 低档']];
const sections=[];
for(const [key,title]of pairs){
  const images=await Promise.all(['before','after'].map(async phase=>`data:image/png;base64,${(await readFile(`${root}/${phase}/${key}.png`)).toString('base64')}`));
  sections.push(`<section id="${key}"><h2>${title}</h2><div class="pair">${images.map((src,i)=>`<figure><figcaption>${i?'AFTER · LOO-64':'BEFORE · 906d5e6'}</figcaption><img src="${src}" /></figure>`).join('')}</div></section>`);
}
const html=`<!doctype html><meta charset="utf-8"><title>LOO-64 原生 Cocos 画面对比</title><style>body{margin:0;padding:24px;background:#101c24;color:#e5e9d7;font:14px sans-serif}h1{font-size:22px}h2{font-size:18px;color:#e8bf80}section{margin:24px 0 40px;break-inside:avoid}.pair{display:flex;gap:16px;align-items:start}figure{margin:0;max-width:390px}figcaption{padding:8px 0;font:12px monospace;color:#b7cdc9}img{display:block;max-width:100%;height:auto}nav{display:flex;flex-wrap:wrap;gap:14px}a{color:#9be1cd}@media(max-width:600px){body{padding:12px}.pair{gap:8px}figure{max-width:48%}}</style><h1>LOO-64 / 潜航终端优化</h1><p>同尺寸真实 Cocos release 浏览器截图；左右为修改前/后。初始存档与已成长存档分开记录。</p><nav>${pairs.map(([key,title])=>`<a href="#${key}">${title}</a>`).join('')}</nav>${sections.join('')}`;
await mkdir(root,{recursive:true});await writeFile(`${root}/comparisons.html`,html);
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:830,height:900},deviceScaleFactor:1});
  await page.setContent(html);
  for(const key of ['harbor-375x667','harbor-320x640','upgrade-375x667','supply-established','objects-high-320','objects-low-320']){
    await page.locator(`#${key}`).screenshot({path:`${root}/compare-${key}.png`});
  }
}finally{await browser.close();}
