# LOO-56 三海层内容集成实施计划

目标：基于累计基线 6268158 接入交接中已有设计和素材，实现 0–2400m 内容循环。

架构：保留 Cocos 3.8.8、30Hz 无平台依赖 battle、双槽本地存档及情境广告。battle 中维护配置身份、深度带、Boss与裂隙；UI 通过独立 Bundle 租约加载素材；养成快照生成真实潜航参数。采用既有设计而不另建框架。

约束：源稿只读；使用 asset-index-final.csv 和 boss-rigs-r9.json 的真实键；sunlight/twilight/abyss 独立；4帧6fps；单纹理≤2048；同 diveId 恢复且 Boss 奖励幂等；死亡只丢荧晶。微信真实平台验收仍为后续阶段。

## 实施任务

- [x] 战斗内容：新增 battle/SeaContent.ts，导出 SEA_LAYERS、ENEMY_CATALOG、layerAtDepth(depth)、enemyByKey(key)。身份字段 assetKey、layer、kind、name；Enemy 增加 assetKey、attack、spawnDepth。按100m带读取强度与掉落；800/1600 Boss 阻挡下行，击杀解锁，2400最终Boss与深渊额外巨鲸。DiveSession 检查点保存 Boss/裂隙状态。先写数值、刷怪、边界、幂等、旧存档恢复测试，再实现并跑回归。
- [x] 素材导入：tools/prepare-sea-assets.py 从真实索引创建各层 game/assets/bundles/{layer}/content，包含场景、敌人swim、Boss主体/部件，main公共潜艇；稳定meta，导入映射和RGBA内存预算，源哈希核对、36身份及4帧检查。映射写 game/sea-assets.json，rig映射写UI配置。
- [x] 养成战斗：services/local/CombatLoadout.ts 将六属性、科技和已装备装备投影为 DiveOptions/battle 参数；四武器读配置；仅新潜航应用，恢复沿用检查点。测试真实伤害、冷却、位移、HP/舱容/氧气、装备与科技效果。
- [x] Bundle与渲染：ui/SeaBundleLease.ts 测试相邻预取、远层释放、异步过期回调和销毁；ui/SeaWorldView.ts 读取实际sprite，按tick切4帧，Boss使用r9连接点。DiveHud保持原安全区、暂停、声呐和广告操作，显示层/裂隙/加载失败与重试。
- [x] 验收：npm test、全量及battle/services类型检查、Cocos debug/release构建、现有浏览器回归、新三层实际构建截图与Boss组合截图；记录下载字节与纹理估算、真实成长后推深和母港往返。限定范围提交并将 issue 置 in_review。

## 重点风险与验证

1. 快速跨层/返航销毁时异步加载不得重新持有已释放资源：逆序完成与dispose测试。
2. Boss击杀后刷新或同局再次到边界不得重复刷出或发奖：检查点恢复测试。
3. 旧P1-06检查点恢复保持广告token和原武器/HP参数：兼容恢复及情境广告回归。
4. 800/1600/2400边界的层归属与n=24上限一致：边界值测试和构建截图。
5. 舱满、低氧与死亡后稀有奖励不丢失：沿用结算测试并加入Boss奖励用例。
