# 潜渊猎手 · MVP 素材 v1 · A 批阶段交付

本轮完成 7/167 个 MVP 文件。A 批共 8 项，主按钮尚未通过，故 A 批未完成，B/C/D 均未扩批。P1 的 18 项未制作。原素材清单与交接文档未改动，未修改项目产品代码，也未覆盖三张概念参考。

## 已交付

| CSV 实际行号（含表头） | 文件 | 规格 | 背景 |
|---|---|---|---|
| 18 | `main/bg_sunlight_lite.png` | 512×1024 | 完全不透明 |
| 19 | `main/hero_h01_idle.png` | 512×512 | alpha |
| 24 | `sunlight/enemy_normal_01_moon_jelly_idle.png` | 192×192 | alpha |
| 26 | `sunlight/enemy_normal_02_lantern_angler_idle.png` | 192×192 | alpha |
| 28 | `sunlight/enemy_normal_03_electric_eel_idle.png` | 192×192 | alpha |
| 116 | `meta/icon_crystal.png` | 96×96 | alpha |
| 127 | `main/icon_oxygen.png` | 96×96 | alpha |

全部 PNG、sRGB；透明素材保留至少 8px 全透明边缘。采用内置 image_gen 分别生成，再以原生 CoreGraphics 从同一母版等比缩小、居中留透明边，不拉伸，不用程序重绘角色。原生母版见 `source-masters/`；PNG 技术检查见 `technical-checks.json`。背景 PNG 具有 RGBA 通道，但 alpha 全为 255，符合不透明要求。

## A 批自检与未通过项

已查看 `batch-a-review.png` 的 375px 宽组合预览与深/浅两种底色：H-01 保留单圆青色舷窗、双武器舱、双侧翼和左后青色推进器；按 CSV 朝右 3/4 侧视。象牙白装甲为主、橙色为辅、青色集中于玻璃和推进器，未加驾驶员。三种敌人在 48px 画布预览中可区分水母伞盖、鮟鱇灯笼和电鳗长身。氧气瓶与荧晶另附 24px 预览。未见烘焙 HUD、文字、水印、棋盘背景或明显黑白边。

CSV 第 154 行 `ui_button_primary.png` 未通过：两次青色生成均有中心 alpha 空洞；第三个深色候选虽消除明显空洞，但不符合青色主按钮方向，也未验证平色九宫格中心。因此没有把任何候选放入 `main/`，不以深色按钮自行替代。失败图保留在 `rejected/` 供续作核对，不是生产资源。下轮先修此项，检查 160×80、透明边≥8px、左右32/上下24px九宫格中心平色，再完成 A 门槛后进入 B。

## 索引与续作

`asset-index.csv` 与原清单一一对应，共185行任务，保留原 id、文件名、Bundle、锚点、动画及备注，并补充原 CSV 行号、状态、实际尺寸、alpha、母版、提示词键、生产版本。7项 `self_check_pass`，1项 `failed_rework`，159项 MVP `pending`，18项 `deferred_P1`。MVP 总剩余160项；不是已有7种生物动画，三种 swim 横条仍待制作。

`production-prompts.json` 记录每次 image_gen 完整提示词（包括失败迭代）。三张参考位于 `output/imagegen/abyss-hunter-v1/`，分别为母港、日光战斗、深渊渊主；主角参考三张，生物参考日光/深渊，图标参考母港。

`export-assets.py` 调用 `export-png.swift` 复导出与验证，Pillow 仅读取像素做检查，不生成或编辑图像。`make-preview.swift` 只制作验收拼版。复导出会将视觉状态重置为待检查，须重新查看预览后更新索引。

这7张是独立静态美术源资源；未做 Cocos 导入、动画循环、图集合批、发布压缩、真机表现或性能验证。当前 main 源 PNG 总量约0.84MiB，尚未达到首包资源0.7MiB目标；发布前仍需工程缩放/压缩，不能把本次 PNG 体积当作最终包体。
