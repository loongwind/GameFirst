import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('static preview adds an isolated driver and manifest without changing release bytes', async () => {
  const { createPreview } = await import('../tools/build-preview.mjs');
  const root = await mkdtemp(path.join(tmpdir(), 'preview-build-'));
  try {
    const release = path.join(root, 'release'), preview = path.join(root, 'preview');
    await mkdir(release);
    const html = '<html><head></head><body><script src="game.js"></script></body></html>';
    await writeFile(path.join(release, 'index.html'), html);
    await writeFile(path.join(release, 'game.js'), 'production();');
    await writeFile(path.join(release, 'playtest-version.json'), JSON.stringify({ revision: 'abc', sourceDirty: false, target: 'web-release' }));
    await createPreview(release, preview);
    assert.equal(await readFile(path.join(release, 'index.html'), 'utf8'), html);
    assert.equal(await readFile(path.join(preview, 'game.js'), 'utf8'), 'production();');
    assert.match(await readFile(path.join(preview, 'index.html'), 'utf8'), /preview-ads\.js/);
    assert.match(await readFile(path.join(preview, 'index.html'), 'utf8'), /演示版 · 模拟广告/);
    assert.match(await readFile(path.join(preview, 'preview/preview-ads.js'), 'utf8'), /configureAds/);
    const manifest = JSON.parse(await readFile(path.join(preview, 'playtest-version.json'), 'utf8'));
    assert.equal(manifest.target, 'web-preview'); assert.equal(manifest.revision, 'abc');
    assert.equal(manifest.sourceDirty, false);
    await assert.rejects(() => createPreview(release, release), /distinct/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('release artifact guard rejects preview drivers and demo copy', async () => {
  const { assertReleaseArtifacts } = await import('../tools/release-guard.mjs');
  const root = await mkdtemp(path.join(tmpdir(), 'release-artifacts-'));
  try {
    await writeFile(path.join(root,'index.html'),'<html>production</html>');
    await assertReleaseArtifacts(root);
    await writeFile(path.join(root,'index.html'),'<html>演示版 · 模拟广告</html>');
    await assert.rejects(()=>assertReleaseArtifacts(root),/preview/);
    await writeFile(path.join(root,'index.html'),'<script src="preview/preview-ads.js"></script>');
    await assert.rejects(()=>assertReleaseArtifacts(root),/preview/);
  } finally { await rm(root,{recursive:true,force:true}); }
});
