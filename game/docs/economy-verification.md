# P1-04 本地经济与存档交付

基线 `9c4b047`，工作分支 `loo-53-local-economy`。正式工程继续使用 Cocos 3.8.8 Web 验证；不修改旧原型、微信游客 AppID 或云资源。

## 产品口径

- LOO-47 原始决策优先于任务摘要：三合一允许混等级，同模板、同品质、未锁定且未穿戴；显式指定主装备，继承主装备等级与投入，只返还两个辅料的实际深海髓/升级券投入，禁止二次返还。
- 黄金广告抽/珍珠单抽/十连共享连续计数，连续九次未出史诗及以上，第十次强制出货；出货清零，白银独立。券不是装备、不重置黄金计数。
- M1 是六类广告、七个 slot：馈赠5、祝福2、声呐6、白银3、黄金2、救援3、供氧3；北京时间业务日，战令不开放。
- 死亡仅清未卸货荧晶；珍珠、深海髓、聚合渊核与击杀经验保留。救援沿原 diveId 继续，不创建第二份收益。

## 边界与接口

`shared/config/balance.json` 是数值来源，`balance.schema.json` 定义结构与范围，`validateBalanceConfig` 进一步验证概率总和、科技引用/循环、等级上限、保底及掉落安全整数范围。运行 `npm run config:export` 更新 Cocos 可打包的 TS 表；测试和构建拒绝过期导出。

金额用规范十进制字符串，BigInt 只参与计算，不写入 JSON；1000 级指数价格不会溢出或悄悄失真。升级费用向上取整，XP/玩家等级独立，满级封顶，Lv8=245XP，Lv40=4485XP。五系各20科技节点；具体节点价格、效果、装备升级价格、箱子概率和馈赠数量仍是明确标注的首测默认值，后续调优改 JSON。

客户端通过 `EconomyService.dispatch(action)` 提交资产命令，调用者应使用 `await dispatch(action)`，便于 P3 换成异步远端路由。命令包括结算、属性、科技、装备升级/合成/穿戴/锁定、抽箱、广告 prepare/complete/claim/cancel、已验证任务领奖。任务与情境广告需要注入资格校验，默认拒绝；不提供通用任意充值命令。

`LocalSaveService` 实现 `SaveService`。双槽轮换写入包含 sequence、schemaVersion/cloudRev/sessionEpoch、状态与校验和，写后读回一致才确认成功。最高有效序号优先；一个槽损坏恢复另一个，全部损坏报 CORRUPT_SAVE 并保留原数据。校验和用于发现意外损坏，不是反作弊认证。P3 云权威与版本迁移仍需独立实现。

`LocalDiveService.open → reconcileAds` 恢复原局、解决待确认广告，再判断恢复窗与断线超时。检查点保存敌人/弹体/掉落池及 ID、随机状态、生命/氧气/舱内资产、死亡选择、经验与 pendingSettlement。切后台、状态切换、每15秒和场景销毁补保存。重新进入运行局先倒计时；后台时间不补算战斗或掉落。

结算顺序是保存原 pendingSettlement → dispatch 同 diveId 结算 → 钱包与回执同快照写盘 → confirmSettlement → 保存确认状态。任一崩溃边界重开均复用同局/回执，不能重复入账。失败保持收获冻结并可重试。

`AdService` 只依赖可注入的 `AdDriver`。点位资格、额度与发奖均通过 dispatch；一份持久意图阻止并发观看。失败/跳过/未知完成状态不发奖、不扣完成额度；加载/展示最多重试一次。签发日决定使用哪天的次数，跨日不清旧账；过期意图释放。已完成而写盘/效果确认失败时返回 pending，`retryClaim()` 使用原 token/opId，不播放第二次视频。

`DiveController.createAdService(driver)` 提供 onAdStarted/onAdClosed 与幂等情境效果落盘钩子。P1-06 接入情境 UI；`onRescueAuthorized(token)` 拒绝未到账 token。祝福三选一互斥，绝对时间20分钟；声呐15分钟且剩余≤1分钟才可刷新。实际掉落/氧气/舱容随绝对时间更新，后台会到期；收益祝福不放大 XP，舱容祝福到期不销毁已装货物。

开发 `MockAdService` 位于 `game/development/`，显式 isMock，默认直接完成观看；仅用于开发/测试。它不在 Cocos assets 图内；release guard 会检查标记、标识符及跨目录导入，禁止别名带入开发奖励代码。正式发布图不内置广告驱动或自动补奖。

`TelemetryBus` 允许本地订阅；事务事件与资产同存档。`shared/protocol/telemetry.ts` 预留 telemetry.batch v1，PRD §10.2 的事件名统一，批次确认按事件 ID 删除，保留后来事件。结算、科技、装备、广告、死亡与开局已有发射点，教学/纪录等功能由后续所属模块使用同总线接入；未上传外部分析平台。

四货币沿 P1-03 的 crystal/pearl/marrow/core 接口，core 仍是聚合渊核。青/绯细分随怪物/内容实例接入，不从聚合余额反推稀有度。

## 验证与复现

在 `game/` 执行：

```sh
npm test
npm run typecheck
npm run typecheck:battle
npm run typecheck:services
npm run build:web
npm run test:web
npm run test:dive:web
npm run test:economy:web
npm run test:battle:web
npm run build:web:release
WEB_TARGET=web-release npm run test:web
WEB_TARGET=web-release npm run test:dive:web
WEB_TARGET=web-release npm run test:economy:web
```

最终结果与截图由 issue 评论附带；本地生成物位于 `.artifacts/`，不提交构建产物或个人存档。

已收集：`npm test` 76/76；三组类型检查通过；debug/release Creator均返回成功码36。40/80怪+200弹+100掉落浏览器回归3/3，80怪逻辑p95约0.30ms、帧间隔p95约16.8ms（本机浏览器基线，不是微信真机结论）。

两种构建的 Boot/场景冒烟、HUD暂停与死亡/广告叠加、经济刷新共6/6通过，console/pageerror均为空。实际用例在死亡待选保存77荧晶/2珍珠/3深海髓/1渊核，刷新恢复原局；放弃后钱包为0/2/3/1，再刷新与重放原结算仍为0/2/3/1。七slot额度证据重开后仍为5/2/6/3/2/3/3，下一次均返回AD_DAILY_LIMIT。

浏览器测试定位过收益对象多出sonar布尔字段与战斗夹具依赖入口问题，现已修复；经济冒烟以同步状态谓词等待Settled，避免异步谓词在帧更新前提前通过。

独立只读审查发现并修复了三个 Important：无效保底/溢出曲线能通过校验、过期完成意图占住广告入口、祝福收益未应用/容量到期未同步。另补了效果已应用而写盘失败后的重试，以及跨目录 release 图保护。没有搁置的评审项。
