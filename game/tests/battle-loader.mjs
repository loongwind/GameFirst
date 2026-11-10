import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
let loaded;
export function loadBattle() {
  if (loaded) return loaded;
  if (!existsSync(`${root}/assets/scripts/battle/index.ts`)) return {};
  execFileSync(`${root}/node_modules/.bin/tsc`, ['-p', 'tsconfig.battle.json'], { cwd: root, stdio: 'inherit' });
  loaded = createRequire(import.meta.url)(`${root}/.artifacts/battle/index.js`);
  return loaded;
}
