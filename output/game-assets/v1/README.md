# 潜渊猎手 · MVP 素材 v1-r9

## LOO-70 优化增量

新增15张生产PNG，完整规格、预算和验收边界见 `QUALITY-LOO70.md`；评审图为 `fx-review-r10.png`、`ui-review-r7.png`。两份索引现为200条，原185条保留。复导出与登记使用 `export-loo70.py`、`register-loo70.py`；原MVP说明和r9质量摘要保留为历史基线。

MVP 167/167 项完成美术自检，供组织整体验收。A8、B46、C46、D67全部齐备；P1的18项后置。完整185项索引见 `asset-index-final.csv`，与 `asset-index.csv` 逐字节相同。整体质量、实际包体、检查证据和验收边界见 `QUALITY-SUMMARY-FINAL.md`。

## 本轮新增27项

8精英各含320×320 idle与1280×320四帧swim；4渊主各含768×768主体及512×512鳍/触腕；2种256×256透明中心圆形预警及64×64紫光弹。生产PNG位于 `{bundle}/{filename}`，固定文件名不变。完整提示词与选定关系见 `production-round9.json`，四个带雾/过宽辉光首版已排除。

`boss-layouts/` 记录部件导出的实际根点；`boss-rigs-r9.json` 提供连接点、节点缩放和角度建议，左下原点锚点为(0.5,0.9)。巨鱿可实例化同一长触腕两次。`animation-layouts/` 记录每套swim的共同缩放和眼部定位。6fps为引擎目标，GIF预览约5.88fps。

## 交付包

- `abyss-hunter-mvp-v1-final-production.zip`：完整167张生产PNG与185项最终索引、质量摘要、技术检查、逐轮提示词和本轮预览。可独立解压使用，不需合并旧包。这个包不含高分辨率母版与复导出工具。
- `abyss-hunter-mvp-v1-r9-provenance.zip`：新增27张选定母版、27张生产PNG、8套动画布局、4套部件布局、提示词、导出工具及检查记录。合并到r7完整包+r8增量包之后的素材根目录，可复导出本轮或保留全量溯源。先前140项母版不重复打包；仓库和旧包继续保留。
- 独立附件包括最终CSV、整体质量摘要及关键组合预览。

## 检查与使用

`validate-round9.py 27` 核对全量规格、原140项SHA-256、索引与原清单核心字段、本轮27项字节一致复导出、预警透明中心与部件根点。需要在完整仓库中运行；解压的溯源包需已叠加旧包，并提供原始清单 `docs/潜渊猎手-完整素材清单.csv`。Pillow只检查像素和文件，Swift/CoreGraphics负责图片裁切、缩放、拼版及导出。

`reexport-selected.py` 支持普通192px及精英320px四帧、Boss锚点部件与既有UI导出。仅在需要重新导出时运行；若图像字节变化则标记需要视觉复查。各轮脚本、提示词、检查与旧README继续保留；r8阶段说明见 `README-r8.md`。

`round9-validation.json`、`technical-checks.json` 为实际检查记录；`bundle-stats-final.json` 为未压缩发布的源PNG数量/字节及RGBA8存储估计。`delivery-round9.json` 为两份归档的逐文件SHA-256，归档内容已按原文件字节核对。

已查看本轮深浅底、48px精英、64/32/16px光弹、逐帧、Boss三档摆动及四个375px战场组合。预览图和GIF是美术检查，不是游戏功能实现。原140张PNG逐字节保留，旧批视觉结论沿用此前记录。

Cocos导入、运行时播放、图集合批、RGB扩色、发布压缩、包体与真机性能仍待工程验收。源PNG合计约21.63MiB，main约1.28MiB，不能当作达到发布预算。填充条继续沿用158/159行的128×16及上下0px透明留边裁决。未改产品代码、原型和概念稿，P1与音频未制作。
