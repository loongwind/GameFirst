# 潜渊猎手 · Cocos 工程

P1-01 工程骨架：Boot 初始化真实浏览器适配层后保持空场景；Harbor保留 Canvas 与 Camera。
P1-03 已将战斗、状态与HUD接入Dive场景。

P1-02 已加入纯数据战斗核心及独立浏览器验证页，入口为
`assets/scripts/battle/index.ts`。使用契约、压测复现与性能记录见
[battle-verification.md](docs/battle-verification.md)。运行 `npm run battle:serve`
可查看四武器、摇杆及持续 80/200/100 满载夹具；此页不进入正式发布包。

P1-03 的 `DiveSession` / `PauseManager` 位于同一纯数据模块，Dive场景绑定
`DiveController` 与原生Cocos HUD。包含双压力、死亡冻结/救援、原因集合暂停、
前后台倒计时、断线保留与安全区。运行 `npm run test:dive:web` 验证真实构建，
接入契约与边界见 [session-hud-verification.md](docs/session-hud-verification.md)。

## 环境与复现

- Cocos Creator **3.8.8**，完整 editor/engine 指纹见 `editor-version.json`。
- 本次验证基线为 macOS、Node **24.5.0**、npm **11.5.1**，依赖由
  `package-lock.json` 锁定。Node 版本亦记录于 `.node-version`。
- 浏览器测试使用本机 Google Chrome（Playwright `channel: chrome`）；无需下载浏览器。
- 默认编辑器路径为 `/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator`。
  其他 macOS 安装位置通过 `CREATOR_EXECUTABLE` 指定；构建会核对安装指纹。

在本目录运行：

```sh
npm ci
npm test
npm run build:web
npm run typecheck
npm run test:web
npm run build:web:release
WEB_TARGET=web-release npm run test:web
```

`build:web` 会先编译根目录 `shared/`，再调用 Creator CLI。CLI 成功码为 **36**，
脚本仅在成功码和 `index.html` 均存在时返回 0。构建配置保存于
`build-configs/web-{debug,release}.json`，所有场景明确列入且 Boot 为入口。
构建日志见 `temp/build-logs/`；浏览器截图与结果见 `.artifacts/`，均不入库。
类型检查使用 Creator 生成的 `temp/tsconfig.cocos.json`，首次执行前先构建或用编辑器打开工程。

浏览器测试会启动临时本地 HTTP 服务与无头 Chrome，并在测试结束时关闭。
手工查看产物可在 `build/web-debug/` 运行 `python3 -m http.server 8080`，访问
`http://localhost:8080`；按 Ctrl+C 关闭。不要使用 `file://` 打开构建产物。

## 模块边界

| 目录 | 用途 |
| --- | --- |
| `assets/scenes/` | Boot / Dive / Harbor 与稳定 UUID |
| `assets/scripts/battle/` | 纯数据战斗、DiveSession与PauseManager，不引入平台/UI |
| `assets/scripts/meta/` | 预留养成模块 |
| `assets/scripts/ui/` | Cocos HUD与375宽纯布局函数 |
| `assets/scripts/platform/` | 存储、前后台、设备信息契约及浏览器实现 |
| `assets/scripts/services/` | Boot 与后续服务编排 |
| `assets/bundles/` | meta、sunlight、twilight、abyss、social、symbiont 空 Bundle |
| `../shared/` | 可在客户端/服务端复用的纯 TS 包 |

浏览器存储键使用 `abyss-hunter:` 前缀，不清理其他产品的数据；存储受限或配额耗尽时
直接上抛错误，后续 SaveService 负责提示与恢复。生命周期合并 visibilitychange 与
pagehide/pageshow，按状态转换去重，支持退订与 dispose。设备信息每次读取当前窗口；
浏览器 safeArea 读取全屏模板中的CSS环境安全区；微信原生安全区待其实现。

## 微信槽位与发布隔离

`platform/wechat/` 仅留说明。选择微信平台会明确失败，不会回落浏览器。
此阶段只验收 Web；无需 AppID，也不复用原型中的 project.config.json。

当前没有 Mock 实现。未来 Mock 必须置于 `mock/`，使用 `Mock*` 名称、
`isMock: true` 和 `@development-only` 标记；Web release 构建扫描并拒绝这些来源。
Boot 也拒绝模拟平台。测试夹具位于 `tests/`，不在 Cocos assets 构建图内。
微信 release 配置应在阶段三由目标 AppID 的实际编辑器配置导出后提交，避免假配置。
