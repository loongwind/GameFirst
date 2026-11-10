import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import ts from 'typescript';

export async function withBrowser(root, run, { navigate = true } = {}) {
  const types = { '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png' };
  const server = createServer(async (request, response) => {
    try {
      const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = path.resolve(root, '.' + (relative === '/' ? '/index.html' : relative));
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
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
    const url = `http://127.0.0.1:${server.address().port}`;
    if (navigate) await page.goto(url);
    await run(page, browser, url);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
