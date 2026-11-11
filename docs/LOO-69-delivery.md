# LOO-69 数值显示：母港战斗属性与装备/武器数值面板

分支 `loo-68-stats-display`，基于 `loo-66-ads-difficulty@3191053`。实现提交 `06cb9a3`，部署清单 revision 同值、sourceDirty=false。

## 数值单一来源

`CombatLoadout` 重构为 `combatProjection(state)`：一次投影同时返回潜航 options、四槽解析结果（含旧存档回退）、五系科技总量与四类辅件总量；`combatLoadout` 变为其薄封装，战斗与展示共用同一推导，无第二套公式。新增纯展示模块 `meta/loadoutStats.ts`：

- `combatReadout`：生命上限、移速（米/秒，`playerSpeed/40`）、舱容、氧耗（每秒）、续航（秒）、拾取（米）与两把主武器的伤害 / 间隔（`cooldownTicks×1/30` 秒）、次每秒、射程（米，`range/40`）、品质等级增益、机制文案。
- `summaryLines` / `sourceLines`：强化面板顶部「当前战斗数值」摘要与来源构成行；拾取按「基础 0 米 + 特殊科技 + 磁吸器 = 总计」展示，避免把 0 当异常。
- `attributePreview`：六条强化行的升级前后实际派生值（伤害取整、间隔两位小数、速度/距离一位小数，舍入会掩盖变化时自动加一位精度；30Hz 取整导致本级无变化时标注「本级不变」）。仅作用于显示，不写回存档。
- `itemDetail` / `itemKeyStats` / `slotReadout`：装备明细（伤害/间隔/射程 + 机制：环型扩散 / 直线穿透 / 连锁 4 跳与连锁距离 / 爆炸与触发半径 + 增益构成「基础 10% + 品质 X% + 等级 Y%」）、背包行摘要、槽位卡数值（空槽显示默认武器声波炮/鱼雷巢及其数值）。
- `equippedState` + `equipComparison` + `comparisonLine`：以纯函数构造「装到当前槽后」的假设状态再走同一投影，输出伤害/间隔/射程（辅件为对应增益）当前→装配后；槽型不兼容时只给提示不出对比。

装备名更新为 PRD 官方名（声波炮/鱼雷巢/电弧链/诱饵浮雷/探照灯/潜流鳍/装甲片/磁吸器）。

## 界面改动

- `HarborView.upgrade`：滚动区外新增固定「当前战斗数值」卡（8 行文本 + 来源 2 行），强化列表下移；行内数值由裸倍率改为派生值变化。
- `HarborView.equipment`：槽位卡增高为三行（名称/数值/间隔）；选中装备显示成本行、明细 2–3 行、对比行（不兼容为红色提示）与操作按钮；背包行新增数值摘要行；紧凑高度返回按钮避免与合成按钮重叠。

## 验证

- `npm test` 167/167（新增 `tests/loadout-stats.test.mjs` 6 项：与 combatLoadout 逐项一致、品质/等级、科技、辅件、槽位解析、对比与预览、摘要/来源/机制文案）。
- `npm run typecheck`、`typecheck:battle`、`typecheck:services` 全部退出 0。
- 新增 `tests/stats-display.smoke.mjs`（`npm run test:stats:web`）：320×640 / 375×667 / 390×844 三视口，断言面板文本与 Node 侧同一编译产物逐字一致、对比随槽位切换更新、不兼容提示、列表滚动到底（Row-5 可达）、摘要行两两无重叠；web-debug 与 web-release 双构建均通过，证据在 `game/.artifacts/loo-69/`。
- 既有回归 web-debug 与 web-release 双构建：harbor / dive / mobile-controls / economy / sonar-ads / tutorial 全部通过；`npm run test:preview:web` 7/8（唯一失败见「已知边界」）。

## 已知边界

- `preview-ads.smoke` 的 375×667 用例在本地时间约 22:30 后会稳定失败：夹具把 `adClock` 设为真实时间，跨业务日边界后声呐耗尽日与潜航 +2 天日重合，`sonarRefreshable` 变 false。把夹具时钟回拨 8 小时后该用例完整通过（见诊断记录），与本次改动无关（改动未触及广告/潜航代码）；修复夹具时钟属 LOO-67 范围，未在本次擅改。
- 未验证平台：iOS Safari、Android/微信真机、人工试玩。
- 仓库无 GitHub CLI 登录，PR 由人工转换；compare：https://github.com/loongwind/GameFirst/compare/loo-66-ads-difficulty...loo-68-stats-display

## 发布与回滚

仅使用既有 Cloudflare Pages 项目 `abyss-hunter-playtest`，部署产物 web-preview：

- 不可变 URL：https://8ffd170f.abyss-hunter-playtest.pages.dev
- 主入口：https://abyss-hunter-playtest.pages.dev （同步更新）
- 清单：revision=`06cb9a3c73e1e6a2b6dce380f06bfc19552539bd`、sourceDirty=false、target=web-preview、simulatedAds=true。
- 两个入口的 `index.html` 与 `playtest-version.json` SHA256 与本地一致（index `7672186d…`、清单 `1de1eff1…`）；已在 Chrome（Playwright，375×667）实际加载线上场景：强化面板摘要、演示标识均在线呈现，无页面错误（`live-check.json`、`live-*.png`）。
- 回滚：Pages 项目选择上一部署 `87dde617`（LOO-67）。
