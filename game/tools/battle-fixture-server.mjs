import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
export async function startBattleFixture(port = 0) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
      const file = path.resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/tests/fixtures/battle.html' : pathname));
      if (!file.startsWith(root) || !['.ts', '.js', '.html'].includes(path.extname(file))) throw new Error('Invalid fixture asset');
      let source = await readFile(file, 'utf8');
      if (file.endsWith('.ts')) {
        source = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } }).outputText;
        source = source.replace(/(from\s+['"])(\.[^'"]+)(['"])/g, (_all, before, spec, after) => `${before}${spec.endsWith('.ts') ? spec : spec + '.ts'}${after}`);
      }
      response.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }).end(source);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fixture = await startBattleFixture(Number(process.env.PORT || 8081));
  console.info(`Battle fixture: ${fixture.url} — Ctrl+C to stop`);
}
