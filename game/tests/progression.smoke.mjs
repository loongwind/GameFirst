import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withBrowser } from './browser-helpers.mjs';

const target = process.env.WEB_TARGET || 'web-release';
const root = fileURLToPath(new URL(`../build/${target}`, import.meta.url));
const artifacts = fileURLToPath(new URL('../.artifacts/progression/', import.meta.url));
const balance = JSON.parse(await readFile(fileURLToPath(new URL('../../shared/config/balance.json', import.meta.url)), 'utf8'));
const MAX_DIVES = Number(process.env.PROGRESS_MAX_DIVES || 60);

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
    await click(page, 'tutorial-next');
    await click(page, 'upgrade-cargo');
    await page.waitForFunction(() => window.h.economy.snapshot.attributes.cargo === 1);
    await click(page, 'close'); await click(page, 'tutorial-next');
    await diveReady(page);
    assert.equal(await page.evaluate(() => window.c.economy.snapshot.objectives.tutorial.completed), true);

    // --- Natural dive loop: real sessions, real economy, real ads; only wall-clock is compressed ---
    const dives = [];
    let reached2400 = false, deaths = 0, rescues = 0, oxygenAds = 0, pearlIncome = 0;
    for (let n = 1; n <= MAX_DIVES && !reached2400; n++) {
      const record = await page.evaluate(async () => {
        const c = window.c, s = c.session;
        c.enabled = false;
        c.configureAds(window.testDriver);
        const startPearls = BigInt(c.economy.snapshot.wallet.pearl);
        let usedRescue = 0, usedOxygen = 0;
        const steer = () => {
          const b = s.battle, p = b.player, gate = s.content.gateDepth ?? 2400;
          const target = Math.min(gate, 2400);
          const enemies = [...b.enemies.values()].map(e => ({ e, d: Math.hypot(e.x - p.x, e.y - p.y) })).sort((a, b) => a.d - b.d);
          const nearest = enemies[0];
          let x = 0, y = p.y < target ? 60 : -60;
          if (nearest && nearest.d < 110) { x = p.x - nearest.e.x; y = p.y - nearest.e.y + (p.y < target ? 30 : -30); }
          if (p.x > 300) x = -120; if (p.x < -300) x = 120;
          const norm = Math.hypot(x, y) || 1;
          return { x: x / norm * 200, y: y / norm * 200 };
        };
        for (let frame = 0; frame < 20000; frame++) {
          if (s.state === 'RescuePending') {
            if (c.ads.view.rescueRemaining > 0) { await c.ads.watch('rescue'); usedRescue++; }
            else { s.declineRescue(); }
          }
          if (s.state !== 'Running') break;
          if (s.oxygen / s.oxygenCapacity < .15 && c.ads.view.oxygenPrompt && c.ads.view.oxygenRemaining > 0) {
            await c.ads.watch('oxygen'); usedOxygen++;
          } else if (s.oxygen / s.oxygenCapacity < .22 || s.snapshot.cargo.crystal >= s.snapshot.cargoCapacity || s.snapshot.activeSeconds > 540) {
            s.requestReturn();
          }
          if (s.state !== 'Running') break;
          const v = steer(); s.setInput(v.x, v.y);
          for (let k = 0; k < 10 && s.state === 'Running'; k++) s.advance(.1);
          if (s.battle.contentProgress.defeatedBosses.includes('enemy_boss_03_giant_squid') && s.battle.stats.maxDepth >= 2399) break;
        }
        s.setInput(0, 0);
        const finished = { kills: s.battle.stats.kills, seconds: s.snapshot.activeSeconds, depth: Math.floor(s.battle.stats.maxDepth), bosses: Array.from(s.battle.contentProgress.defeatedBosses) };
        if (s.state === 'Running') s.requestReturn();
        if (s.state === 'RescuePending') s.declineRescue();
        if (s.state === 'Returning') s.arriveHarbor();
        let settled = false;
        if (s.state === 'PendingSettlement') { try { c.dives.settle(s); settled = true; } catch { settled = false; } }
        const wallet = c.economy.snapshot.wallet;
        return { finished, wallet, settled, usedRescue, usedOxygen, reason: s.settlement?.reason,
          pearlGain: (BigInt(wallet.pearl) - startPearls).toString() };
      });
      dives.push({ n, ...record });
      deaths += record.usedRescue + (record.reason === 'death' ? 1 : 0);
      rescues += record.usedRescue; oxygenAds += record.usedOxygen;
      pearlIncome += Number(record.pearlGain || 0);
      if (record.finished.bosses.includes('enemy_boss_03_giant_squid') && record.finished.depth >= 2399) { reached2400 = true; break; }
      // Return to harbor through the real Settled entry, then spend through the real services.
      await click(page, 'primary-touch'); await harborReady(page);
      if (await page.evaluate(() => window.h.view.panel === 'poster')) await click(page, 'close');
      await spend(page, n);
      await click(page, 'LaunchButton'); await diveReady(page);
    }
    const final = await page.evaluate(() => {
      const state = window.c.economy.snapshot;
      return { wallet: state.wallet, attributes: state.attributes, tech: state.tech, playerLevel: state.playerLevel,
        record: state.objectives.record, bosses: state.objectives.dives, milestones: state.objectives.milestones.length };
    });
    await page.screenshot({ path: `${artifacts}/final-${target}.png` });
    await writeFile(`${artifacts}/progression-${target}.json`, JSON.stringify({ tutorial, dives, final, deaths, rescues, oxygenAds, pearlIncome, reached2400, errors }, null, 2));
    assert.equal(reached2400, true, `natural progression must reach 2400m within ${MAX_DIVES} dives`);
    assert.ok(final.record.depth >= 2399, `depth record ${final.record?.depth}`);
    assert.ok(dives.every(d => d.settled), 'every dive must settle through the real economy');
    assert.deepEqual(errors, []);
  });
});

/** Spend through the exact dispatch actions the harbor UI buttons emit. */
async function spend(page, dive) {
  await page.evaluate(async (techNodes, dive) => {
    const h = window.h;
    const crystal = () => BigInt(h.economy.snapshot.wallet.crystal);
    // Attack first (damage gates every depth band), then HP, then utility; each line keeps its reserve share.
    for (const [attribute, share] of [['attack', 65], ['hp', 35], ['moveSpeed', 20], ['oxygen', 20], ['attackSpeed', 20]]) {
      for (let guard = 0; guard < 200; guard++) {
        const level = h.economy.snapshot.attributes[attribute], price = BigInt(Math.ceil(80 * Math.pow(1.16, level)));
        if (price > crystal() * BigInt(share) / 100n) break;
        try { h.economy.dispatch({ type: 'attribute.upgrade', attribute, opId: `progression-${dive}-attr-${attribute}-${level}` }); }
        catch { break; }
      }
    }
    // Tech: cheapest enabled nodes in balance order, capped at a quarter of the wallet.
    const unlocked = new Set(h.economy.snapshot.tech);
    for (const node of techNodes) {
      if (unlocked.has(node.id) || !node.requires.every(r => unlocked.has(r))) continue;
      if (BigInt(node.crystal) > crystal() / 4n) continue;
      try { h.economy.dispatch({ type: 'tech.unlock', nodeId: node.id, opId: `progression-${dive}-tech-${node.id}` }); unlocked.add(node.id); }
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
  }, balance.tech.nodes, dive);
}
