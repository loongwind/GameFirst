import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withBrowser } from '../tests/browser-helpers.mjs';

const phase = process.argv[2] || 'after';
const target = process.env.WEB_TARGET || 'web-release';
const artifacts = fileURLToPath(new URL(`../.artifacts/mobile-${phase}/`, import.meta.url));
await mkdir(artifacts, { recursive: true });
await withBrowser(fileURLToPath(new URL(`../build/${target}`, import.meta.url)), async (page, browser, localUrl) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 1,
    hasTouch: true, recordVideo: { dir: artifacts, size: { width: 375, height: 667 } } });
  const mobile = await context.newPage();
  const url = process.env.MOBILE_URL || localUrl;
  const errors = []; mobile.on('pageerror', e => errors.push(e.message));
  await mobile.goto(url);
  await mobile.waitForFunction(() => typeof System !== 'undefined');
  await mobile.evaluate(async () => { window.cc = await System.import('cc'); });
  await mobile.waitForFunction(() => {
    window.c = window.cc.director.getScene()?.getChildByName('Canvas')?.getComponent('DiveController');
    return window.c?.hud?.sea.status === 'ready' && !window.c.session.pause.paused;
  }, null, { timeout: 30000 });
  const screenshots = [];
  for (const [width, height, safe] of [[375,667,false], [390,844,false], [320,640,true]]) {
    await mobile.setViewportSize({ width, height });
    await mobile.evaluate(safe => {
      document.documentElement.style.setProperty('--safe-top', safe ? '44px' : '0px');
      document.documentElement.style.setProperty('--safe-bottom', safe ? '34px' : '0px');
    }, safe);
    await mobile.waitForTimeout(350);
    const path = `${artifacts}/${width}x${height}${safe ? '-safe' : ''}.png`;
    await mobile.screenshot({ path }); screenshots.push(path);
  }
  await mobile.setViewportSize({ width: 375, height: 667 });
  await mobile.evaluate(() => {
    document.documentElement.style.setProperty('--safe-top', '0px');
    document.documentElement.style.setProperty('--safe-bottom', '0px');
  });
  await mobile.waitForTimeout(350);
  const cdp = await context.newCDPSession(mobile);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x,y]) => ({ x,y,id:1 })) });
  const moves = [];
  // Full-screen gesture, then the legacy area, to expose both input and camera behaviour.
  for (const [x,y,dx,dy,frames] of [[220,210,2,1,36], [75,580,-2,-1,30], [210,380,0,3,75]]) {
    await touch('touchStart', [[x,y]]);
    for (let i=0; i<frames; i++) { await touch('touchMove', [[x+Math.min(i,15)*dx,y+Math.min(i,15)*dy]]); await mobile.waitForTimeout(35); }
    moves.push(await mobile.evaluate(() => ({ x:c.session.battle.player.x, y:c.session.battle.player.y, tick:c.session.battle.tick })));
    await touch('touchEnd', []); await mobile.waitForTimeout(300);
  }
  await mobile.screenshot({path:`${artifacts}/combat.png`});
  await writeFile(`${artifacts}/capture.json`, JSON.stringify({ phase, target, url, screenshots, moves, errors }, null, 2));
  const video = mobile.video(); await context.close(); await video.saveAs(`${artifacts}/movement.webm`);
  console.log(JSON.stringify({ artifacts, url, moves, errors }));
}, { navigate: false, deviceScaleFactor: 1 });
