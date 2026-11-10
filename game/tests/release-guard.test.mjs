import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('release guard rejects explicitly marked simulators and mock entry points', async () => {
  const { assertReleaseSources } = await import('../tools/release-guard.mjs');
  const root = await mkdtemp(path.join(tmpdir(), 'abyss-release-test-'));
  try {
    await mkdir(path.join(root, 'platform'), { recursive: true });
    const source = path.join(root, 'platform', 'Adapter.ts');
    await writeFile(source, 'export class BrowserAdapter { readonly isMock = false; }');
    await assertReleaseSources(root);
    await writeFile(source, '/** @development-only */\nexport class SimulatedAdapter {}');
    await assert.rejects(() => assertReleaseSources(root), /development-only/);
    await writeFile(source, 'export class MockAdService {}');
    await assert.rejects(() => assertReleaseSources(root), /Mock/);
    await writeFile(source, 'export const adapter = { isMock: true };');
    await assert.rejects(() => assertReleaseSources(root), /isMock/);
    await writeFile(source, 'export { adapter } from "./mock/adapter";');
    await assert.rejects(() => assertReleaseSources(root), /mock/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
