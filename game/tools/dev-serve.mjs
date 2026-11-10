/** Development playtest entry: serves the web-debug build and injects the development-only
 *  mock ad boot script, so all 7 ad slots are playable locally while eligibility, daily
 *  caps, tokens and payouts stay on the real services. Never used by release builds. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const buildRoot = path.join(root, 'build', 'web-debug');
const devRoot = path.join(root, 'development');
const port = Number(process.env.DEV_PORT || 8177);
const types = { '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm' };

const server = createServer(async (request, response) => {
  try {
    const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const underDev = relative.startsWith('/__dev/');
    const base = underDev ? devRoot : buildRoot;
    const mapped = relative === '/' ? '/index.html' : relative;
    let file = path.resolve(base, '.' + (underDev ? mapped.slice('/__dev'.length) : mapped));
    if (!path.extname(file)) file += '.ts';
    if (!file.startsWith(path.resolve(base) + path.sep)) throw new Error('outside root');
    let body = await readFile(file);
    const type = path.extname(file) === '.ts' ? 'text/javascript' : types[path.extname(file)] || 'application/octet-stream';
    if (file.endsWith('index.html')) {
      // The development boot is server-injected: the product build itself stays untouched.
      body = Buffer.from(body.toString('utf8').replace('</body>', '<script src="/__dev/browser/mock-ads-boot.js"></script></body>'));
    }
    response.writeHead(200, { 'Content-Type': type });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});

server.listen(port, '127.0.0.1', () => {
  console.info(`开发试玩入口: http://127.0.0.1:${port}/  （web-debug 构建 + Mock广告驱动；资格/每日次数/token走真实服务）`);
  console.info('停止: Ctrl+C。release 构建不含本入口与任何 Mock。');
});
