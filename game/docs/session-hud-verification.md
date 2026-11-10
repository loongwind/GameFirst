# P1-03 局内状态与 HUD 验收记录

日期：2026-11-10。基线：P1-02 `4b7def3`；实现范围限于 `game/` 的状态模型、Dive 场景、HUD、生命周期及验证。

## 交付行为

- `DiveSession` 包含原有 `Battle`，统一30Hz有效时间，单帧最多3步且丢弃卡顿积压。氧耗基线 `1+0.2*floor(depth/500)`，包括2500m=2.0；耗尽后的那部分有效时间每秒扣2%最大生命。
- `Running → RescuePending → Running / Returning → PendingSettlement → Settled`。死亡冻结不可变快照，救援恢复50%生命并继续原战斗/原 `diveId`；放弃只清未卸货荧晶，珍珠/深海髓/渊核保留。
- 结算摘要只生成一次，`confirmSettlement(diveId)` 只接受同局且不能重复确认。该方法**不入账钱包**，入账由后续经济/结算服务负责。
- 荧晶封顶后部分装载，其余掉落留在场内；稀有材料不占荧晶舱容量。
- PauseManager 集合含 `modal/ad/background/reconnect/countdown`；集合非空冻结战斗、氧气与伤害；低氧提示不暂停。关闭广告仅移除 `ad`。隐藏或等待中的按钮没有活动触区，命令端也检查阻塞原因。
- 生命周期来自 PlatformAdapter + Cocos Game；浏览器额外处理失焦来电类事件。回前台3秒倒计时，其他暂停叠加时倒计时也冻结，首个恢复帧丢弃后台时差。所有监听在销毁时释放。
- 断线≤30秒原地冻结恢复；>30秒冻结待结算，死亡待救援期间超时仍按死亡口径处理。现场保留指同一运行进程里的完整 Battle；杀进程持久恢复属后续存档服务。
- 原生Cocos HUD：氧气/荧晶舱条、生命值、右侧垂直深度标尺、摇杆、暂停与返航触区。375逻辑宽，实际验证667/750/812高；44/34上下安全区及左右安全区参与布局，按钮最小48高。

## 本地复现

在 `game/` 运行：

```sh
npm test
npm run typecheck
npm run typecheck:battle
npm run build:web
npm run test:web
npm run test:dive:web
npm run test:battle:web
npm run build:web:release
WEB_TARGET=web-release npm run test:web
WEB_TARGET=web-release npm run test:dive:web
```

手工打开 `Dive` 场景可在Creator内选择该场景运行，或服务 `build/web-debug/` 后在浏览器控制台调用：

```js
System.import('cc').then(({ director }) => director.loadScene('Dive'));
```

Boot/Harbor保持P1-01场景职责，母港入口由P1-05接入。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| 全套 `npm test` | 42/42（含13项session、1项布局、5项平台及既有战斗/shared/release保障） |
| 项目/shared/battle类型检查 | 通过 |
| Creator Web debug/release构建 | 成功码36 |
| debug/release真实Cocos场景冒烟 | Boot启动、Dive/Harbor往返，无运行时错误 |
| debug/release HUD交互 | 三高度、安全区、真实摇杆/暂停按钮、隐藏按钮防误触、广告+后台+modal、3秒倒计时、99秒后台首帧隔离、断线恢复、缺氧持续扣血、两次死亡/救援/放弃同局待结算；console/pageerror为空 |
| 40/80怪 + 200弹 + 100掉落浏览器回归 | 3/3；80怪逻辑p95约0.30ms，帧间隔p95约16.8ms（浏览器基线，非真机承诺） |

截图及JSON结果由 `tests/dive.smoke.mjs` 写入 `.artifacts/hud/`；issue评论附可查看截图。测试使用真实Cocos产物和状态模型，缺氧覆盖用短氧瓶配置缩短等待，不引入Mock资产或广告。

## 后续接入契约与边界

- `rescue-request` 携带冻结死亡快照；P1-06奖励服务确认资格后调用 `DiveController.onRescueAuthorized()`。按钮目前明确提示服务待接入，不假装已播放广告或发奖。
- 广告展示与结束分别调用 `onAdStarted/onAdClosed`，授权/次数/去重由AdService管理。纯模型 `rescue()` 在非RescuePending状态拒绝重复调用。
- 当前浏览器 `offline/online` 提供连接提示；未来真实请求失败/成功也应调用 `onConnectionLost/onConnectionRestored`，不能仅凭网络图标确认云连接。
- `pendingSettlement` 为不可变摘要；经济服务完成幂等入账后调用 `confirmSettlement`。本任务不做钱包、存档、广告Mock、云端、素材集成或原生微信适配。
- 微信开发者工具已验证登录且skill版本匹配；正式小游戏AppID/微信构建与真机验证按既定P2-05/W3任务执行，未用旧交互原型冒充正式工程验证。

## 评审闭环

独立评审发现等待广告时隐藏的返航触区仍可能终止潜航；实际点击回归先失败（`Returning != Running`）后通过。另由真实构建测试定位并修正：Graphics裁剪、桌面模板固定尺寸/resize、Cocos对Set展开的转换（使用Array.from）、首个恢复帧跳过倒计时。弹窗触区使用原生Button.interactable禁用，保留绘图层级，并检查最终截图的面板像素，避免禁用节点造成背景漏绘。没有遗留评审项。
