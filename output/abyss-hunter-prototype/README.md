# 潜渊猎手交互原型 v1

浏览器直接打开 `index.html`。无需服务器、构建步骤或联网。左侧换页，画布内点击，右侧检查低氧、救援、断网、四态和不同屏幕高度。首次直接进入日光层教学。

小程序本地预览：微信开发者工具导入本目录，替换 `project.config.json` 的游客appid为可管理的测试号。`pages/prototype/index.wxml/.wxss/.js` 是原生Canvas预览壳，与网页共用 `shared/model.js` 和 `shared/view.js`。不调用真实广告、云服务、好友数据，不发布。正式产品请按 Cocos 技术选型实施。

- 设计说明：`docs/潜渊猎手-原型设计与交互说明.md`
- 素材清单：`docs/潜渊猎手-完整素材清单.csv`（185文件，MVP167 / P1 18）
- 素材交接：`docs/潜渊猎手-素材制作交接.md`
- Cocos结构：`cocos-ui-map.json`（结构契约，非引擎序列化文件）
- 验证证据：`VALIDATION.md`、`evidence/`

原型中的三张概念图从 `output/imagegen/abyss-hunter-v1/` 原样复制。全部交互使用本地样例；战斗是概念背景加交互HUD，摇杆演示输入反馈，无敌人AI、碰撞或可移动的独立潜航器。不要将原型参考图打入正式游戏。

验证：

```sh
node --test output/abyss-hunter-prototype/tests/model.test.cjs
python3 output/abyss-hunter-prototype/asset-manifest.py
# 浏览器检查需要已有 playwright 与 Chrome；CHROME_PATH 可覆盖默认macOS路径。
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright node output/abyss-hunter-prototype/tests/browser.cjs
```

素材清单脚本只输出CSV，绝不生成图片。所有依赖都不进入运行时。网页支持本地file URL；如使用HTTP只需普通静态服务器。目录中的 `project.private.config.json`、验证日志与截图由本地工具产生，按版本控制清单选择性收录。
