# P1-04 本地经济、存档与广告实施计划

**Goal:** 在 P1-03 基线之上提供可切换服务端路由的 dispatch(action)、可靠本地资产与开发专用广告模拟。

**Architecture:** shared 提供配置校验、精确金额与纯算法；客户端服务通过 PlatformStorage 双槽提交事务。DiveSession 的原 diveId 是结算幂等键；成功写盘后确认结算。开发广告驱动位于 assets/shared 之外，正式发布图保留既有拒绝 Mock 门槛。

**Spec:** LOO-53、LOO-47 决策评论 01a1c38d-b47c-7e50-8b68-01ca45adc7ed、PRD §6/§10.2、技术方案 §2.3。

**Tech Stack:** Cocos 3.8.8、TypeScript、Node test、Playwright。

## 约束与选择

- in_place 工作区，新分支 loo-53-local-economy，起点 9c4b047；保留未跟踪文件。
- 原始 LOO-47 决策优先：允许混等级三合一，只返辅料实际投入；M1 六类广告七 slot，战令关闭。
- 金额存为十进制字符串，计算使用 BigInt，避免 1000 级指数价格溢出/精度丢失；局内拾取仍为安全整数。
- JSON 为数值唯一来源，导出已校验 TS 表以适配 Cocos 打包；未冻结的科技价格、装备价格与箱子概率明确为首测默认表。
- 本阶段保留四货币聚合 core；青/绯实例细分随内容服务接入，不从聚合 core 推断品质。
- 存档双槽均有效时选最高序号；一个损坏可恢复，全部损坏拒绝覆盖，不静默清空。写入再读校验成功后才替换内存状态。
- 保存 pendingSettlement 后再入账；结算回执与钱包同快照，重复操作返回原回执。后台保存当前局，重开保持原 diveId/死亡选择与已有资产。
- 广告额度绑定北京时间签发业务日；完成才计次，失败/跳过释放预留；完成待确认可原操作重试，不重播。
- 不改情境 UI、不接真实广告/云资源、不发布微信；正式工程本阶段通过真实 Cocos Web 验证。

## Review Focus

存储失败前后崩溃/响应丢失；混等级重复返料；跨日/并发广告与迟到情境；无效/溢出输入；死亡与后台/广告暂停叠加。

## 任务与接口

1. shared 配置与纯算法：`validateBalanceConfig`、`upgradeCost`、`levelForXp`、`rollBox`、`synthesize`、`monsterDrop`。先写算法/配置失败测试，再实现与导出检查。
2. 存档/经济/事件：`SaveService.load/save`、`EconomyService.dispatch(action)`、`TelemetryBus.batch/ack`。先写守恒、损坏、重开、幂等及写盘失败测试，再实现。
3. 广告状态机：`AdService.watch/retryClaim` + `AdDriver`；开发 `MockAdService` 独立入口。测试七 slot 上限、跨日、状态流转、失败无奖与领奖重试。
4. 集成：DiveSession 本地检查点、实际战斗掉落曲线/经验、DiveController 后台保存与结算；回归暂停/死亡链路，构建 debug/release，真实浏览器重开与资产证据。完成整分支审查、限定范围提交。

## 执行记录

- 基线 npm test 42/42。wechatide 登录有效、openid 存在、skill 版本 0.3.0 对齐。正式 game 无微信构建；旧 output 原型为游客 AppID，不开启或更改。
- shared、经济/存档、广告、潜航检查点四组测试均先运行缺失实现的失败用例再实现；当前全套76项通过，客户端/shared/battle/services类型检查通过。
- 独立只读审查三个Important已处理：配置的保底/掉落跨字段约束、过期完成广告释放、收益祝福与实际绝对到期。效果落盘失败重试与跨目录release导入保护也有回归覆盖。
- 调整：渊核沿P1-03保持聚合接口；未冻结数值明确为首测默认值。影响与后续接入见 economy-verification.md，不改变LOO-47已冻结的产品规则。
- 真实构建补获并修复：benefits对象同时含sonar布尔值，模型只校验三种数值倍率；独立战斗夹具直接导入Battle/input，避免加载不属于该夹具的session/shared包。对应单测与浏览器回归已运行。
