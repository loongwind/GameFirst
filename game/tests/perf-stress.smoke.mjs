import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withBrowser } from './browser-helpers.mjs';

const target = process.env.WEB_TARGET || 'web-release';
const root = fileURLToPath(new URL(`../build/${target}`, import.meta.url));
const artifacts = fileURLToPath(new URL('../.artifacts/perf/', import.meta.url));
// Headed by default: real GPU raster. PERF_HEADLESS=1 reproduces on CI-like hosts (SwiftShader).
const headless = process.env.PERF_HEADLESS === '1';
const FRAMES = Number(process.env.PERF_FRAMES || 420);

async function diveReady(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => typeof System !== 'undefined');
  await page.evaluate(async () => { window.cc = await System.import('cc'); });
  await page.waitForFunction(() => {
    window.c = window.cc.director.getScene()?.getChildByName('Canvas')?.getComponent('DiveController');
    return window.c?.hud?.sea?.status === 'ready';
  }, null, { timeout: 30000 });
  // The enabled controller removes its own 'assets' pause once art is ready; wait for that
  // self-heal before disabling it, or the paused session would freeze the whole run.
  await page.waitForFunction(() => !window.c.session.pause.paused, null, { timeout: 30000 });
}

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p / 100 * sorted.length))];
};
const stats = values => values.length ? { n: values.length, p50: percentile(values, 50), p95: percentile(values, 95), p99: percentile(values, 99), max: Math.max(...values) } : { n: 0 };

/** Load is injected through the battle's own pool APIs; every object is a real entity the
 *  30Hz loop and the real Cocos presentation process. Only the fill source is synthetic. */
async function runStress(page) {
  return page.evaluate(({ frames }) => {
    const c = window.c; c.enabled = false;
    const s = c.session, b = s.battle;
    const normals = ['enemy_normal_01_moon_jelly', 'enemy_normal_02_lantern_angler', 'enemy_normal_03_electric_eel', 'enemy_normal_04_needlefish',
      'enemy_normal_05_hermit_crab', 'enemy_normal_06_glass_shrimp', 'enemy_normal_07_moon_snail', 'enemy_normal_08_comb_jelly'];
    const elites = ['enemy_elite_01_storm_eel', 'enemy_elite_02_iron_hermit', 'enemy_elite_03_spear_guard'];
    const spawnAround = count => {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2, distance = 80 + Math.random() * 260;
        const key = i % 12 === 11 ? elites[i % elites.length] : normals[i % normals.length];
        b.spawnEnemy({ x: b.player.x + Math.cos(angle) * distance, y: b.player.y + Math.sin(angle) * distance, assetKey: key, spawnDepth: 400 });
      }
    };
    b.player.x = 0; b.player.y = 400; b.player.previousX = 0; b.player.previousY = 400;
    spawnAround(80);
    // Stop the spawner so minima stay deterministic under injected load; kills still drop real loot.
    b['autoSpawn'] = false;
    // Timing instrumentation around the production advance path.
    const advance = s.advance.bind(s);
    let advanceMs = 0;
    s.advance = seconds => { const t0 = performance.now(); const r = advance(seconds); advanceMs += performance.now() - t0; return r; };
    const frameDeltas = [], stepsMs = [];
    const minima = { enemies: Infinity, projectiles: Infinity, loot: Infinity, texts: Infinity };
    const maxima = { enemies: 0, projectiles: 0, loot: 0, texts: 0 };
    let frame = 0, angle = 0;
    return new Promise(resolve => {
      let last = performance.now();
      const tick = () => {
        const now = performance.now();
        frameDeltas.push(now - last); last = now;
        advanceMs = 0;
        angle += 0.03;
        s.setInput(Math.cos(angle) * 200, Math.sin(angle) * 200, true);
        // Sustain the stress load: 80 enemies, 200 projectiles, 100 merged drops, 30 text groups.
        spawnAround(80 - b.enemies.size);
        // Load-test sustains: keep the diver alive and clear of the 800m gate boundary.
        b.player.hp = s.maxHp; b.player.y = Math.min(b.player.y, 700); b.player.x = Math.max(-340, Math.min(340, b.player.x));
        while (b.loot.size < 100) b.addLoot(b.player.x + (Math.random() - .5) * 300, b.player.y + (Math.random() - .5) * 300, 5);
        while (b.texts.size < 30) {
          const t = b.texts.acquire(); if (!t) break;
          t.x = t.previousX = b.player.x + (Math.random() - .5) * 200; t.y = t.previousY = b.player.y + (Math.random() - .5) * 200;
          t.value = 1 + Math.floor(Math.random() * 60); t.expiresTick = b.tick + 8 + Math.floor(Math.random() * 16); t.radius = 0;
        }
        while (b.projectiles.size < 200) {
          const p = b.projectiles.acquire(); if (!p) break;
          const a = Math.random() * Math.PI * 2;
          p.kind = 'torpedo'; p.x = p.previousX = b.player.x; p.y = p.previousY = b.player.y;
          p.vx = Math.cos(a) * 420; p.vy = Math.sin(a) * 420; p.damage = 0; p.bornTick = b.tick;
          p.expiresTick = b.tick + 15 + Math.floor(Math.random() * 60);
          p.owner = 1; p.range = 400; p.speed = 420; p.innerRadius = 0; p.triggerRadius = 0; p.radius = 4;
        }
        s.advance(1 / 30);
        stepsMs.push(advanceMs);
        const counts = { enemies: b.enemies.size, projectiles: b.projectiles.size, loot: b.loot.size, texts: b.texts.size };
        for (const key of Object.keys(counts)) { minima[key] = Math.min(minima[key], counts[key]); maxima[key] = Math.max(maxima[key], counts[key]); }
        if (++frame >= frames) {
          s.setInput(0, 0);
          resolve({ minima, maxima, frameMs: frameDeltas.slice(1), stepsMs, kills: b.stats.kills, hits: b.stats.hits, dropped: b.stats.droppedSteps, tick: b.tick });
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, { frames: FRAMES });
}

for (const tier of ['high', 'low']) test(`${target}: ${tier} tier real-scene stress 80/200/100/30 frame timing`, { timeout: 300000 }, async () => {
  await mkdir(artifacts, { recursive: true });
  await withBrowser(root, async (page, _b, url) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    await diveReady(page, `${url}${tier === 'low' ? '?quality=low' : ''}`);
    const tierFlag = await page.evaluate(() => window.c.hud.lowEnd);
    assert.equal(tierFlag, tier === 'low');
    const result = await runStress(page);
    const frame = stats(result.frameMs), steps = stats(result.stepsMs);
    // Always record the raw sample first: a failed budget must still leave evidence behind.
    const report = { tier, headless, viewport: page.viewportSize(), minima: result.minima, maxima: result.maxima,
      kills: result.kills, hits: result.hits, droppedSteps: result.dropped, battleTick: result.tick, frameMs: frame, advanceMs: steps, errors };
    await page.screenshot({ path: `${artifacts}/stress-${tier}-${target}.png` });
    await writeFile(`${artifacts}/stress-${tier}-${target}.json`, JSON.stringify(report, null, 2));
    console.info(`${target} ${tier}: frame p50/p95/p99 ${frame.p50}/${frame.p95}/${frame.p99} ms, advance p95 ${steps.p95} ms, minima ${JSON.stringify(result.minima)}, maxima ${JSON.stringify(result.maxima)}, kills ${result.kills}, hits ${result.hits}`);
    // Pools reach their spec caps; brief expiration dips are refilled the next frame.
    assert.deepEqual(result.maxima, { enemies: 80, projectiles: 200, loot: 100, texts: 30 });
    assert.ok(result.minima.enemies >= 70 && result.minima.projectiles >= 170 && result.minima.loot >= 85 && result.minima.texts >= 24,
      `sustained minima ${JSON.stringify(result.minima)}`);
    assert.ok(result.kills > 0 && result.hits > 0);
    // Budgets per 技术方案 §渲染: danger hints and 80-enemy logic stay; decorative layers may drop.
    assert.ok(frame.p95 < 60, `frame p95 ${frame.p95} ms`);
    assert.ok(steps.p95 < 20, `advance p95 ${steps.p95} ms`);
    assert.deepEqual(errors, []);
  }, { headless, deviceScaleFactor: 2 });
});
