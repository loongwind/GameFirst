import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { withBrowser } from './browser-helpers.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('local depth poster draws a 750x1100 PNG and saves it through the browser platform without network', async () => {
  await withBrowser(root, async page => {
    const result = await page.evaluate(async () => {
      const { BrowserPlatformAdapter } = await import('/assets/scripts/platform/browser/BrowserPlatformAdapter.ts');
      const { drawDepthPoster } = await import('/assets/scripts/platform/browser/DepthPoster.ts');
      const canvas = drawDepthPoster(document, { depth: 1523, diveId: 'poster', encounters: ['enemy_normal_01_moon_jelly', 'enemy_elite_04_royal_jelly'] });
      const ctx = canvas.getContext('2d');
      const pixels = [ctx.getImageData(375, 50, 1, 1).data[0], ctx.getImageData(375, 1000, 1, 1).data[0]];
      let clicked = false;
      const oldClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { clicked = this.download === 'abyss-depth-1523.png' && this.href.startsWith('blob:'); };
      try { const a = new BrowserPlatformAdapter(); const saved = await a.saveDepthPoster({ depth: 1523, diveId: 'poster', encounters: ['enemy_normal_01_moon_jelly'] }); a.dispose(); return { width: canvas.width, height: canvas.height, png: canvas.toDataURL().startsWith('data:image/png'), clicked, saved, pixels }; }
      finally { HTMLAnchorElement.prototype.click = oldClick; }
    });
    assert.equal(result.width, 750); assert.equal(result.height, 1100); assert.equal(result.png, true);
    assert.equal(result.clicked, true); assert.equal(result.saved.filename, 'abyss-depth-1523.png');
    assert.notEqual(result.pixels[0], result.pixels[1]);
  });
});

test('storage survives reload, namespaces keys, and preserves unrelated data', async () => {
  await withBrowser(root, async page => {
    await page.evaluate(async () => {
      const { BrowserPlatformAdapter } = await import('/assets/scripts/platform/browser/BrowserPlatformAdapter.ts');
      const adapter = new BrowserPlatformAdapter();
      localStorage.setItem('other-product', 'kept');
      adapter.storage.setItem('slot', '{"revision":7}');
    });
    await page.reload();
    const result = await page.evaluate(async () => {
      const { BrowserPlatformAdapter } = await import('/assets/scripts/platform/browser/BrowserPlatformAdapter.ts');
      const adapter = new BrowserPlatformAdapter();
      const saved = adapter.storage.getItem('slot');
      adapter.storage.removeItem('slot');
      const removed = adapter.storage.getItem('slot');
      const unrelated = localStorage.getItem('other-product');
      return { saved, removed, unrelated, isMock: adapter.isMock };
    });
    assert.deepEqual(result, { saved: '{"revision":7}', removed: null, unrelated: 'kept', isMock: false });
  });
});

test('foreground changes are deduplicated and listeners can unsubscribe', async () => {
  await withBrowser(root, async page => {
    const events = await page.evaluate(async () => {
      const { BrowserPlatformAdapter } = await import('/assets/scripts/platform/browser/BrowserPlatformAdapter.ts');
      const adapter = new BrowserPlatformAdapter();
      const events = [];
      const offHide = adapter.onHide(() => events.push('hide'));
      const offShow = adapter.onShow(() => events.push('show'));
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
      window.dispatchEvent(new PageTransitionEvent('pageshow'));
      window.dispatchEvent(new PageTransitionEvent('pageshow'));
      offHide(); offShow();
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
      adapter.dispose();
      return events;
    });
    assert.deepEqual(events, ['hide', 'show']);
  });
});

test('device information follows viewport changes and reports pixel ratio', async () => {
  await withBrowser(root, async page => {
    const read = () => page.evaluate(async () => {
      const { BrowserPlatformAdapter } = await import('/assets/scripts/platform/browser/BrowserPlatformAdapter.ts');
      const adapter = new BrowserPlatformAdapter();
      try { return adapter.getDeviceInfo(); } finally { adapter.dispose(); }
    });
    const initial = await read();
    assert.equal(initial.windowWidth, 375);
    assert.equal(initial.windowHeight, 812);
    assert.equal(initial.pixelRatio, 2);
    await page.setViewportSize({ width: 812, height: 375 });
    const rotated = await read();
    assert.equal(rotated.windowWidth, 812);
    assert.equal(rotated.windowHeight, 375);
  });
});

test('blocked storage propagates failure rather than reporting a successful save', async () => {
  await withBrowser(root, async page => {
    const result = await page.evaluate(async () => {
      const { BrowserPlatformAdapter } = await import('/assets/scripts/platform/browser/BrowserPlatformAdapter.ts');
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
      try {
        const adapter = new BrowserPlatformAdapter();
        try { adapter.storage.setItem('slot', 'value'); } finally { adapter.dispose(); }
        return 'unexpected-success';
      } catch (error) { return error.name; }
    });
    assert.equal(result, 'SecurityError');
  });
});

test('browser safe area honors CSS environment insets used by the fullscreen game shell', async () => {
  await withBrowser(root, async page => {
    const safe = await page.evaluate(async () => {
      const { BrowserPlatformAdapter } = await import('/assets/scripts/platform/browser/BrowserPlatformAdapter.ts');
      const style = document.documentElement.style;
      style.setProperty('--safe-top', '44px'); style.setProperty('--safe-bottom', '34px');
      style.setProperty('--safe-left', '6px'); style.setProperty('--safe-right', '8px');
      const adapter = new BrowserPlatformAdapter();
      try { return adapter.getDeviceInfo().safeArea; } finally { adapter.dispose(); }
    });
    assert.deepEqual(safe, { left: 6, top: 44, width: 361, height: 734 });
  });
});
