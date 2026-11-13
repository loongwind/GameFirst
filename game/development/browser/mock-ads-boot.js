/** Development-only rewarded-ad driver and boot wiring for the playtest entry.
 *  Lives outside assets/ and shared/ so the release guard and release builds never see it.
 *  Eligibility, daily caps, tokens and payouts still run through the real AdService. */
(function () {
  'use strict';
  const driver = {
    isMock: true,
    shows: 0,
    async load() {},
    async show() { this.shows++; return 'completed'; },
  };
  const wired = new WeakSet();
  const label = () => {
    let tag = document.getElementById('dev-mock-badge');
    if (!tag) {
      tag = document.createElement('div');
      tag.id = 'dev-mock-badge';
      tag.textContent = '开发Mock广告已接入';
      tag.style.cssText = 'position:fixed;top:2px;right:4px;z-index:9999;font:10px sans-serif;color:#fff;background:rgba(200,80,40,.75);padding:1px 6px;border-radius:4px;pointer-events:none;';
      document.body.appendChild(tag);
    }
  };
  const tick = () => {
    try {
      if (!window.cc || !window.cc.director) return;
      const scene = window.cc.director.getScene();
      const canvas = scene && scene.getChildByName('Canvas');
      const controller = canvas && (canvas.getComponent('DiveController') || canvas.getComponent('HarborController'));
      if (controller && controller.configureAds && !wired.has(controller)) {
        controller.configureAds(driver);
        wired.add(controller);
        console.info('[dev-mock] 开发Mock广告驱动已接入（真实资格/每日次数/token重试不受影响）');
        label();
      }
    } catch (error) { /* scene mid-load; retry next tick */ }
  };
  setInterval(tick, 400);
  tick();
})();
