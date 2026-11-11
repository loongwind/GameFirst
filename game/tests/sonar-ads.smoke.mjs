import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withBrowser, enterBuiltScene } from './browser-helpers.mjs';
const target = process.env.WEB_TARGET || 'web-debug';
const root = fileURLToPath(new URL(`../build/${target}`, import.meta.url));
const artifacts = fileURLToPath(new URL('../.artifacts/sonar-ads/', import.meta.url));

test(`${target}: actual Cocos sonar, oxygen/rescue buttons, pause overlaps and harbor loop`, { timeout: 120000 }, async () => {
  await withBrowser(root, async (page, _browser, url) => {
    const errors = [], evidence = [];
    page.on('pageerror', e => { errors.push(e.message); console.error(e.message); }); page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); console.error(m.text()); } });
    const boot = page.waitForEvent('console', { predicate: m => m.text().startsWith('[Boot] ready'), timeout: 30000 });
    await page.goto(url); await boot; await mkdir(artifacts, { recursive: true });
    await page.evaluate(async () => {
      window.cc = await System.import('cc');
      // This driver exists only in the test graph, never in Cocos release assets.
      window.testDriver = { isMock: true, shows: 0, outcome: 'completed', fail: false, hold: false,
        async load() { if (this.fail) throw new Error('no fill'); }, async show() { this.shows++; return this.hold ? new Promise(resolve => { this.close = resolve; }) : this.outcome; } };
    });
    const click = async name => {
      await page.waitForFunction(name => { const find = n => n.name === name && n.activeInHierarchy || n.children.some(find); return !!window.cc && find(window.cc.director.getScene()); }, name);
      const p = await page.evaluate(name => {
        const { director, UITransform, Vec3, view } = window.cc;
        const find = n => n.name === name && n.activeInHierarchy ? n : n.children.map(find).find(Boolean);
        const n = find(director.getScene()); if (!n) throw new Error(`Missing active ${name}`);
        const t = n.getComponent(UITransform), p = t.convertToWorldSpaceAR(new Vec3((.5 - t.anchorX) * t.width, (.5 - t.anchorY) * t.height));
        const canvas = document.querySelector('canvas').getBoundingClientRect(), size = view.getVisibleSize();
        return { x: canvas.left + p.x / size.width * canvas.width, y: canvas.top + (1 - p.y / size.height) * canvas.height };
      }, name);
      await page.mouse.click(p.x, p.y); await page.waitForTimeout(100);
    };
    const shot = async name => page.screenshot({ path: `${artifacts}/${name}-${target}.png` });
    const read = () => page.evaluate(() => { const c = window.c; return { ...c.session.snapshot, x: c.session.battle.player.x, y: c.session.battle.player.y, tick: c.session.battle.tick, mode: c.session.battle.movementMode, ads: c.ads.view, notice: c.ads.notice, stateSave: c.economy.snapshot, shows: window.testDriver.shows }; });
    await enterBuiltScene(page, 'Harbor');
    await page.waitForFunction(() => window.cc.director.getScene()?.name === 'Harbor');
    await page.evaluate(() => { window.h = window.cc.director.getScene().getChildByName('Canvas').getComponent('HarborController'); });
    await page.waitForFunction(() => !!window.h.view);
    await page.evaluate(() => {
      const c = window.h; c.economy.dispatch({ type: 'dive.settle', opId: 'sonar-seed', settlement: { diveId: 'sonar-seed', reason: 'return', cargo: { crystal: 0, pearl: 0, marrow: 0, core: 0 }, xp: 10000, activeSeconds: 0, depth: 0 } });
      c.configureAds(window.testDriver); c.view.update();
    });
    await click('supply');
    await page.evaluate(()=>window.h.view.open('supply',2));
    await click('ad-sonar');
    const expiry = await page.evaluate(() => window.h.economy.snapshot.buffs.sonarUntil);
    assert.ok(expiry > Date.now() + 890000); await shot('harbor-sonar');
    await click('close'); await click('LaunchButton');
    await page.waitForFunction(() => window.cc.director.getScene()?.name === 'Dive');
    await page.evaluate(() => { window.c = window.cc.director.getScene().getChildByName('Canvas').getComponent('DiveController'); window.c.configureAds(window.testDriver); });
    await page.waitForFunction(() => window.c.hud.sea.status === 'ready' && !window.c.session.pause.has('assets'));
    const initial = await read(); await page.waitForTimeout(250); let s = await read(); assert.ok(s.y !== initial.y || s.x !== initial.x); assert.equal(s.ads.sonarSeconds > 0, true);
    await page.evaluate(() => { const b = window.c.session.battle; b.enemies.clear(); b.loot.clear(); b.player.x = 0; b.player.y = 180; b.addLoot(160, 180, 10); });
    await page.waitForTimeout(650); s = await read(); assert.ok(Math.hypot(s.x - 70, s.y - 180) >= 46); await shot('obstacle-steering');
    const stick = await page.evaluate(() => window.c.hud.layout.joystick);
    await page.mouse.move(stick.x + 7, stick.y + 56); await page.mouse.down(); await page.waitForTimeout(120);
    assert.equal((await read()).mode, 'manual'); await shot('manual-takeover'); await page.mouse.up();
    await page.evaluate(() => { const c = window.c; c.session.hide(); c.session.pause.add('ad'); c.economy.now = () => Date.now() + 900001; c.ads.now = () => Date.now() + 900001; });
    const frozen = await read(); await page.waitForTimeout(150); s = await read(); assert.equal(s.oxygen, frozen.oxygen); assert.equal(s.ads.sonarSeconds, 0);
    await shot('expired-background');
    await page.evaluate(() => { const s = window.c.session; s.pause.remove('ad'); s.show(); }); await page.waitForTimeout(3300);
    const after = await read(); await page.waitForTimeout(120); s = await read(); assert.equal(s.x, after.x); assert.equal(s.y, after.y);
    evidence.push({ scenario: 'absolute expiry in stacked pauses', frozen, expired: s });
    // Unavailable and failed video must leave the low-O2 card and manual actions usable.
    await page.evaluate(() => { const c = window.c; c.configureAds(undefined); c.session.oxygen = c.session.oxygenCapacity * .14; }); await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => window.c.hud.labels.get('oxygen')?.string), '观看 · 氧气回满');
    await click('oxygen-touch'); s = await read(); assert.equal(s.ads.rewardPending, false); assert.deepEqual(s.pauseReasons, []); assert.match(s.notice, /失败/);
    await shot('oxygen-no-driver');
    await page.evaluate(() => { window.c.configureAds(window.testDriver); window.testDriver.fail = true; });
    await click('oxygen-touch'); assert.match((await read()).notice, /失败/);
    await page.evaluate(() => {
      window.testDriver.fail = false; window.baseShow = window.testDriver.show; window.savedWrite = window.c.platform.storage.setItem;
      window.testDriver.show = async function () { const result = await window.baseShow.call(this); window.c.platform.storage.setItem = () => { throw new Error('quota'); }; return result; };
    });
    await click('oxygen-touch'); s = await read(); assert.equal(s.ads.rewardPending, true); const showsBeforeRetry = s.shows; await shot('reward-pending');
    await page.evaluate(() => { window.c.platform.storage.setItem = window.savedWrite; window.testDriver.show = window.baseShow; });
    await click('primary-touch'); assert.equal((await read()).shows, showsBeforeRetry);
    s = await read(); assert.ok(s.oxygen > s.oxygenCapacity * .98); assert.equal(s.ads.oxygenRemaining, 2);
    // The same actual button plays a deferred video; background and video pauses compose.
    await page.evaluate(() => { window.c.session.oxygen = window.c.session.oxygenCapacity * .14; window.testDriver.hold = true; }); await page.waitForTimeout(80); await click('oxygen-touch');
    await page.waitForFunction(() => !!window.testDriver.close);
    await page.evaluate(() => { const c = window.c; c.onConnectionLost(); c.session.disconnectedAt -= 31001; c.onConnectionRestored(); });
    assert.equal((await read()).state, 'Running', 'a showing ad must keep its event across reconnect');
    await page.evaluate(() => window.c.onHide()); const during = await read(); await page.waitForTimeout(150); assert.equal((await read()).tick, during.tick);
    await page.evaluate(() => { window.testDriver.hold = false; window.testDriver.close('completed'); }); await page.waitForTimeout(100);
    assert.ok((await read()).pauseReasons.includes('background')); assert.equal((await read()).ads.oxygenRemaining, 1);
    await page.evaluate(() => window.c.onShow()); await page.waitForTimeout(3300);
    await page.evaluate(() => { window.c.session.oxygen = window.c.session.oxygenCapacity * .14; }); await page.waitForTimeout(80); await click('oxygen-touch');
    assert.equal((await read()).ads.oxygenRemaining, 0);
    await page.evaluate(() => { window.c.session.oxygen = window.c.session.oxygenCapacity * .14; }); await page.waitForTimeout(80);
    for (const height of [667, 750, 812]) { await page.setViewportSize({ width: 375, height }); await page.waitForTimeout(100); await shot(`oxygen-limit-${height}`); }
    s = await read(); assert.equal(s.ads.oxygenPrompt, true); await click('dismissOxygen-touch'); assert.equal((await read()).ads.oxygenPrompt, false); assert.deepEqual((await read()).pauseReasons, []);
    // Refresh preserves the closed prompt and exact active dive; restore uses the normal countdown.
    const diveId = s.diveId;
    const reboot = page.waitForEvent('console', { predicate: m => m.text().startsWith('[Boot] ready'), timeout: 30000 });
    await page.reload(); await reboot; await enterBuiltScene(page, 'Dive');
    await page.evaluate(() => {
      window.c = window.cc.director.getScene().getChildByName('Canvas').getComponent('DiveController');
      window.testDriver = { isMock: true, shows: 0, outcome: 'completed', async load() {}, async show() { this.shows++; return this.outcome; } }; window.c.configureAds(window.testDriver);
    }); await page.waitForTimeout(3300);
    assert.equal((await read()).diveId, diveId); assert.equal((await read()).ads.oxygenPrompt, false);
    // Death freezes before choice; skip retains it, rescue keeps cargo and half HP, daily three is durable.
    await page.evaluate(() => { const s = window.c.session; s.cargo.crystal = 0; s.collect('crystal', 70); s.collect('pearl', 2); s.battle.player.hp = 0; window.testDriver.outcome = 'skipped'; }); await page.waitForTimeout(100);
    assert.equal((await read()).state, 'RescuePending'); await click('primary-touch'); assert.equal((await read()).state, 'RescuePending'); await shot('rescue-skipped');
    await page.evaluate(() => { window.testDriver.outcome = 'completed'; }); await click('primary-touch');
    s = await read(); assert.equal(s.state, 'Running'); assert.equal(s.hp, s.maxHp * .5); assert.equal(s.cargo.crystal, 70); assert.equal(s.diveId, diveId);
    for (let i = 0; i < 2; i++) { await page.evaluate(() => { window.c.session.battle.player.hp = 0; }); await page.waitForTimeout(80); await click('primary-touch'); }
    assert.equal((await read()).ads.rescueRemaining, 0);
    await page.evaluate(() => { window.c.session.battle.player.hp = 0; }); await page.waitForTimeout(80); await shot('rescue-limit');
    await click('secondary-touch'); await page.waitForFunction(() => window.c.session.state === 'Settled');
    s = await read(); assert.equal(s.cargo.crystal, 0); assert.equal(s.cargo.pearl, 2); evidence.push({ scenario: 'three rescue/oxygen rewards and decline', result: s });
    await click('primary-touch'); await page.waitForFunction(() => window.cc.director.getScene()?.name === 'Harbor');
    await page.evaluate(() => { window.h = window.cc.director.getScene().getChildByName('Canvas').getComponent('HarborController'); }); await page.waitForFunction(() => !!window.h.view);
    assert.equal(await page.evaluate(() => window.h.economy.snapshot.activeDive), null); await shot('return-harbor');
    assert.deepEqual(errors, []); await writeFile(`${artifacts}/result-${target}.json`, JSON.stringify({ evidence, errors }, null, 2));
  }, { navigate: false });
});
