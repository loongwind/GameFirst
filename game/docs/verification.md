# P1-01 验证记录（2026-11-10）

## 工具链门槛

本机安装 Cocos Creator **3.8.8**，editor/engine/external 指纹与
`editor-version.json` 一致。在临时目录用编辑器自带 hello-3d-world 模板执行
`--project <probe> --build "platform=web-desktop;debug=true"`，生成 Web index，
退出码 **36**。通过此门槛后才创建正式工程。

微信开发者工具状态：已登录，openid 已返回；wechatide skill 从 skill.yaml
读取版本后检查得到 `versionRelation: equal`。本任务仅构建 Web，未打开原型、
未配置小游戏 AppID、未执行微信上传或云资源操作。

## 正式工程

| 验证项 | 结果 |
| --- | --- |
| `npm test` | 6 项通过：真实浏览器存储刷新、生命周期去重/退订、设备窗口变化、存储失败上抛、安全整数运算、release Mock 拦截 |
| `npm run typecheck` | 客户端与 shared 均通过；shared 仅启用 ES2020 lib，禁用隐式环境类型 |
| `npm run build:web` | Creator 退出码 36；`build/web-debug/index.html` 生成 |
| `npm run build:web:release` | Creator 退出码 36；`build/web-release/index.html` 生成 |
| debug 浏览器冒烟 | Boot ready，protocol=1，观测 7 帧，Dive → Harbor → Boot 加载成功，无运行错误 |
| release 浏览器冒烟 | 同上；非 debug 构建，发布前源代码检查通过 |

独立只读代码审查确认可提交，无 Critical/Important 问题。非阻塞补测项：
visibilitychange 以及保留订阅后 dispose 的组合用例；当前生命周期测试已验证
pagehide/pageshow、重复通知合并和主动退订，源码清理三类原生事件监听。

完整构建日志保留于本次工作目录 `temp/build-logs/`，截图与机器可读结果在
`.artifacts/`，交付 issue 随附截图/结果文件。缓存和生成产物不提交。
Creator 构建日志在回收已完成脚本/引擎子进程时输出 debug 级 SIGTERM 信息；
最终退出码、完成日志与浏览器实际启动共同确认构建结果。

## 范围限制

这是可构建的空工程，不包含战斗、经济配置或微信实现。配置模块当前为 TS schema
契约，业务配置表及校验由 P1-04 接续；微信 release 构建、原生生命周期及安全区、
真机性能由阶段三验收。本次截图中的深色空画面是预期 Boot 场景。

Creator CLI 参数与成功码依据：[Cocos 3.8 官方命令行构建文档](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-in-command-line.html)。
