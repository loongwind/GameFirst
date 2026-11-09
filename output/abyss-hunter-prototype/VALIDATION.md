# 原型验证记录

日期：2026-11-09。验证对象为设计原型，不是正式 Cocos 构建。未上传、发布或连接生产服务。

## 已通过

- `node --test output/abyss-hunter-prototype/tests/model.test.cjs`：10/10通过。覆盖卸货不重领、离线待确认不入账、重连只确认一次、放弃才清舱、救援保货/50%生命、广告关闭不发奖、每日次数上限、暂停冻结、零氧持续掉血、广告失败保留现场、一次重试、强化余额不足、三合一消耗、空态返回战斗。
- `tests/browser.cjs`：本机Chrome+Playwright，8个逻辑场景、返航/卸货、补氧取消、救援完成、三种异常状态、667短屏点击区域、375px窄屏布局；0个pageerror。通过真实HTML按钮点击验证关键路径，其他场景通过同一模型动作桥切换。三张参考图的加载与naturalWidth均检查。
- `python3 output/abyss-hunter-prototype/asset-manifest.py`：185个唯一文件名、MVP167 / P1 18；普通24/精英8/渊主4/共生体8；所有生产源图≤2048px。脚本不生成图片。
- 三张`assets/*.png`的SHA-256与源概念图逐字节一致，记录见`assets/README.md`。
- 微信工具：`loginExpired=false`、skill版本0.3.0匹配；使用账号可管理的接口测试号进行本地检查；WXML编译成功（`$gwx`，codeLength39600），WXSS编译成功（comm/page，3858字符）。打包前恢复为游客appid，未将无关业务AppID提交。
- 共享模型与绘制代码已执行Node语法检查；JSON均解析检查。

## 微信运行验证未通过

`open_project_window`成功创建本地窗口。首次带选择器截图等待automator超时；不带选择器截图工具返回成功，但人工查看`evidence/wechat-tool-welcome.png`仍是开发工具欢迎页，并非游戏原型。`simulator_open_page --page pages/prototype/index`未返回，本轮已终止该次启动的精确CLI子进程（非微信主进程或Multica daemon）。

因此只能报告WXML/WXSS局部编译通过，**不能报告模拟器完整运行、真机预览、Cocos构建或游戏性能验证通过**。后续在开发工具中选择有权限的测试AppID并点击编译，再检查Canvas画面；如继续使用CLI，应先排查automator就绪与开页调用。浏览器原型已独立验证，可以完整评审本轮设计。

## 独立审查

按requesting-code-review技能完成一次独立只读审查。无Critical。发现1项Important：空状态“前往下潜”未复位`uiState`，已通过测试复现RED，修复后模型与浏览器回归均GREEN。

保留的3项Minor（样例局限，后续可改进）：

1. 科技五分支使用共用演示计数，切分支会显示同样的已解锁次数；不代表正式100节点进度。
2. 黄金箱反馈为精良装甲片，但代表性背包仍绘制声波炮；只演示抽取/扣费与三合一，尚非完整物品模型。
3. 网页操作时重建透明按钮，可能丢失连续键盘交互焦点；已有aria-label/可见焦点，但无完整键盘焦点保持。

## 图像证据

`01-review-workspace.png`为网页评审工作台；`02-harbor.png`及battle/abyss/upgrade/tech/equipment/rewards/codex为各逻辑场景；oxygen/rescue/settlement为关键弹窗；loading/empty/error为异常状态；short-screen/mobile-browser为适配截图。全部是原型渲染截图，不是新生成的游戏素材。

## 范围与人工判断

三层暂到2400m、战令归P1、新补全物种及额外巨鲸均是本轮设计建议；源PRD仍需产品确认。交付为共享Canvas原型、WXML预览壳、Cocos节点映射和素材制作契约。完整战斗、真实广告、云端幂等/安全、永久存档、P1业务、正式动画与性能预算仍在后续研发范围。
