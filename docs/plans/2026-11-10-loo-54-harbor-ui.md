# LOO-54 母港与养成 UI 实施记录

基线 3ddb4a9，分支 loo-54-harbor-ui。按已批准原型和任务交接直接实施，工作区按项目 in_place 配置保留。

设计：沿用海洋科考终端、青蓝行动/琥珀收益与手绘港口素材。HarborRoot/SubDisplay、Wallet、TaskStrip、LaunchButton、BottomNav 和 OverlayRoot 映射原型。Cocos 运行时生成面板节点，避免复制四份场景绑定；共享四态、ScrollView 虚拟行、Widget 安全区。只读快照与共享算法生成成本预览；所有写操作 await dispatch，广告走注入的 AdService，未配置广告驱动时明确不可用。无 development 依赖。数字使用项目生成的 BMFont，中文系统字体。

1. 先写布局、预览、异步幂等重试/重复点击、虚拟窗口测试，确认缺失失败；实现 HarborModel 与安全区布局。
2. 实现 Cocos Harbor 场景与四面板、素材生命周期和虚拟列表；装备显式选择主件及两个辅件，预览保级和实际返还；加载/错误可关闭恢复。
3. Cocos browser smoke：667/750/812 和安全区、真实 Button/ScrollView、关闭重开不重复监听、经济操作/失败恢复；保存截图与 JSON。
4. 跑完整测试、类型检查、debug/release 构建与 release guard；限定文件提交并交付验收。

重点检查：主件误选、高等级辅件返还、存储失败原 opId 重试、广告 pending 原 token 重试、100 节点和 200 背包行节点上限、异步加载在场景退出后不回写。

基线验证：npm test 76/76 通过；wechatide 登录成功，versionRelation equal。现有 WXML 评审壳 touristappid，不作为正式 Cocos 验收或发布目标。

实施完成：模型/布局、真实Cocos场景和面板、虚拟列表与素材、84项完整测试、类型检查、debug/release构建及浏览器UI验收均通过。

裁决：沿用运行时生成面板节点而非新增四份序列化Prefab，统一管理监听与销毁；验收对象为实际Cocos运行时。
裁决：微信平台适配和真实广告驱动沿用后续阶段边界，当前保留失败反馈和服务注入点，不导入开发Mock。
审查修复：满背包奖励恢复、返港保存竞态、meta素材预算；测试与构建过程额外修复Cocos降级BigInt幂运算兼容性。详细证据见 docs/潜渊猎手-P1-05验收记录.md。
