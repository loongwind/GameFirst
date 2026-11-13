import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withBrowser } from './browser-helpers.mjs';
import { execFileSync } from 'node:child_process';

const target = process.env.WEB_TARGET || 'web-release';
const root = fileURLToPath(new URL(`../build/${target}`, import.meta.url));
const artifacts = fileURLToPath(new URL('../.artifacts/progression/', import.meta.url));
const balance = JSON.parse(await readFile(fileURLToPath(new URL('../../shared/config/balance.json', import.meta.url)), 'utf8'));
// SUNLIGHT_TUNING lives in SeaContent.ts (battle has no balance-table dependency); parse the
// literal so the harness always uses the shipped first-layer numbers instead of a copy.
const seaContentSource = await readFile(fileURLToPath(new URL('../assets/scripts/battle/SeaContent.ts', import.meta.url)), 'utf8');
const SUNLIGHT = Object.fromEntries(['maxDepth', 'normalHp', 'eliteHp', 'bossHp', 'bossAttack', 'attack', 'spawnIntervalMultiplier', 'oxygenRateMultiplier']
  .map(key => [key, Number(new RegExp(`${key}:\\s*(-?[0-9.]+)`).exec(seaContentSource)?.[1])]));
if (!Object.values(SUNLIGHT).every(Number.isFinite)) throw new Error('SUNLIGHT_TUNING could not be parsed from SeaContent.ts');
const MAX_DIVES = Number(process.env.PROGRESS_MAX_DIVES || 80);
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8' }).trim();
const runStartedAt = new Date().toISOString();

async function diveReady(page) {
  await page.waitForFunction(() => typeof System !== 'undefined');
  await page.evaluate(async () => { window.cc = await System.import('cc'); });
  await page.waitForFunction(() => {
    window.c = window.cc.director.getScene()?.getChildByName('Canvas')?.getComponent('DiveController');
    return window.c?.hud?.sea?.status === 'ready';
  }, null, { timeout: 30000 });
  // Let the enabled controller clear its own 'assets' pause before it gets disabled.
  await page.waitForFunction(() => !window.c.session.pause.paused, null, { timeout: 30000 });
}
async function harborReady(page) {
  await page.waitForFunction(() => {
    window.h = window.cc.director.getScene()?.getChildByName('Canvas')?.getComponent('HarborController');
    return !!window.h?.view;
  }, null, { timeout: 30000 });
}
async function click(page, name) {
  const point = await page.evaluate(name => {
    const find = n => n.name === name && n.activeInHierarchy ? n : n.children.map(find).find(Boolean);
    const n = find(window.cc.director.getScene()); if (!n) return null;
    const t = n.getComponent(window.cc.UITransform), b = t.getBoundingBoxToWorld(), visible = window.cc.view.getVisibleSize();
    return { x: (b.x + b.width / 2) / visible.width * innerWidth, y: innerHeight - (b.y + b.height / 2) / visible.height * innerHeight };
  }, name);
  if (!point) return false;
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(120);
  return true;
}

test(`${target}: natural economy progression reaches all three sea layers without injected resources`, { timeout: 1_800_000 }, async () => {
  await mkdir(artifacts, { recursive: true });
  await withBrowser(root, async (page, _b, url) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    // Test-side mock video driver: payouts stay behind the real AdService counters and eligibility.
    await page.goto(url);
    await page.evaluate(() => {
      window.testDriver = { isMock: true, shows: 0, async load() {}, async show() { this.shows++; return 'completed'; } };
    });
    await page.evaluate(effects => { window.__techEffect = effects; }, Object.fromEntries(balance.tech.nodes.map(n => [n.id, n.effect])));
    await diveReady(page);
    // --- Tutorial completion on the production fixed clock (real services, no resource injection) ---
    await page.evaluate(() => { window.c.enabled = false; });
    const tutorial = await page.evaluate(async () => {
      const c = window.c, s = c.session;
      const towardLoot = () => {
        const p = s.battle.player;
        const loot = [...s.battle.loot.values()].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
        const enemy = [...s.battle.enemies.values()].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        if (enemy && Math.hypot(enemy.x - p.x, enemy.y - p.y) < 60) return { x: p.x - enemy.x, y: 20 };
        if (loot[0]) return { x: loot[0].x - p.x, y: loot[0].y - p.y };
        return { x: Math.sin(s.snapshot.activeSeconds / 4) * 40, y: p.y < 40 ? 40 : -20 };
      };
      for (let i = 0; i < 2400 && s.snapshot.activeSeconds < 61; i++) {
        const v = towardLoot(); s.setInput(v.x, v.y); s.advance(1 / 6);
      }
      s.setInput(0, 0);
      c.dives.save(s); s.requestReturn(); s.arriveHarbor(); c.dives.settle(s);
      return { wallet: c.economy.snapshot.wallet.crystal, step: c.economy.snapshot.objectives.tutorial.step, seconds: s.snapshot.activeSeconds, kills: s.battle.stats.kills };
    });
    assert.equal(tutorial.wallet, '500', 'first tutorial deposit pays exactly 500 crystal');
    await page.reload(); await diveReady(page);
    assert.equal(await page.evaluate(() => window.c.session.state), 'Settled');
    await click(page, 'primary-touch'); await harborReady(page);
    if (await page.evaluate(() => window.h.view.panel === 'poster')) await click(page, 'close');
    await click(page, 'upgrade'); // LOO-70 R2: the upgrade panel is a station entry
    await click(page, 'upgrade-cargo');
    await page.waitForFunction(() => window.h.economy.snapshot.attributes.cargo === 1);
    await click(page, 'close'); await click(page, 'LaunchButton');
    await diveReady(page);
    assert.equal(await page.evaluate(() => window.c.economy.snapshot.objectives.tutorial.completed), true);

    const runStartedAtMs = Date.now();
    // --- Natural dive loop: real sessions, real economy, real ads; only wall-clock is compressed ---
    const dives = [];
    let reached2400 = false, deaths = 0, rescues = 0, oxygenAds = 0, pearlIncome = 0;
    for (let n = 1; n <= MAX_DIVES && !reached2400; n++) {
      // Phase A dives 1-10: the safe speed-farm profile. Phase B: the full-depth push.
      await page.evaluate(strategy => { window.__strategy = strategy; }, n <= 10 ? 'farm' : 'push');
      const record = await page.evaluate(async ({ n, techEffects, sunlight }) => {
        const c = window.c, s = c.session;
        c.enabled = false;
        // A page reload wipes injected globals; re-arm the mock video driver and the tech
        // table here so every dive starts with real, working rescue/oxygen eligibility.
        window.__techEffect = techEffects;
        window.testDriver ??= { isMock: true, shows: 0, async load() {}, async show() { this.shows++; return 'completed'; } };
        c.configureAds(window.testDriver);
        const startPearls = BigInt(c.economy.snapshot.wallet.pearl);
        const startCrystal = BigInt(c.economy.snapshot.wallet.crystal);
        const startState = { attributes: { ...c.economy.snapshot.attributes }, level: c.economy.snapshot.playerLevel, tech: c.economy.snapshot.tech.length,
          state: s.state, seconds: +s.snapshot.activeSeconds.toFixed(1), paused: [...s.pause.reasons], diveId: s.diveId, depth: Math.floor(s.depth) };
        const gateAtStart = s.content.gateDepth ?? null, bossesBefore = s.battle.contentProgress.defeatedBosses.length;
        let usedRescue = 0, usedOxygen = 0, deathsThisDive = 0, gateAttempted = false, gateKills = 0;
        const decisions = { oxygenAttempts: 0, oxygenOk: 0, oxygenFailed: 0, rescueAttempts: 0, rescueOk: 0, returnCause: 'surface' };
        // Boss feasibility (pure arithmetic on the real buildable state; no game state is written):
        // can the guardian die inside the oxygen budget this depth allows?
        const mult = () => (1 + .05 * c.economy.snapshot.attributes.attack) *
          (1 + c.economy.snapshot.tech.filter(t => t.startsWith('attack.')).reduce((a, id) => a + (window.__techEffect?.[id] ?? 0), 0));
        const oxygenRate = () => {
          const attr = c.economy.snapshot.attributes.oxygen;
          const tech = 1 + c.economy.snapshot.tech.filter(t => t.startsWith('oxygen.')).reduce((a, id) => a + (window.__techEffect?.[id] ?? 0), 0);
          // DiveSession halves consumption while the active layer is sunlight (<800m).
          return 120 / (120 * (1 + .01 * attr)) / tech * 0.5;
        };
        /** DPS/oxygen feasibility — the economic question the push profile is allowed to test. */
        const gateFeasible = () => {
          const gate = s.content.gateDepth;
          if (gate === undefined) return true;
          const bossHp = 50 * Math.pow(1.18, Math.min(23, Math.floor(gate / 100))) * 40 * (gate <= 800 ? sunlight.bossHp : 1);
          const rate = oxygenRate() * (1 + .2 * Math.floor(gate / 500));
          const bars = 1 + 3; // ads.unlockLevel = 1: the 3 daily refills are available from the first dive
          const window = 120 / rate * bars * .8;
          return bossHp / (53 * mult()) <= window;
        };
        /** Survivability assumption under test: can the pool survive four guardian contacts?
         *  Recorded, never used to lock the gate — the push profile attempts whenever feasible. */
        const gateSurvivable = () => {
          const gate = s.content.gateDepth;
          if (gate === undefined) return true;
          const bandAttack = 8 * Math.pow(1.12, Math.min(23, Math.floor(gate / 100)));
          const guardian = bandAttack * 4 * (gate <= 800 ? sunlight.bossAttack : 1);
          return s.maxHp >= guardian * 4 * 1.35;
        };
        const pushing = window.__strategy === 'push';
        const feasible = gateFeasible(), survivable = gateSurvivable();
        window.__progress = { feasible, survivable, angle: Math.PI / 2 };
        const steer = () => {
          const b = s.battle, p = b.player, gate = s.content.gateDepth ?? 2400;
          const state = window.__progress;
          // 'farm' sweeps only water it can clear (safe speed-farming profile). 'push' works
          // the gate whenever DPS/oxygen arithmetic says the guardian is killable, regardless
          // of the survivability assumption; otherwise it farms the deepest band it can clear.
          const power = 140 + 45 * c.economy.snapshot.attributes.attack + 12 * c.economy.snapshot.attributes.hp;
          const safeCeiling = Math.max(260, Math.min(gate - 150, power));
          const ceiling = pushing && state.feasible ? gate : safeCeiling;
          const boss = [...b.enemies.values()].find(e => e.kind === 'boss');
          const fighting = pushing && state.feasible && boss;
          state.angle += 0.017;
          let x, y;
          if (fighting) {
            // Orbit the guardian inside weapon range: stay at ~175 units, never corner against it.
            const d = Math.hypot(p.x - boss.x, p.y - boss.y) || 1;
            const tx = boss.x + Math.cos(state.angle) * 175, ty = boss.y + Math.sin(state.angle) * 175;
            x = tx - p.x; y = ty - p.y;
            if (d < 120) { x = p.x - boss.x; y = p.y - boss.y; }
          } else {
            // Loop-strafe on an ellipse: the path never crosses itself, so chasers trail behind
            // instead of being reversed into at turn-around points.
            const cruise = Math.max(160, ceiling - 160);
            x = Math.cos(state.angle) * 230 - p.x;
            y = cruise + Math.sin(state.angle) * 130 - p.y;
            if (p.y > ceiling - 30 && y > 0) y = 0;
            // Ground loot is the crystal economy (pickup radius is 0 at base stats, so the
            // diver must walk over drops). Farm dives chase every drop; push dives only sweep
            // nearby drops so the push to the gate still makes progress.
            // Sweep nearby drops at or below the current depth. Chasing drops above drags the
            // diver back toward the surface (where most early kills happen) and stalls descent.
            if (s.snapshot.cargo.crystal < s.snapshot.cargoCapacity) {
              const loot = Array.from(b.loot.values())
                .filter(item => item.y >= p.y - 30)
                .sort((a, b2) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b2.x - p.x, b2.y - p.y))[0];
              if (loot && Math.hypot(loot.x - p.x, loot.y - p.y) < 300) { x = loot.x - p.x; y = loot.y - p.y; }
            }
          }
          // Repulsion: outrun every chaser; a moving 120 beats a 30 chase.
          let fx = 0, fy = 0, cluster = 0, cx = 0, cy = 0;
          for (const e of b.enemies.values()) {
            if (e === boss && fighting) continue;
            const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
            const threat = e.kind === 'boss' ? 260 : e.kind === 'elite' ? 170 : 120;
            if (d < threat) { fx += dx / d * (threat - d); fy += dy / d * (threat - d); }
            if (d < 200) { cluster++; cx += e.x; cy += e.y; }
          }
          if (cluster >= 3) { const dx = p.x - cx / cluster, dy = p.y - cy / cluster, d = Math.hypot(dx, dy) || 1; fx += dx / d * 60; fy += dy / d * 60; }
          if (boss && !fighting) {
            const d = Math.hypot(p.x - boss.x, p.y - boss.y) || 1;
            if (d < 220) { fx += (p.x - boss.x) / d * 130; fy += (p.y - boss.y) / d * 130; }
          }
          if (Math.hypot(fx, fy) > 30) {
            // Never flee into a boundary: the gate clamp and world walls are where divers die.
            if (fy > 0 && p.y > ceiling - 60) fy = 0;
            if (fy < 0 && p.y < 60) fy = 0;
            if (fx > 0 && p.x > 300) fx = 0;
            if (fx < 0 && p.x < -300) fx = 0;
            if (Math.hypot(fx, fy) < 30) { x = Math.cos(state.angle) * 100; y = Math.sin(state.angle) * 60; }
            else { x = fx; y = fy; }
          }
          // Hurt: climb to weak water immediately; the hold is the dive's real payoff.
          if (p.hp < s.maxHp * (pushing ? .25 : .4)) { y = -100; x = p.x > 0 ? -40 : 40; }
          // LOO-66: <=0m plus 0.35s of held "up" auto-returns the dive. Never aim above the
          // surface (an ellipse whose bottom dips below 0 silently ends every dive).
          if (p.y < 90 && y < 0) { y = 0; if (Math.abs(x) < 40) x = state.angle % 6.283 > 3.14 ? -90 : 90; }
          const norm = Math.hypot(x, y) || 1;
          return { x: x / norm * 200, y: y / norm * 200 };
        };
        for (let frame = 0; frame < 20000; frame++) {
          if (n <= 3) {
            const trace = (window.__trace ??= []);
            if (frame % 150 === 0) {
              const boss = [...s.battle.enemies.values()].find(e => e.kind === 'boss');
              trace.push({ t: Math.round(s.snapshot.activeSeconds), y: Math.round(s.battle.player.y), hp: Math.round(s.battle.player.hp),
                x: Math.round(s.battle.player.x), n: s.battle.enemies.size, boss: boss ? Math.round(Math.hypot(boss.x - s.battle.player.x, boss.y - s.battle.player.y)) : null });
            }
          }
          if (s.state === 'RescuePending') {
            deathsThisDive++;
            decisions.rescueAttempts++;
            if (c.ads.view.rescueRemaining > 0) {
              await c.ads.watch('rescue');
              if (s.state === 'Running') { usedRescue++; decisions.rescueOk++; } // only claims that revived the diver
            }
            if (s.state === 'RescuePending') s.declineRescue();
          }
          if (s.state !== 'Running') break;
          // Oxygen first, return last: the 15% prompt is the real refill eligibility, and the
          // <30% bail-out only fires once the daily refills are gone (or a refill just failed).
          const ratio = s.oxygen / s.oxygenCapacity;
          if (ratio < .15 && c.ads.view.oxygenPrompt && c.ads.view.oxygenRemaining > 0 && !decisions.oxygenFailed) {
            decisions.oxygenAttempts++;
            await c.ads.watch('oxygen');
            if (s.oxygen / s.oxygenCapacity > .9) { usedOxygen++; decisions.oxygenOk++; } else decisions.oxygenFailed++;
          } else if (ratio < .3 && (c.ads.view.oxygenRemaining === 0 || decisions.oxygenFailed)) {
            decisions.returnCause = 'oxygen-exhausted'; s.requestReturn();
          } else if (s.snapshot.cargo.crystal >= s.snapshot.cargoCapacity && !(pushing && feasible && Array.from(s.battle.enemies.values()).some(e => e.kind === 'boss'))) {
            decisions.returnCause = 'cargo-full'; s.requestReturn();
          } else if (s.battle.player.hp < s.maxHp * (pushing ? .18 : .25)) {
            decisions.returnCause = 'hp'; s.requestReturn();
          } else if (s.snapshot.activeSeconds > 540) {
            decisions.returnCause = 'time'; s.requestReturn();
          }
          if (s.state !== 'Running') break;
          if (pushing && feasible && gateAtStart !== null && s.battle.stats.maxDepth >= gateAtStart - 90
            && Array.from(s.battle.enemies.values()).some(e => e.kind === 'boss')) gateAttempted = true;
          const v = steer();
          for (let k = 0; k < 30 && s.state === 'Running'; k++) {
            // 30Hz control: holding one input for a whole fast-forwarded second lets chasers
            // close an 80-unit threat gap, so re-aim every step like real per-frame input.
            s.setInput(v.x, v.y);
            s.advance(1 / 30);
            const nv = steer(); v.x = nv.x; v.y = nv.y;
          }
          if (s.battle.contentProgress.defeatedBosses.includes('enemy_boss_03_giant_squid') && s.battle.stats.maxDepth >= 2399) break;
        }
        const endDiagnostics = { state: s.state, paused: [...s.pause.reasons], oxygen: +s.oxygen.toFixed(1), hp: +s.battle.player.hp.toFixed(1),
          adsBusy: c.ads.view.busy, adsPending: c.ads.view.rewardPending, diveId: s.diveId,
          depthNow: Math.floor(s.battle.player.y), maxDepth: Math.floor(s.battle.stats.maxDepth), surfaceHold: s.surfaceHold,
          hasSubmerged: s.hasSubmerged, manualUp: s.manualUp, movementMode: s.battle.movementMode,
          cargoCrystal: s.snapshot.cargo.crystal, cargoCap: s.snapshot.cargoCapacity,
          floorLoot: Array.from(s.battle.loot.values()).reduce((a, l) => a + l.value, 0), floorLootCount: s.battle.loot.size };
        s.setInput(0, 0);
        const finished = { kills: s.battle.stats.kills, seconds: s.snapshot.activeSeconds, depth: Math.floor(s.battle.stats.maxDepth), bosses: Array.from(s.battle.contentProgress.defeatedBosses) };
        if (s.state === 'Running') s.requestReturn();
        if (s.state === 'RescuePending') s.declineRescue();
        if (s.state === 'Returning') s.arriveHarbor();
        let settled = false;
        if (s.state === 'PendingSettlement') { try { c.dives.settle(s); settled = true; } catch { settled = false; } }
        // The disabled controller never painted the dive; draw the settled overlay so the
        // real primary-touch button actually receives the click.
        c.hud.render(s, '', c.ads.view, c.economy.snapshot);
        const wallet = c.economy.snapshot.wallet;
        gateKills = s.battle.contentProgress.defeatedBosses.length - bossesBefore;
        return { finished, wallet, settled, usedRescue, usedOxygen, deaths: deathsThisDive, reason: s.settlement?.reason,
          decisions, strategy: window.__strategy || 'push', feasible, survivable, gateAttempted, gateKills, gateAtStart, endDiagnostics,
          start: startState, income: (BigInt(wallet.crystal) - startCrystal).toString(),
          depthPerSecond: +(finished.depth / Math.max(1, finished.seconds)).toFixed(2),
          finalAttributes: { ...c.economy.snapshot.attributes }, finalLevel: c.economy.snapshot.playerLevel,
          trace: n <= 3 ? (window.__trace ?? []).splice(0) : undefined,
          pearlGain: (BigInt(wallet.pearl) - startPearls).toString() };
      }, { n, techEffects: Object.fromEntries(balance.tech.nodes.map(node => [node.id, node.effect])), sunlight: SUNLIGHT });
      deaths += record.deaths;
      rescues += record.usedRescue; oxygenAds += record.usedOxygen;
      pearlIncome += Number(record.pearlGain || 0);
      if (record.finished.bosses.includes('enemy_boss_03_giant_squid') && record.finished.depth >= 2399) {
        record.spent = '0'; reached2400 = true; dives.push({ n, ...record }); break;
      }
      // Return to harbor through the real Settled entry, then spend through the real services.
      await click(page, 'primary-touch'); await harborReady(page);
      if (await page.evaluate(() => window.h.view.panel === 'poster')) await click(page, 'close');
      record.spent = await spend(page, n);
      dives.push({ n, ...record });
      await click(page, 'LaunchButton'); await diveReady(page);
    }
    const final = await page.evaluate(() => {
      const state = window.c.economy.snapshot;
      return { wallet: state.wallet, attributes: state.attributes, tech: state.tech, playerLevel: state.playerLevel,
        record: state.objectives.record, bosses: state.objectives.dives, milestones: state.objectives.milestones.length };
    });
    await page.screenshot({ path: `${artifacts}/final-${target}.png` });
    await writeFile(`${artifacts}/progression-${target}.json`, JSON.stringify({
      commit, run: { startedAt: runStartedAt, finishedAt: new Date().toISOString(), wallSeconds: (Date.now() - runStartedAtMs) / 1000, target, maxDives: MAX_DIVES },
      config: { attributes: balance.attributes, drops: balance.drops, adsSlots: balance.ads.slots, adsUnlockLevel: balance.ads.unlockLevel,
        sunlight: SUNLIGHT, enemyTuning: { baseHp: 50, hpGrowth: 1.18, baseAttack: 8, attackGrowth: 1.12, bossHpMultiplier: 40, bossAttackMultiplier: 4 },
        spawnIntervalTicks: 24, contactIframeTicks: 45, cargoBase: balance.attributes.baseValues[4] },
      tutorial, dives, final, deaths, rescues, oxygenAds, pearlIncome, reached2400, errors }, null, 2));
    assert.equal(reached2400, true, `natural progression must reach 2400m within ${MAX_DIVES} dives`);
    assert.ok(final.record.depth >= 2399, `depth record ${final.record?.depth}`);
    assert.ok(dives.every(d => d.settled), 'every dive must settle through the real economy');
    assert.deepEqual(errors, []);
  });
});

/** Spend through the exact dispatch actions the harbor UI buttons emit, greedily buying the
 *  best %-per-crystal option across attributes and tech (tech also needs cores from elites). */
async function spend(page, dive) {
  return page.evaluate(async ({ techNodes, dive }) => {
    const h = window.h, wallet = () => BigInt(h.economy.snapshot.wallet.crystal);
    const before = wallet();
    const RESERVE = 60n; // keep one attribute level affordable for the next dive
    const options = () => {
      const s = h.economy.snapshot, list = [];
      const spec = { attack: 5, attackSpeed: 1, hp: 5, oxygen: 1, cargo: 5, moveSpeed: 1 };
      for (const [attribute, gain] of Object.entries(spec)) {
        const level = s.attributes[attribute];
        const cost = BigInt(Math.ceil(80 * Math.pow(1.16, level)));
        list.push({ kind: 'attribute.upgrade', attribute, level, gain, cost });
      }
      const cores = BigInt(s.wallet.core);
      // One next node per tree: chains gate each other, five trees run in parallel.
      const trees = new Set();
      for (const node of techNodes) {
        if (trees.has(node.tree) || s.tech.includes(node.id) || !node.requires.every(r => s.tech.includes(r))) continue;
        trees.add(node.tree);
        list.push({ kind: 'tech.unlock', nodeId: node.id, gain: node.effect * 100, cost: BigInt(node.crystal), core: BigInt(node.core), cores });
      }
      return list.filter(o => o.cost > 0n);
    };
    for (let guard = 0; guard < 400; guard++) {
      const affordable = options()
        .filter(o => o.cost <= wallet() - RESERVE && wallet() >= o.cost)
        .filter(o => !o.core || o.cores >= o.core)
        // A progression-minded player buys what unblocks the next gate: damage first, then
        // oxygen window (attribute + the oxygen tech tree), then survivability.
        .map(o => ({ ...o, ratio: Number(o.gain) / Number(o.cost)
          * (o.kind === 'attribute.upgrade' && o.attribute === 'attack' && o.level < 24 ? 2.5 : 1)
          * (o.kind === 'attribute.upgrade' && o.attribute === 'oxygen' ? 1.5 : 1)
          * (o.kind === 'tech.unlock' && o.nodeId.startsWith('oxygen.') ? 2 : 1) }))
        .sort((a, b) => b.ratio - a.ratio);
      const pick = affordable[0];
      if (!pick) break;
      const tag = pick.kind === 'attribute.upgrade' ? `${pick.attribute}-${pick.level}` : pick.nodeId;
      try { h.economy.dispatch({ type: pick.kind, attribute: pick.attribute, nodeId: pick.nodeId, opId: `progression-${dive}-${pick.kind}-${tag}` }); }
      catch { break; }
    }
    // Pearl boxes when a draw is finally affordable (bosses pay 2 pearls each).
    if (BigInt(h.economy.snapshot.wallet.pearl) >= 50n && h.economy.snapshot.inventory.length + 1 <= 200) {
      try { h.economy.dispatch({ type: 'box.draw', box: 'silver', count: 1, opId: `progression-${dive}-box` }); } catch {}
    }
    // Equip box weapons, one distinct item per slot.
    const weapons = ['sonic', 'torpedo', 'arc', 'mine'];
    const used = new Set();
    for (const slot of [0, 1]) {
      const best = h.economy.snapshot.inventory
        .filter(i => weapons.includes(i.template) && !i.equipped && !used.has(i.id))
        .sort((a, b) => b.quality - a.quality || b.level - a.level)[0];
      if (!best) break;
      try {
        h.economy.dispatch({ type: 'equipment.equip', itemId: best.id, slot, opId: `progression-${dive}-equip-${slot}-${best.id}` });
        used.add(best.id);
      } catch {}
    }
    return (wallet() - before).toString();
  }, { techNodes: balance.tech.nodes, dive });
}
