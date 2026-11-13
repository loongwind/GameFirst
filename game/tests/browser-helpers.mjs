import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import ts from 'typescript';

/** Wait for Boot's production auto-routing before an older scene-specific acceptance test navigates.
 *  timeout covers cold-start machines: the first scene load of a suite run decodes every bundle. */
export async function enterBuiltScene(page, name, { timeout = 30000 } = {}) {
  await page.evaluate(async () => { window.cc = await System.import('cc'); });
  await page.waitForFunction(() => {
    const scene = window.cc.director.getScene();
    return !!scene && (scene.name !== 'Boot' || !!scene.getChildByName('Canvas')?.getChildByName('StartTerminal'));
  }, null, { timeout });
  if (name === 'Harbor') await page.waitForFunction(() => {
    const c = window.cc.director.getScene().getChildByName('Canvas')?.getComponent('DiveController');
    return !c || c.hud?.sea.status === 'ready';
  }, null, { timeout });
  await page.evaluate(async name => {
    const { director } = window.cc;
    if (director.getScene().name === name) return;
    // Harbor panel fixtures explicitly finish the automatically started empty first dive.
    if (name === 'Harbor') {
      const c = director.getScene().getChildByName('Canvas')?.getComponent('DiveController');
      if (c) { c.session.requestReturn(); c.session.arriveHarbor(); c.dives.settle(c.session); c.handleAction('primary'); return; }
    }
    await new Promise((resolve, reject) => director.loadScene(name, error => error ? reject(error) : resolve()));
  }, name);
  await page.waitForFunction(name => window.cc.director.getScene()?.name === name, name, { timeout });
}

export async function withBrowser(root, run, { navigate = true, headless = true, deviceScaleFactor = 2, width = 375, height = 812, recordVideo } = {}) {
  const types = { '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png' };
  const server = createServer(async (request, response) => {
    try {
      const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      let file = path.resolve(root, '.' + (relative === '/' ? '/index.html' : relative));
      if (!path.extname(file)) file += '.ts';
      if (!file.startsWith(path.resolve(root) + path.sep)) throw new Error('outside root');
      let body = await readFile(file);
      if (path.extname(file) === '.ts') body = ts.transpileModule(body.toString(), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } }).outputText;
      response.writeHead(200, { 'Content-Type': path.extname(file) === '.ts' ? 'text/javascript' : types[path.extname(file)] || 'application/octet-stream' });
      response.end(body);
    } catch {
      // Platform tests need only an origin with storage, not a test-only product page.
      if (request.url === '/') response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Platform acceptance</title>');
      else response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    // Headed runs keep the real GPU raster path for performance sampling.
    browser = await chromium.launch({ channel: 'chrome', headless });
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor, ...(recordVideo ? { recordVideo: { dir: recordVideo, size: { width, height } } } : {}) });
    const url = `http://127.0.0.1:${server.address().port}`;
    if (navigate) await page.goto(url);
    await run(page, browser, url);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
