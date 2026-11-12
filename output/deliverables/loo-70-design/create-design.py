from pathlib import Path
import json,csv
root=Path('output/deliverables/loo-70-design')
rows=[]
def add(id,cat,use,w,h,frames,style,bundle,mode='必出新图',anchor='0.5,0.5',blend='Alpha',extra=''):
 rows.append(dict(id=id,类别=cat,用途=use,宽px=w,高px=h,动画=frames,风格约定=style,资源包=bundle,实现方式=mode,锚点=anchor,混合模式=blend,备注=extra))
add('loo70_fx_sonar','特效','声波炮：空心刻度环',128,128,'1','青白 #73FFF0；断续声呐刻度，中心全透明','dive',extra='0→280逻辑px直径/360ms；线宽不随扩张失控；最多2环')
add('loo70_fx_torpedo','特效','鱼雷：生物荧光弹芯',64,32,'1','青白核+深青机械鳍；头朝右','dive',extra='显示24×12；穿透不放大弹芯')
add('loo70_fx_arc','特效','电弧：可拼接分形段',128,32,'1','冰蓝 #83DCFF；端点同轴，无黑底','dive',anchor='0,0.5',blend='Additive',extra='端点(0,16)/(128,16)；代码连线抖动，最多6段/链，100ms')
add('loo70_fx_mine','特效','浮雷：荧光囊体+三瓣刺',64,64,'1','薄荷绿 #96F6BA；琥珀预爆点','dive',extra='显示28×28；蓄力缩放0.92–1.08；末200ms橙色脉冲')
add('loo70_fx_wake','特效','鱼雷/敌弹共用气泡尾片',32,16,'1','青白半透明水泡，尾朝左','dive',blend='Additive',extra='0.12s衰减；每弹最多1尾片，禁止200条粒子链')
add('loo70_fx_impact','特效','四武器共用命中荧光爆点',256,64,'4帧横排，每帧64×64，24fps','白核、青裂片、透明外缘','dive',blend='Additive',extra='167ms一次；可染蓝/绿；同时≤24，不遮敌弹')
add('loo70_fx_enemy_dart','特效','敌方扇形弹：尖菱弹芯',32,32,'1','珊瑚橙 #FF8667；暗红描边；头朝右','dive',extra='显示12×12；外观包住实际碰撞圆；尾片低透明，敌我以形状+颜色区分')
add('fx_boss_projectile','特效','渊主泪滴弹','64','64','1','沿用r9紫色泪滴','各原海层','复用+代码',extra='16/32/64现有LOD；橙色危险描边由代码；禁止新增碰撞')
add('fx_bubble','特效','浮雷爆炸气泡与过渡微粒',32,32,'1','沿用现有泡泡','main','复用+代码',extra='爆炸最多8泡；过渡最多12泡')
add('fx_telegraph_amber','特效','危险区域预警',256,256,'1','沿用r9空心琥珀圈','各原海层','复用+代码',extra='范围必须匹配伤害；友方圈不用琥珀色')
add('loo70_ui_hull','UI九宫格','母港/强化/科技/装备/补给/结算共用框',192,192,'1','手绘深蓝搪瓷+钛灰双倒角+暖铜铆钉','meta',extra='L/T/R/B=32/40/32/32px；中央128×120可双轴拉伸；铆钉仅四角；最小192×192；中心不画文字')
add('loo70_ui_hud','UI九宫格','局内仪表条框',128,64,'1','深蓝底，切角钢框，低对比边','dive',extra='L/T/R/B=16/16/16/16；中心96×32；最小128×64')
add('loo70_ui_gold','UI按钮','下潜/升级/确认：琥珀珐琅按钮',192,80,'1','琥珀 #F5B74F；上亮下暗，钢质底座','meta',extra='L/T/R/B=24/20/24/20；中心144×40可拉伸；最小192×80；无文字')
add('loo70_ui_steel','UI按钮','次行动/取消/上浮：钢青按钮',192,80,'1','钛灰边+青色玻璃，禁用仍可辨轮廓','dive',extra='L/T/R/B=24/20/24/20；中心144×40；meta引用公共dive不复制')
add('loo70_ui_socket','UI槽位','挂载与物品孔槽',96,96,'1','凹陷金属槽，中心透明，四角卡扣','meta',extra='L/T/R/B=16/16/16/16；中心64×64；叠原品质框，不拉伸图标')
add('loo70_ui_ribbon','UI九宫格','战果结算/面板标题铭牌',256,80,'1','暗铜翼片+中间深蓝铭牌','meta',extra='L/T/R/B=64/16/64/16；中心128×48；最小256×80')
add('loo70_ui_tech_node','UI图标','科技铆接节点底座',64,64,'1','六角钛灰底，中央留空','meta',extra='不拉伸；32逻辑px显示；点亮/锁定靠代码与现有锁图标')
add('loo70_transition_silt','场景','跨海层水体絮流薄片',256,128,'1','手绘青灰浮尘，非不透明幕布','dive',extra='双向平移+染色；最多2片，alpha≤0.22；可无缝横向拼接')
add('loo70_boundary','场景','真实世界边界：虚线声呐浮标',8,64,'1','青灰虚线+外侧暗化','dive','代码实现',extra='不出图；随世界坐标投影；不以屏幕边当世界边')
add('loo70_background','场景','去除两侧实体岩壁',750,1125,'1','复用三层far，不新增整屏图','各原海层','复用+代码',extra='停用scene.left/right；保留far与非阻挡flora，边缘无石墙')
add('loo70_damage_text','UI字体','伤害/升级/收益飘字',0,0,'代码动画','数字用现有字体缓存；白/金/珊瑚橙','dive','代码实现',extra='非位图交付；≤20组；合并100ms同目标伤害；描边1–2逻辑px')
add('loo70_direction_flip','朝向','36身份镜像与前视策略',0,0,'沿用4帧/6fps或boss骨骼','不镜像文字/血条；镜像美术根节点','各原海层','代码实现',extra='完整映射见direction-audit.csv；本轮无必重绘怪物')
# 条件规格独立，明确不计入当前出图任务
add('loo70_spear_guard_left','朝向备选','仅未来确认固定持械侧时制作左向泳姿',384,96,'4帧横排，每帧96×96，6fps','严格沿用剑鱼游侠；保持头部/武器物理侧','sunlight','条件出图（本轮不制作）',extra='当前素材为生物长吻并非独立持械；右向复用原图；idle取首帧；脚点/中心逐帧对齐')
add('loo70_boss_handed_left','朝向备选','仅未来boss出现固定侧伤口/武器时启用',256,256,'1主体+原rig部件','逐boss单独确认；不可整张烘焙触须','对应原海层','条件出图（本轮不制作）',extra='右向复用；左向主体256×256；fin/触须部件各128×128、1帧、锚点沿boss-rigs-r9对应值；镜像socket并反角，先验证再发单')
add('loo70_harbor_weld_station','场景入口','强化：焊接工作台与独立码头脚墩',115,115,'代码静态','低矮桌体、虎钳、焊枪、斜铭牌；现有icon_upgrade','meta','复用+代码',extra='375逻辑px布局尺寸，非待出图尺寸；x16 y439；固定几何件不九宫拉伸；下载/纹理新增0B；红点12px')
add('loo70_harbor_crane_station','场景入口','装备：高吊臂挂架与独立码头脚墩',96,167,'代码静态','高窄钢柱、斜吊臂、挂钩；现有icon_equipment','meta','复用+代码',extra='375逻辑px布局尺寸，非待出图尺寸；x266 y375；固定几何件不九宫拉伸；下载/纹理新增0B；红点挂铰接处')
add('loo70_harbor_sonar_station','场景入口','科技：圆形声呐实验台与独立码头脚墩',107,102,'代码静态','圆盘、短天线、铜铭牌；现有icon_tech可用于选中态','meta','复用+代码',extra='375逻辑px布局尺寸，非待出图尺寸；x148 y476；固定几何件不九宫拉伸；下载/纹理新增0B；盘沿红点')
with (root/'asset-list.csv').open('w',encoding='utf-8-sig',newline='') as f:
 w=csv.DictWriter(f,fieldnames=rows[0]);w.writeheader();w.writerows(rows)
j=json.load(open('game/sea-assets.json')); audit=[]
front=['moon_jelly','comb_jelly','royal_jelly','sea_spider','deep_starfish','glass_sponge','tube_worm','siphonophore','ghost_jelly']
for k,v in j['identities'].items():
 a=next(x for x in j['assets'] if x['key']==v['idle']); frontal=any(k.endswith(x) for x in front)
 audit.append(dict(id=k,海层=v['layer'],类型=v['kind'],现图=a['sourcePath'],原图尺寸=f"{a['width']}×{a['height']}",朝向策略='前视保留+移动倾斜≤8°' if frontal else '按速度水平镜像美术根',新图='无需',备注='boss整体镜像含socket/部件；血条独立' if v['kind']=='boss' else '源图头朝右；不以玩家位置每帧翻转' if not frontal else '放射/前视结构，不强造左右头向'))
with (root/'direction-audit.csv').open('w',encoding='utf-8-sig',newline='') as f:
 w=csv.DictWriter(f,fieldnames=audit[0]);w.writeheader();w.writerows(audit)
