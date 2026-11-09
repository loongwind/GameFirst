/* 中文界面原型的本地状态模型。所有经济、广告和存档均为模拟。 */
(function (root) {
  const names = { hp: '机体生命', attack: '火力输出', speed: '攻击速度', move: '潜航速度', cargo: '收集舱容', oxygen: '氧气效率' };
  function createState() {
    return { screen: 'battle', panel: '', returnPanel: '', bank: 1280, pearls: 128, marrow: 17, cores: 3,
      cargo: 160, capacity: 500, oxygen: 78, hp: 100, depth: 260, record: 1280, time: 0,
      pending: 0, settlement: 0, online: true, hidden: false, rescueUsed: 0, oxygenUsed: 0,
      blessingUsed: 0, silverUsed: 0, goldUsed: 0, items: 6, merged: false, tutorial: true,
      upgrades: { hp: 1, attack: 1, speed: 1, move: 1, cargo: 1, oxygen: 1 }, tech: 0,
      techBranch: 0, choice: 0, buff: '', sonar: false, toast: '', toastTime: 0,
      adKind: '', adRetries: 0, rewardSerial: 0, diveSerial: 1, alive: true, uiState: 'default', joystick: null };
  }
  function note(s, message) { s.toast = message; s.toastTime = 3; }
  function cost(s, key) { return Math.round(80 * Math.pow(1.16, s.upgrades[key])); }
  function dispatch(s, action) {
    const [kind, value] = action.split(':');
    if (kind === 'route') {
      s.screen = value; s.panel = ''; s.uiState = 'default'; s.toastTime=0;
      if (value === 'abyss') { s.oxygen = 12; s.cargo = 450; s.depth = 2140; s.hp = 64; s.alive = true; s.tutorial = false; }
      if (value === 'battle') { s.oxygen = 78; s.depth = 260; s.hp = 100; s.alive = true; }
      return;
    }
    if (kind === 'state') { s.uiState = value; return; }
    if (kind === 'upgrade') {
      const price = cost(s, value);
      if (!Number.isFinite(price)) return;
      if (s.bank < price) return note(s, '荧晶不足，先下潜收集并卸货');
      s.bank -= price; s.upgrades[value]++;
      if (value === 'cargo') s.capacity += 50;
      s.tutorial = false; note(s, names[value] + '已强化'); return;
    }
    if (kind === 'branch') { s.techBranch = Number(value); return; }
    if (kind === 'choice') { s.choice = Number(value); return; }
    if (kind === 'ad') {
      if (value === 'cancel') { s.panel = s.returnPanel; s.adKind = ''; note(s, '未完成观看，奖励未发放'); return; }
      if (value === 'fail') { if (s.panel === 'ad') s.panel = 'adFailed'; return; }
      if (value === 'retry') { if(s.panel!=='adFailed'||s.adRetries>=1)return note(s,'已重试一次，请返回原选择');s.adRetries++;s.panel = 'ad'; return; }
      if (value === 'complete') {
        if (s.panel !== 'ad' || !s.adKind) return;
        const reward = s.adKind; s.adKind = ''; s.panel = ''; s.rewardSerial++;
        if (reward === 'rescue') { s.hp = 50; s.alive = true; s.rescueUsed++; }
        if (reward === 'oxygen') { s.oxygen = 100; s.oxygenUsed++; }
        if (reward === 'gift') { s.bank += 180; s.pearls += 5; }
        if (reward === 'blessing') { s.blessingUsed++; s.buff = ['收益 +10%', '氧气 +20%', '舱容 +20%'][s.choice]; if (s.choice === 2) s.capacity += 100; }
        if (reward === 'sonar') s.sonar = true;
        if (reward === 'silver') { s.silverUsed++; s.items++; }
        if (reward === 'gold') { s.goldUsed++; s.items++; }
        note(s, '模拟奖励已确认 · 本次仅发放一次'); return;
      }
      if (!s.online) return note(s, '网络未连接，恢复后再试');
      const limits = { rescue: [s.rescueUsed, 3], oxygen: [s.oxygenUsed, 3], blessing: [s.blessingUsed, 2], silver: [s.silverUsed, 3], gold: [s.goldUsed, 2] };
      if (limits[value] && limits[value][0] >= limits[value][1]) return note(s, '今日次数已用完，明日重置');
      s.returnPanel = s.panel; s.adKind = value; s.adRetries=0; s.panel = 'ad'; return;
    }
    switch (action) {
      case 'dive': s.screen = 'battle'; s.panel = ''; s.uiState='default'; s.cargo = 0; s.depth = 0; s.oxygen = 100; s.hp = 100; s.alive = true; s.diveSerial++; break;
      case 'tutorial': Object.assign(s, createState()); break;
      case 'pause': s.panel = 'pause'; break;
      case 'resume': s.panel = ''; break;
      case 'oxygen': s.panel = 'oxygen'; break;
      case 'ascend': if (!s.alive || s.panel === 'settlement') break; s.settlement = s.cargo; s.record = Math.max(s.record, Math.round(s.depth)); s.panel = 'settlement'; break;
      case 'unload':
        if (s.panel !== 'settlement') break;
        if (s.online) s.bank += s.settlement; else s.pending += s.settlement;
        s.cargo = 0; s.settlement = 0; s.screen = 'harbor'; s.panel = ''; note(s, s.online ? '卸货入账成功，去强化收集舱吧' : '收益待确认，联网后自动补交'); break;
      case 'die': s.hp = 0; s.alive = false; s.panel = 'rescue'; break;
      case 'abandon': s.cargo = 0; s.screen = 'harbor'; s.panel = ''; s.alive = true; note(s, '舱内荧晶已损失，已入账资产保留'); break;
      case 'disconnect': s.online = false; note(s, '连接中断 · 本局现场已保留'); break;
      case 'reconnect': s.online = true; s.bank += s.pending; s.pending = 0; note(s, '模拟云确认完成'); break;
      case 'tech':
        if (s.bank < 240 || s.cores < 1) return note(s, '需要 240 荧晶与 1 枚渊核');
        s.bank -= 240; s.cores--; s.tech++; note(s, '科技节点已点亮'); break;
      case 'merge': if (s.items < 3) return note(s, '需三件同类同品质装备'); s.items -= 2; s.merged = true; note(s, '合成成功 · 声波炮升为精良'); break;
      case 'equip': note(s, s.merged ? '精良声波炮已装配到主武器槽' : '标准声波炮已装配到主武器槽'); break;
      case 'buySilver': if (s.pearls < 50) return note(s, '珍珠不足'); s.pearls -= 50; s.items++; note(s, '获得标准声波炮 ×1'); break;
      case 'buyGold': if (s.pearls < 100) return note(s, '珍珠不足'); s.pearls -= 100; s.items++; note(s, '获得精良装甲片 ×1'); break;
      case 'gift': case 'blessing': case 'sonar': s.panel = action; break;
      case 'close': s.panel = ''; break;
      case 'retry': s.uiState = 'default'; break;
      case 'locked': note(s, '第 4 槽位于 Lv.40 解锁'); break;
      case 'p1': note(s, 'P1 预览内容，正式玩法尚未开放'); break;
    }
  }
  function tick(s, seconds) {
    s.toastTime = Math.max(0, s.toastTime - seconds);
    if (s.hidden || s.panel || s.uiState !== 'default' || !s.alive || !['battle', 'abyss'].includes(s.screen)) return;
    s.time += seconds;
    s.oxygen = Math.max(0, s.oxygen - seconds * (1 + Math.floor(s.depth / 500) * 0.2) / 1.2);
    if (s.oxygen === 0) s.hp = Math.max(0, s.hp - seconds * 2);
    if (s.hp === 0) dispatch(s, 'die');
    s.depth = Math.min(s.screen === 'abyss' ? 2399 : 799, s.depth + seconds * 2);
    s.cargo = Math.min(s.capacity, Math.round(s.cargo + seconds * 4));
  }
  const api = { createState, dispatch, tick, cost, names };
  if (typeof module !== 'undefined') module.exports = api;
  else root.HunterModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
