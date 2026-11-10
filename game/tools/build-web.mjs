import { readFileSync, mkdirSync, openSync, closeSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertReleaseSources } from './release-guard.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const target = process.argv[2] || 'web-debug';
if (!['web-debug', 'web-release'].includes(target)) throw new Error(`Unknown build target: ${target}`);
const balanceExport = spawnSync(process.execPath, ['tools/export-balance.mjs', '--check'], { cwd: root, stdio: 'inherit' });
if (balanceExport.status !== 0) process.exit(balanceExport.status || 1);
const executable = process.env.CREATOR_EXECUTABLE || '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator';
const expected = JSON.parse(readFileSync(path.join(root, 'editor-version.json'), 'utf8'));
const installed = JSON.parse(readFileSync(path.resolve(executable, '../../Resources/info.json'), 'utf8'));
for (const field of ['editor', 'engine', 'external']) {
  if (installed[field] !== expected[field]) throw new Error(`Cocos ${expected.version} ${field} fingerprint mismatch.`);
}
if (target === 'web-release') {
  await assertReleaseSources(path.join(root, 'assets'));
  await assertReleaseSources(path.join(root, '../shared'));
}
const shared = spawnSync(path.join(root, 'node_modules/.bin/tsc'), ['-p', path.join(root, '../shared/tsconfig.json')], { stdio: 'inherit' });
if (shared.status !== 0) process.exit(shared.status || 1);
// Import validates JSON-derived balance schema before invoking the expensive editor build.
await import(new URL('../../shared/dist/index.js', import.meta.url));
const configPath = path.join(root, 'build-configs', `${target}.json`);
const logDirectory = path.join(root, 'temp/build-logs');
mkdirSync(logDirectory, { recursive: true });
const logPath = path.join(logDirectory, `${target}.log`);
const log = openSync(logPath, 'w');
console.info(`Cocos ${expected.version} → ${target}. Log: temp/build-logs/${target}.log`);
const result = spawnSync(executable, ['--project', root, '--build', `configPath=${configPath}`], {
  cwd: root, stdio: ['ignore', log, log], timeout: 600_000,
});
closeSync(log);
if (result.error || result.status !== 36) {
  console.error(readFileSync(logPath, 'utf8').slice(-8000));
  console.error(result.error || `Creator exit ${result.status}; expected success code 36.`);
  process.exit(1);
}
const output = path.join(root, 'build', target, 'index.html');
if (!existsSync(output)) throw new Error(`Creator returned 36 but no output: ${output}`);
console.info(`Build passed (Creator exit 36): build/${target}/index.html`);
