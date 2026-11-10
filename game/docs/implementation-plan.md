# P1-01 工程奠基实施计划

**目标**：按 `docs/潜渊猎手-技术方案.md` §2.1 与开发计划第六节交付 Cocos Creator 3.8.8 可构建骨架。

**架构**：正式客户端位于 `game/`，纯 TS 契约与算法位于根目录 `shared/`。浏览器适配真实存储和生命周期；微信实现仅留插槽。Boot 保持空场景，只初始化平台服务并输出就绪日志。

**技术栈**：Cocos Creator 3.8.8、TypeScript、Node 内置测试、Playwright 浏览器验收。

## 约束与实施选择

- 仅提交 `game/` 与 `shared/`；原型及既有文档不变。
- 本工作区配置为 in_place；在 `loo-50-game-foundation` 分支原地执行，保留已有未跟踪文件。
- 3.8.8 官方示例 Web CLI 构建已返回 36，工具链门槛通过后才创建本工程。
- `shared/` 不依赖 Cocos、wx、DOM 或 Node 全局；由客户端工具编译为本地 npm 包后导入。
- 不实现业务数值、微信 API 或广告 Mock；发布构建显式拒绝 Mock 入口。
- Web 验收使用实际 Cocos 构建产物；不以刷新或纯 TS 编译替代。

## 实施步骤

- [x] 初始化官方 2D 模板、Boot/Dive/Harbor 与 Bundle 目录，保存稳定 UUID 和 meta。
- [x] 先写适配层和数值边界测试，运行确认缺少实现时失败。
- [x] 实现 PlatformAdapter、浏览器存储/设备/生命周期，以及 shared DTO/schema/错误码/安全整数运算。
- [x] 保存 Web debug/release 构建配置、版本指纹、精确依赖锁与构建脚本；运行测试和类型检查。
- [x] 构建 Web，通过浏览器验证 Boot、场景切换、存储刷新、生命周期、设备信息、release；留存截图和结果。
- [x] 检查全部变更范围，独立代码审查确认可提交；平台评论作为最终交付动作。

## 重点验证

存储不可用时向调用者抛出错误；删除操作保留其他键。前后台重复事件不重复通知且可退订。设备信息使用当前窗口尺寸。数值拒绝非安全整数和溢出。微信未实现时失败退出，不回落浏览器。发布产物不含 Mock。

## 执行记录

- 适配层/数值测试先因实现缺失失败，随后 5/5 通过；发布保护加入后 6/6 通过。
- Web debug 与 release CLI 均返回 36，完整客户端/shared 类型检查通过。
- 两个构建的 Chromium 冒烟均通过：Boot 初始化协议版本 1，至少渲染 6 帧；Dive → Harbor → Boot 可加载，无 console error 或 pageerror。
- 浏览器验收脚本修正：不用异步函数作为 waitForFunction 的真假条件，改为先订阅 Boot 日志再等待实际绘制事件；产品实现未因此改变。
- 独立只读代码审查：无 Critical/Important 问题；一个 Minor 后续补测项为 visibilitychange 与保留订阅后 dispose 的组合覆盖。当前实现已正确移除三类原生监听。
