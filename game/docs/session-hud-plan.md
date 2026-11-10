# P1-03 局内状态与 HUD 实施计划

**Goal:** 在现有 Cocos Web 工程交付双压力 HUD、死亡救援与可组合暂停。
**Spec:** LOO-52；`docs/潜渊猎手-技术方案.md` §2.2/5.7；PRD §11.2；死亡仅损失未卸货荧晶。
**Architecture:** DiveSession 包含 Battle，统一按30Hz推进有效时间；PauseManager 维护原因集合。Cocos DiveController 处理生命周期/网络信号与摇杆，DiveHud 仅绘图和发命令。暂不实现广告服务、钱包入账、云存档或微信适配（对应后续任务）。
**Approaches:** 采用独立纯数据状态机+原生 Cocos HUD，沿用 battle/UI 边界；不把状态堆进 Battle，也不复用不进入正式构建的 HTML 原型。
**Global constraints:** 基准375宽、667/750/812高；触区≥44；氧耗 `1+0.2*floor(depth/500)`；缺氧2%最大HP/有效秒；救援50%HP，沿原diveId；死亡材料保留；断线30秒保留现场，超时冻结待结算。

## Review focus

- 暂停原因乱序/重复回调；广告关闭不能清除后台、弹窗或断线原因。
- 大帧/缺氧跨零边界不补算后台时间，死亡后同帧不继续推进。
- 多次死亡/救援、重复返港/确认不会新增结算或损失稀有材料。
- 断线超时与死亡重叠不能把冻结荧晶安全兑付。
- 小屏、底部安全区及弹窗的点击区和层叠。

## Task 1: Pure session and pressure model

Files: `battle/{PauseManager,DiveSession}.ts`、`battle/model.ts`、`battle/Battle.ts`、`tests/session.test.mjs`。
Interfaces: PauseManager.add/remove/reasons/paused；DiveSession.advance(seconds)、hide/show、connectionLost/Restored(nowMs)、checkConnectionTimeout(nowMs)、requestReturn/arriveHarbor、rescue/declineRescue、confirmSettlement(diveId)。snapshot为不可变数据；结算由后续服务确认。

- [x] 写状态/氧耗/缺氧/舱容/叠加暂停/倒计时/断线/重复结算失败测试。
- [x] 运行 `node --test tests/session.test.mjs` 观察缺少功能失败。
- [x] 实现纯数据模型及 Battle 掉落受限装载（溢出留场），无平台/UI依赖。
- [x] 运行 `npm test`、`npm run typecheck:battle`。

## Task 2: Cocos scene and HUD

Files: `ui/{DiveHud,hudLayout}.ts`、`services/DiveController.ts`、`assets/scenes/Dive.scene`、`tests/{hud-layout.test,dive.smoke}.mjs`。
Interfaces: hudLayout(width,height,insets)返回375逻辑坐标矩形；DiveController持有session并绑定平台生命周期，页面事件与Cocos事件均释放。

- [x] 写375×667/750/812与safeArea布局断言、Cocos场景实测。
- [x] 实现海洋仪表风格氧气/舱容/生命、右侧深度尺、44以上操作区与暂停/救援/返航面板。
- [x] 接入30Hz session、低氧常驻提示不暂停；救援按钮等待后续奖励服务授权，不冒充已播放广告。
- [x] 运行构建、类型检查、浏览器交互与尺寸矩阵截图；运行完整既有回归。

## Delivery

- [x] 保存验收记录，仅提交P1-03范围文件；最终issue评论附HUD截图和验证结果。
