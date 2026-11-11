# LOO-64 游戏界面与潜航体验交付

提交复验，尚未经项目经理/LOO-65 独立验收。实现 `8aba77fcfa28e968e1e0bb70e0264d050dfd93ea`，分支 `loo-64-dive-experience`，基线 `81a2f8c`（包含 `906d5e6`）。保留上一轮移动输入、相机、弹体、CSS 触摸尺寸、AI 避让区语义和礁石修复。没有发布公网、合并 main、覆盖 tag 或改动独立验收报告。

## 五项结果

| 要求 | 实现和证据 |
| --- | --- |
| 全部面板游戏化 | 新增共享 `PanelSkin`：切角钢板、内凹边缘、金属刻线、角钉和暖金行动层级。母港与强化、科技、装备/合成、补给、任务、档案、海报、加载/错误，以及潜航暂停、结算、死亡/救援、低氧、广告/奖励、断线/后台/倒计时、海域加载均接入；按钮有按下/选中/不可用状态。对比图与 `comparisons.html` 使用未修改内容的真实 release 截图。 |
| 母港层级 | 顶部标题/等级与货币，中央船体/航图，任务与档案次入口，底部唯一“下潜”主按钮和四个养成入口。馈赠/祝福/声呐进入补给；教程引导不再覆盖船体或另设出航。新存档和已成长存档均验证。 |
| 手动出水返港 | 必须曾下潜；到达 0m 的逻辑步不触发，在后续步骤主动继续向上 0.35 秒才安全返航。出生 0m、松手、自动声呐上浮、暂停/广告/死亡不误触；原安全结算/存档路径不变。实际触摸录像与 `surface.json`：潜至约 300m → 上浮 0m → 松手停留仍 Running → 再上推 → Settled；17 荧晶、2 珍珠入账；刷新钱包相同。 |
| 清理无语义圆形 | 拾取圆点改为多面晶簇；水雷中心改为金属雷罐、端盖、触角、灯；裂隙椭圆改为破裂岩门/通道。敌人、精英、Boss、船体继续用现有序列帧；已有不规则切面岩礁保持。高低档均保留完整物体轮廓。 |
| 岩壁移动 | 共用 WorldProjection 镜头的绝对深度。近景 0.78、远景 0.18 倍滚动；相邻瓦片交替镜像并重叠 2 逻辑像素以消除接缝。下潜向上、上浮向下；静止坐标不变。799/800/801、1599/1600/1601 及近景循环边界和窄屏重排有真实场景截图/数据，纯函数覆盖正负相位和连续性。 |

## 面板与素材清单、参考

设计和实施前清单见 `docs/superpowers/specs/2026-11-11-loo-64-design.md`。借鉴 [DREDGE](https://store.steampowered.com/app/1562430/DREDGE/) 的港口功能分区、船体中心和出航主行动，以及 [DAVE THE DIVER](https://store.steampowered.com/app/1868140/DAVE_THE_DIVER/) 的场景优先与紧凑状态层级；这是设计取舍，不是素材临摹。没有复制两款游戏的美术。

| 可见物体 | 修改前 | 修改后 / 来源 |
| --- | --- | --- |
| 普通敌人/精英/Boss | 已接入真实贴图/泳动序列 | 保留既有 SeaArt、legacy 身份映射、Boss 拼接与加载回退；无色块回退 |
| 船体 | 既有原创 H-01 | 保留，同一镜头投影 |
| 固体障碍 | LOO-62 不规则多面礁石 | 保留 ReefRock 轮廓、碰撞和高低档材质，无数值改动 |
| 荧晶掉落 | 3 逻辑像素实心圆点 | 原生向量晶簇、独立明暗晶面与高光；`DiveHud.drawWorld` |
| 水雷 | 球心加触角 | 原生向量压力雷罐、黄铜端盖、四触角、青色示灯；`DiveHud.drawWorld` |
| 开放裂隙 | 椭圆线 | 原生向量岩门边柱与发光门槛；`DiveHud.drawWorld` |
| 气泡/悬浮物、摇杆、深度游标、声波/爆炸范围 | 有明确语义的圆形 | 保留，不错误替换；无虚构伤害范围 |
| 岩壁/远景/珊瑚 | 固定场景 Sprite | 使用同一既有 SpriteFrame 组成三条镜像瓦片；每层固定 12 个场景节点，无逐帧节点创建 |

新增物体素材均为原创、可重建的 Cocos Graphics 向量绘制，没有新增位图，因此没有新增透明边缘、位图授权或图集导入项；原有透明贴图、自动图集及资源清单测试全部通过。高低档区别仅保留既有粒子/飘字开销差异，不把物体降回色块。

## 窄屏、短屏与审查修正

320×640（44/34 CSS px 安全区）、375×667、390×844、375×400 真实 Cocos UITransform→canvas DOM 测量通过。母港使用真实 CSS 视口补偿，关闭/强化及其它关键目标至少 44 CSS px；潜航七动作沿用并复验上一轮 DPR 1/3、横屏、短屏的测量。

一次独立只读审查发现两个 P2，并完成 RED→GREEN：

1. 母港加载/错误页曾遗漏补偿，retry/safe-dive 实测 40.96 CSS px；现以同一 safe-area/layout/viewport 算法重排，两者实测恰为 44 CSS px。测试阻断真实 meta 资源请求，随后放行并实点重试成功。
2. 短屏曾把虚拟列表嵌入另一纵向 ScrollView，普通上滑无法完整露出最后一行。现列表面板只有一层纵向滚动；375×400 连续真实 CDP 触摸上滑，氧效按钮 CSS 顶/底约 258.58/306.58，高 48px，完整可点。短屏装备把列表/详情和三合一确认分开，保留逐件消耗/返还预览；实际选择主件/两辅料、确认合成后数量减少 2。海报/档案单独使用内容滚动，关闭固定可达。

未留下待修复的审查项。原始失败日志和最终通过日志一同保留。原始单测基线 148/148；第一次全量运行有四条资源测试因测试加载器未登记新纯函数模块而失败，已补齐真实依赖并全绿。旧教程/广告脚本指向已删除的首页重复入口，已改走实际“强化/下潜/补给”路径后重跑通过。

教程兼容选择：允许提前手动安全返港，按真实货物入账；未完成原教学步骤不提前授予 500 荧晶。完成教学的原 500 奖励、重放不重复、养成后再出航规则保持，真实时间六步流程通过。

## 命令、版本与结果

在 `game/` 执行，Node 24.5.0 / npm 11.5.1，Cocos Creator 3.8.8（项目锁定指纹核对成功）。

| 命令 | 最终结果 |
| --- | --- |
| `npm test` | 155/155 |
| `npm run typecheck`、`npm run typecheck:battle`、`npm run typecheck:services` | 全部退出 0 |
| `npm run build:web:release` | Creator exit 36，包装脚本退出 0；清单 revision=`8aba77f`、sourceDirty=false |
| `node --test tests/experience.smoke.mjs` | 6/6：完整面板/已成长存档、双档素材/岩壁、加载失败恢复、真实短屏滑动/装备合成、手动返港/刷新 |
| `WEB_TARGET=web-release node --test --test-concurrency=1 tests/harbor.smoke.mjs tests/dive.smoke.mjs tests/mobile-controls.smoke.mjs tests/mobile-rework.smoke.mjs` | 6/6；最终短屏修正后额外重跑 harbor 1/1 |
| `WEB_TARGET=web-release node --test --test-concurrency=1 tests/sonar-ads.smoke.mjs tests/tutorial.smoke.mjs` | 2/2；教程为真实时间，含首奖/刷新/海报下载/重放 |
| `WEB_TARGET=web-release node --test tests/economy.smoke.mjs tests/sea-content.smoke.mjs tests/combat-presentation.smoke.mjs` | 5/5，包含完整浅海养成→深海与资源更替 |
| `WEB_TARGET=web-release PERF_HEADLESS=1 node --test tests/perf-stress.smoke.mjs` | 高低档 2/2，80/200/100/30 满载；p95 帧间隔 19.5 / 19.6ms，逻辑段 1.1 / 1.0ms |

首次性能启动恰遇并发构建清空输出，HTTP 加载失败；该轮没有性能结论。构建结束后完整重跑 2/2，报告只采用最终数据。环境与每帧采样在 perf JSON。桌面 macOS/Chrome 浏览器模拟，不代表 Android/iOS Safari 真机或微信性能。微信工具登录过期；本任务是浏览器构建，未执行微信开窗、发布或云资源写入。

## 交付与复验入口

代码已推送；[LOO-64 对比](https://github.com/loongwind/GameFirst/compare/loo-62-mobile-combat...loo-64-dive-experience)。GitHub CLI 未登录，`gh pr create ... --body-file docs/LOO-64-pr-draft.md` 退出 4，实际没有 PR；PR 草稿随代码及附件提供，没有更改全局身份。

附件包括：首页/强化/补给/物体的 PNG 对比，母港各面板对比 HTML，手动返港完整 MP4、岩壁运动 MP4、原始高低档/窄屏/短屏截图、JSON/日志、release zip、版本清单与 SHA256。release zip 解压后可用本地 HTTP 服务打开，未将其冒充公网更新。

既有公网仍为上一轮版本；本任务不复用部署授权。LOO-59 固定证据未覆盖；新交付应由项目经理安排 LOO-65 独立验收，不自行关闭父任务或将五项反馈称为最终验收通过。
