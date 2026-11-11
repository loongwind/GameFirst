/** @development-only Static preview viewing driver. All rewards belong to AdService. */
(function () {
  'use strict';
  const wired = new WeakSet();
  let cc, current, active, loadAttempts = 0;
  const failure = new URLSearchParams(location.search).get('previewAdFailure');
  function overlay(loading) {
    const element = document.createElement('section');
    element.className = 'preview-ad-overlay';
    element.setAttribute('role', 'dialog'); element.setAttribute('aria-modal', 'true');
    element.setAttribute('aria-label', '模拟广告（演示）');
    element.innerHTML = '<div class="preview-ad-card"><h1>模拟广告（演示）</h1><div class="preview-ad-countdown" aria-live="polite"></div><p>演示用模拟广告，不产生真实广告收入</p><p class="preview-ad-status"></p></div>';
    element.querySelector('.preview-ad-status').textContent = loading ? '正在加载演示内容…' : '观看完成后，由游戏确认奖励';
    document.body.appendChild(element);
    return element;
  }
  function operation(loading) {
    if (active) return Promise.reject(new Error('PREVIEW_AD_BUSY'));
    return new Promise((resolve, reject) => {
      const owner = current, element = overlay(loading), previousFocus = document.activeElement;
      let timer, last = performance.now(), elapsed = 0, done = false;
      const close = (result, error) => {
        if (done) return; done = true;
        clearInterval(timer); element.remove(); active = undefined;
        if (previousFocus?.isConnected) previousFocus.focus?.();
        error ? reject(error) : resolve(result);
      };
      active = { owner, close };
      if (!loading) {
        const skip = document.createElement('button'); skip.textContent = '跳过 · 不领取奖励';
        skip.id = 'preview-ad-skip'; skip.onclick = () => close('skipped');
        element.querySelector('.preview-ad-card').appendChild(skip); skip.focus();
        element.addEventListener('keydown', event => { if (event.key === 'Tab') { event.preventDefault(); skip.focus(); } });
      }
      const counter = element.querySelector('.preview-ad-countdown');
      counter.textContent = loading ? '···' : '3';
      timer = setInterval(() => {
        const now = performance.now();
        // Hidden tabs never complete an ad in the background.
        if (!document.hidden) elapsed += Math.min(now - last, 200);
        last = now;
        if (loading && elapsed >= 350) {
          loadAttempts++;
          const failed = failure === 'always' || failure === 'once' && loadAttempts === 1;
          close(undefined, failed ? new Error('PREVIEW_AD_LOAD_FAILED') : undefined);
        } else if (!loading) {
          counter.textContent = String(Math.max(0, Math.ceil((3000 - elapsed) / 1000)));
          if (elapsed >= 3000) close('completed');
        }
      }, 50);
    });
  }
  const driver = { isMock: true, load: () => operation(true), show: () => operation(false) };
  async function tick() {
    try {
      if (!cc) { if (typeof System === 'undefined') return; cc = await System.import('cc'); }
      const canvas = cc.director.getScene()?.getChildByName('Canvas');
      current = canvas?.getComponent('DiveController') || canvas?.getComponent('HarborController');
      if (active && active.owner !== current) active.close('skipped');
      if (current?.configureAds && current.economy && !wired.has(current)) {
        current.configureAds(driver); wired.add(current);
      }
    } catch (error) { console.warn('[preview-ads] Waiting for scene:', error.message); }
  }
  const interval = setInterval(tick, 100); tick();
  window.addEventListener('pagehide', () => { active?.close('skipped'); clearInterval(interval); });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
})();
