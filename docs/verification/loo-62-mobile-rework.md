# LOO-62 独立复验返修报告（2026-11-11）

实现提交 `906d5e690243a60adc11314f899d578fc3ec81de`，分支 `loo-62-mobile-combat`，返修基线 `d5b527c7829eab2b8dc93d031c6e00bbdd5fc5ba`。后续报告提交不改变运行源码。

**更正首轮结论：** dangerZones只是声呐AI避让元数据，不造成玩家伤害。先前“红区会伤害/真实伤害边界一致”的提示与报告错误，已撤回。320px首轮实际按钮高37.55CSSpx，“至少44CSSpx”的结论同样错误。首轮历史报告已加明确更正说明；本报告取代这三项的旧结论。

## 本轮三项交付

| 返修项 | 实现与验证 | 结果边界 |
| --- | --- | --- |
| P1 虚假区域伤害 | 删除固定AI避让区的红色斜纹、警号与伤害教学；正常/教程、高/低档、新存档/刷新恢复均核对。向HUD提供/不提供同一AI元数据，世界Graphics绘制指令完全相同，避免仅改文案留红区。原Session在(135,400)隔离怪物后推进180个真实固定步，HP200→200、元数据仍存在；不是预置扣血或新增伤害。 | 自动化通过；没有新增环境扣血、伤害频率或数值。原声呐避让、岩礁碰撞、敌人伤害和低氧警报保留。 |
| P2 真实CSS触摸尺寸 | 控制器传入实际CSS视口，按CSS高度/可见逻辑高度换算；不把DPR当CSS缩放。七个关键动作均从真实UITransform世界边界与canvas DOM矩形独立测量。320px及44/34安全区、375/390px、667×375/844×390横屏、375×400短屏，DPR1/3均验证；按钮和可移动排除区仍使用同一layout。 | 320px五个常驻/供氧动作及两模态动作均高44CSSpx；375px动作44/模态48，390px动作45.76/模态49.92；横屏和短屏关键动作均至少44。并验证边界、安全区及模态多行文字可容纳。 |
| P2 圆饼岩礁 | 用不规则切面轮廓、亮顶面/暗侧面、沉积层及矿物碎斑表现岩体体积；不再绘制32边圆饼。高低档同一基础岩体，320CSSpx近距离/绕行截图均采集。 | 视觉已改善，是否充分达到用户审美由独立复验/项目经理判断；不冒称新玩家实验通过。 |

岩礁碰撞保持原圆心、半径34/46、玩家半径12。每条主要岩面与原碰撞圆相切；尖角是装饰，最大径向外延小于14%（最大半径46时<6.4逻辑单位，320px约5.5CSSpx），角尖可有此范围的视觉交叠，不声称像素级碰撞。真实Session输入靠近第一块岩礁停在(70,132)、中心距48；随后横移再下潜到(166,244)，从侧面绕过，未改碰撞参数。几何按障碍对象缓存，Graphics绘制，无新增逐弹/逐帧节点。

## 证据与回归

- 先读LOO-59最新完整报告及原始数据，用Multica CLI另行下载报告；原 `independent-mobile-d5b527c` 文件未改，关键报告/JSON/图片/录像SHA随包保留。
- 新返修场景在原构建先RED3/3：两档仍绘制AI区；320px真实暂停按钮55.47×37.55CSSpx。修复后GREEN3/3。几何回归验证岩面/圆碰撞对应及角尖上限。
- 只读审查发现844×390模态正文高23.28逻辑单位不足3×14行高，补真实救援文案夹具复现后修复；375×400也纳入验证。紧凑按钮/字号使用CSS尺寸，短屏不显示大教程面板；真实救援/奖励状态转换仍由原声呐广告回归验证。正文夹具不用于证明奖励或伤害机制。
- `npm test`：148/148；`typecheck`（含shared）、`typecheck:battle`、`typecheck:services`通过。
- Creator3.8.8 release/debug均exit36；最终release清单sourceDirty=false、target=web-release、revision为906d5e6，构建时间2026-11-11T04:45:05.334Z。393个产物文件额外扫描开发广告标记为0。
- 本地最终浏览器回归：12个用例全部取得通过结果（原组合命令先完成11项，额度中断时最后的教学尚在运行，未把该命令报成完整通过；恢复后单独重跑教学1/1通过）。覆盖局内、经济/刷新/结算、全区域输入/镜头、高低档四武器、三项返修、高低画质、声呐/供氧/救援及教学。教学激活墙钟73.570秒，测试主体77.162秒。
- debug开发入口：1/1，供氧真实领奖、额度和刷新重新挂载通过。仍依赖既有未跟踪驱动，未将其顺带提交或宣称干净克隆七槽位已通过。
- 性能：最终906d5e6构建高低档2/2通过；M2 Max / Darwin arm64 / Node24.5.0 / Chrome157.0.8103.40 / ANGLE Metal，375×812、DPR2、headless，无其他本轮浏览器回归同时运行。各档420次rAF、419个间隔，高/低rAF间隔p50为16.60/16.70ms，p95为19.80/19.70ms，p99为20.90/20.70ms；session.advance同步逻辑段p95为0.90/1.00ms。两档对象峰值80/200/100/30，最低值分别77/188/98/30及75/188/98/30，droppedSteps=0。原始样本和GPU/UTC时间随包；逻辑段不含HUD/GPU，未采FPS，不保证60fps或真机性能。

所有本轮屏幕/输入均为桌面Chrome模拟，不冒充物理手机。AI区180步是隔离逻辑夹具，岩礁靠近/绕行是原Session固定步输入，四武器是展示夹具；教学另用真实墙钟，不混作真人/真机自然操作。

## 公网交付

原项目 https://abyss-hunter-playtest.pages.dev/ 已实际部署本轮实现；不可变入口 https://d37e90f1.abyss-hunter-playtest.pages.dev/ 。2026-11-11T08:13:56–57Z核对两入口首页/清单均HTTP200，清单与本地逐字节一致，revision=906d5e690243a60adc11314f899d578fc3ec81de、sourceDirty=false。首页SHA256均为 `a0ebc5d95ee02a1dfa864c13e246cc67445bd888bd5c9b1fe16ae5a3a996ef90`，清单SHA256为 `06d8a57f86b4bf9e1ccffeac29b079f4c2ed9cd84965c8efaf9414b230d3c5a6`。Pages的main只是原预览项目的部署分支标签，未改变Git main。

公网新增返修回归3/3通过，高/低档正常/教程与新建/恢复均无虚假AI红区表现；实际UITransform换算的七个目标在两种DPR和六个视口均达到44CSSpx，岩礁靠近/绕行截图已重新采集。公网全区域输入/单主指/按钮排除/镜头/取消/生命周期1/1通过。

另在公网原Session作墙钟复核，只隔离刷怪/敌人并移到原AI区中心(135,400)，不改HP、伤害、时钟或控制器。2026-11-11本轮结果：墙钟6114ms（含截图开销）、tick4→187、氧气119.8667→113.7667、HP200→200、state=Running、pause=[]、AI元数据保留；没有错误伤害教学和红区表现，pageerror/requestfailed均0。JSON与原始WebM/MP4、前后截图随包。它证明机制没有被新增伤害改变，不冒充自然游玩或真机操作。

`playtest-version.json`记录实现SHA、sourceDirty、target、Creator版本及构建时间。先验证本地和线上清单一致，再验证首页SHA与实际线上语义/触控，不以“源码已改”代替发布证据。旧e0d8e5f部署与原始错误证据保留。

附件对比图：AI区/320px供氧按钮左旧右新；岩礁图左旧、中新高档、右新低档（低档DPR3原图另存，比较图缩到320CSSpx）。证据ZIP含原始JSON、截图、测试日志、性能样本和前轮失败证据引用；release ZIP根目录为index.html，可直接静态托管。

## 重建与后续

在 `game/` 下、Node24.5.0和Creator3.8.8已就绪时：

```sh
npm ci
npm test
npm run typecheck
npm run typecheck:battle
npm run typecheck:services
npm run build:web:release
WEB_TARGET=web-release node --test tests/mobile-rework.smoke.mjs
WEB_TARGET=web-release npm run test:mobile:web
WEB_TARGET=web-release npm run test:sonar:web
WEB_TARGET=web-release npm run test:tutorial:web
WEB_TARGET=web-release PERF_HEADLESS=1 npm run test:perf:web
```

`MOBILE_URL=https://abyss-hunter-playtest.pages.dev/` 可使新返修用例检查线上同一构建。`REWORK_PHASE`只控制证据输出目录，不改断言或游戏规则。

本轮battle与shared相对d5b527c无差异，原输入/镜头/武器规则保持。main、旧tag、重复GameFirst目录及预存未跟踪文件均未改；一次性wakeup已自动disabled，无周期工作待关闭。GitHub CLI仍未登录，不虚构PR或启动登录流程。未解决LOO-58的旧Mock缺文件、自然成长、Pool.some、局长或微信适配缺口。

Android/iOS Safari真机未验证；微信工具版本对齐但登录过期。本轮交in_review，由项目经理复用既有LOO-59针对这三项续派复验，不自动关闭LOO-61或宣称阶段一验收完成。
