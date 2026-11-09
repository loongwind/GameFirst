// 原型关键经济与风险决策测试；不涉及真实广告或云服务。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createState, dispatch, tick } = require('../shared/model.js');
test('卸货只入账一次', () => {
  const s = createState(); const before = s.bank; s.cargo = 420;
  dispatch(s, 'ascend'); dispatch(s, 'unload'); dispatch(s, 'unload');
  assert.equal(s.bank, before + 420); assert.equal(s.cargo, 0);
});
test('离线卸货保留待确认收益，重连仅确认一次', () => {
  const s = createState(); const before = s.bank; s.cargo = 200; s.online = false;
  dispatch(s, 'ascend'); dispatch(s, 'unload');
  assert.equal(s.bank, before); assert.equal(s.pending, 200);
  dispatch(s, 'reconnect'); dispatch(s, 'reconnect');
  assert.equal(s.bank, before + 200); assert.equal(s.pending, 0);
});
test('死亡选择前保留货物，放弃才最终清舱', () => {
  const s = createState(); s.cargo = 400; dispatch(s, 'die');
  assert.equal(s.cargo, 400); tick(s, 10); assert.equal(s.cargo, 400);
  dispatch(s, 'abandon'); assert.equal(s.cargo, 0);
});
test('广告关闭不发奖；完成救援保货且生命恢复50%', () => {
  const s = createState(); s.cargo = 350; dispatch(s, 'die'); dispatch(s, 'ad:rescue');
  dispatch(s, 'ad:cancel'); assert.equal(s.cargo, 350); assert.equal(s.hp, 0);
  dispatch(s, 'ad:rescue'); dispatch(s, 'ad:complete'); dispatch(s, 'ad:complete');
  assert.equal(s.hp, 50); assert.equal(s.rescueUsed, 1); assert.equal(s.cargo, 350);
});
test('每日救援与供氧次数均不超过3', () => {
  const s = createState(); s.rescueUsed = 3; dispatch(s, 'die'); dispatch(s, 'ad:rescue');
  assert.notEqual(s.panel, 'ad'); s.panel = ''; s.hp = 100; s.oxygenUsed = 3;
  dispatch(s, 'ad:oxygen'); assert.notEqual(s.panel, 'ad');
});
test('广告和后台暂停冻结氧气；氧气归零后缓慢掉血', () => {
  const s = createState(); dispatch(s, 'pause'); const o = s.oxygen; tick(s, 10);
  assert.equal(s.oxygen, o); dispatch(s, 'resume'); s.hidden = true; tick(s, 10);
  assert.equal(s.oxygen, o); s.hidden = false; s.oxygen = 0; tick(s, 1);
  assert.equal(s.hp, 98); assert.equal(s.panel, '');
});
test('失败广告保留决策，无填充不直接发奖', () => {
  const s = createState(); s.oxygen = 10; dispatch(s, 'oxygen'); dispatch(s, 'ad:oxygen');
  dispatch(s, 'ad:fail'); assert.equal(s.panel, 'adFailed'); assert.equal(s.oxygen, 10);
  dispatch(s, 'ad:cancel'); assert.equal(s.panel, 'oxygen');
});
test('同一广告拉取最多重试一次', () => {
  const s=createState();dispatch(s,'ad:gift');dispatch(s,'ad:fail');dispatch(s,'ad:retry');
  dispatch(s,'ad:fail');dispatch(s,'ad:retry');assert.equal(s.panel,'adFailed');assert.equal(s.adRetries,1);
});
test('资源不足无法强化；三合一只消费三件', () => {
  const s = createState(); s.bank = 0; dispatch(s, 'upgrade:cargo'); assert.equal(s.upgrades.cargo, 1);
  const count = s.items; dispatch(s, 'merge'); assert.equal(s.items, count - 2);
});
test('空态页的前往下潜恢复默认战斗视图', () => {
  const s=createState();dispatch(s,'state:empty');dispatch(s,'dive');
  assert.equal(s.uiState,'default');assert.equal(s.screen,'battle');
});
