import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
const root = fileURLToPath(new URL('..', import.meta.url));
let loaded;
export function loadServices() {
  if (loaded) return loaded;
  if (!existsSync(`${root}/assets/scripts/services/local/index.ts`)) return {};
  execFileSync(`${root}/node_modules/.bin/tsc`, ['-p', 'tsconfig.services.json'], { cwd: root, stdio: 'inherit' });
  return loaded = createRequire(import.meta.url)(`${root}/.artifacts/services/assets/scripts/services/local/index.js`);
}
export function memoryStorage() {
  const data = new Map();
  return { data, fail: false, getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { if (this.fail) throw new Error('quota'); data.set(key, value); }, removeItem(key) { data.delete(key); } };
}
