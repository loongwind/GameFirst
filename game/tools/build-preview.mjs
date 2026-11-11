import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** A preview is a copy of a guarded release; never modify the release directory. */
export async function createPreview(releaseRoot, previewRoot) {
  const source = path.resolve(releaseRoot), output = path.resolve(previewRoot);
  if (source === output || source.startsWith(output + path.sep) || output.startsWith(source + path.sep)) throw new Error('Release and preview must be distinct sibling directories');
  const manifest = JSON.parse(await readFile(path.join(source, 'playtest-version.json'), 'utf8'));
  if (manifest.target !== 'web-release') throw new Error('Preview requires a release build');
  await rm(output, { recursive: true, force: true });
  await cp(source, output, { recursive: true });
  await mkdir(path.join(output, 'preview'));
  for (const name of ['preview-ads.js', 'preview-ads.css']) await cp(new URL(`../development/browser/${name}`, import.meta.url), path.join(output, 'preview', name));
  const index = path.join(output, 'index.html');
  const html = await readFile(index, 'utf8');
  if (!html.includes('</head>') || !html.includes('</body>')) throw new Error('Missing HTML injection anchors');
  await writeFile(index, html.replace('</head>', '<link rel="stylesheet" href="preview/preview-ads.css"></head>')
    .replace('</body>', '<div id="preview-ad-badge" role="note">演示版 · 模拟广告</div><script src="preview/preview-ads.js"></script></body>'));
  await writeFile(path.join(output, 'playtest-version.json'), JSON.stringify({ ...manifest, target: 'web-preview', simulatedAds: true }, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const result = spawnSync(process.execPath, ['tools/build-web.mjs', 'web-release'], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
  await createPreview(path.join(root, 'build/web-release'), path.join(root, 'build/web-preview'));
  console.info('Static preview ready: build/web-preview');
}
