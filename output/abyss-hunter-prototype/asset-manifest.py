"""输出交给图片生成助手的逐文件清单；本脚本不创建任何图片。"""
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
rows = []
def add(key, phase, group, name, purpose, w, h, alpha='是', bundle='meta', style='UI', anchor='中心 0.5,0.5', animation='静态', notes=''):
    rows.append(dict(id=key,阶段=phase,类别=group,文件名=name,用途=purpose,宽px=w,高px=h,透明=alpha,
                     锚点=anchor,动画=animation,风格约定=style,参考图='01母港/02日光/03深渊，见美术交接文档',资源包=bundle,备注=notes))

for layer, label, bundle in [('harbor','母港','meta'),('sunlight','日光层','sunlight'),('twilight','暮光层','twilight'),('abyss','深渊层','abyss')]:
    ref='HARBOR' if layer=='harbor' else 'SUN' if layer=='sunlight' else 'TWILIGHT' if layer=='twilight' else 'ABYSS'
    add('bg_'+layer,'MVP','场景',f'bg_{layer}_far.png',label+'远景无UI底图',1024,1536,'否',bundle,ref,notes='边缘可裁；无角色、敌人、弹幕、文字；日光层另做首包简版')
    for side in ['left','right']:
        add('reef_'+layer+'_'+side,'MVP','场景',f'deco_{layer}_{side}.png',label+'边缘礁石/港口结构',384,1536,'是',bundle,ref,'底部中心 0.5,0',notes='中心通行区域留空；不可拼出封闭海底地面')
    add('flora_'+layer,'MVP','场景',f'deco_{layer}_flora.png',label+'前景珊瑚或港口荧晶箱装饰',512,512,'是',bundle,ref,notes='独立摆放；光晕不超过形体边缘16px')
add('bg_sunlight_lite','MVP','首包','bg_sunlight_lite.png','首潜简版日光层',512,1024,'否','main','SUN',notes='优先生产；不包含后续海层与UI；原始素材仍需压缩后按预算验收')
add('hero_ship','MVP','主角','hero_h01_idle.png','象牙白橙色H-01潜航器标准立绘',512,512,'是','main','HERO',notes='朝右3/4侧视；单圆形青色舷窗、双小翼、双武器舱、青色后推进器不可改变')
add('hero_harbor','MVP','主角','hero_h01_harbor.png','母港大尺寸停泊展示',768,768,'是','meta','HERO',notes='同一潜航器放大精修，无吊索/船坞背景')
add('hero_damaged','MVP','主角','hero_h01_damaged.png','受损及救援状态',512,512,'是','main','HERO',notes='轻微擦痕与熄灭推进器；完整轮廓，不含碎裂血腥')
add('hero_diver','MVP','主角','npc_diver_harbor.png','母港微Q橙衣潜水员',384,512,'是','meta','HERO',notes='圆青色面罩、橙色衣；头身约1:2.5')
add('hero_avatar','MVP','主角','avatar_diver.png','等级头像',128,128,'是','meta','HERO',notes='仅人物头像，不生成圆框或文字')

normal = [
('sunlight','moon_jelly','月光水母'),('sunlight','lantern_angler','灯笼鮟鱇'),('sunlight','electric_eel','电鳗'),('sunlight','needlefish','银针鱼'),('sunlight','hermit_crab','寄居蟹'),('sunlight','glass_shrimp','玻璃虾'),('sunlight','moon_snail','月亮螺'),('sunlight','comb_jelly','虹栉水母'),
('twilight','ribbon_eel','飘带鳗'),('twilight','umbrella_octopus','伞章鱼'),('twilight','hatchetfish','银斧鱼'),('twilight','lantern_shrimp','灯笼虾'),('twilight','crystal_crab','晶甲蟹'),('twilight','blue_ring_squid','蓝环鱿'),('twilight','ghost_jelly','幽光水母'),('twilight','violet_fish','紫鳍鱼'),
('abyss','firefly_squid','萤火鱿'),('abyss','abyss_angler','渊底鮟鱇'),('abyss','tube_worm','荧管虫'),('abyss','armored_isopod','甲壳潜行者'),('abyss','siphonophore','链灯水母'),('abyss','sea_spider','星足海蛛'),('abyss','deep_starfish','深海星'),('abyss','glass_sponge','琉璃海绵')]
elite=[('sunlight','storm_eel','雷暴电鳗'),('sunlight','iron_hermit','铁甲寄居蟹'),('sunlight','spear_guard','剑鱼游侠'),('twilight','royal_jelly','冠冕水母'),('twilight','crystal_octopus','晶腕章鱼'),('twilight','mirror_ray','镜翼鳐'),('abyss','abyss_stalker','渊底巡猎者'),('abyss','violet_nautilus','紫纹鹦鹉螺')]
boss=[('sunlight','angler_king','深海鮟鱇王'),('twilight','tentacle_warden','裂隙守望者'),('abyss','giant_squid','流光巨鱿'),('abyss','abyss_whale','渊底巨鲸')]
for rank, data, size in [('normal',normal,192),('elite',elite,320),('boss',boss,768)]:
    for index,(layer,key,name) in enumerate(data,1):
        base=f'enemy_{rank}_{index:02}_{key}'
        add(base,'MVP','敌人-'+rank,base+'_idle.png',name+'静态基准/低画质降级',size,size,'是',layer,'BOSS' if rank=='boss' else 'CREATURE',notes='朝右侧视；发光边缘烘焙；层色'+layer+'；死亡荧光粒子由程序实现')
        # 4格横条便于核验与图集分帧；Boss大图采用节点动画以避免超过2048。
        if rank!='boss':
            add(base+'_swim','MVP','动画-'+rank,base+'_swim.png',name+'游动4帧横条',size*4,size,'是',layer,'CREATURE',animation=f'4帧，每格{size}×{size}，6fps循环',notes='与对应idle轮廓一致；帧中心不漂移；每帧2px内缩透明边')
        else:
            add(base+'_tentacle','MVP','Boss部件',base+'_fin.png',name+'可摆动鳍/触腕独立部件',512,512,'是',layer,'BOSS','连接点 0.5,0.9',notes='节点旋转摆动；不另生成整屏动画或大于2048纹理')

companions=[('angler','灯笼鮟鱇','照明与索敌'),('jelly','小水母','周期护盾'),('hermit','寄居蟹','拾取磁铁'),('eel','发电鳗','电弧连锁'),('octopus','伞章鱼','减速控制'),('ray','月翼鳐','移速增益'),('star','星砂海星','缓慢恢复'),('nautilus','珍珠鹦鹉螺','舱容加成')]
for i,(key,name,effect) in enumerate(companions,1):
    add(f'pet_{i:02}','P1','共生体',f'pet_{key}.png',name+'共生体/'+effect,256,256,'是','symbiont','PET',notes='与对应敌人同族但更亲和；无品质框，图鉴缩略图复用')

equipment=[('sonic','声波炮'),('torpedo','鱼雷巢'),('arc','电弧链'),('mine','诱饵浮雷'),('searchlight','探照灯'),('fin','潜流鳍'),('armor','装甲片'),('magnet','拾取磁铁')]
for key,name in equipment:
    add('equip_'+key,'MVP','装备',f'equip_{key}.png',name+'装备图标与挂载展示',256,256,'是','meta','GEAR',notes='同一图缩放用于背包；品质框由UI另绘；默认朝右')
    if key in ['sonic','torpedo','arc','mine']:
        add('mount_'+key,'MVP','武器部件',f'mount_{key}.png',name+'战斗挂载武器',128,128,'是','main' if key=='sonic' else 'sunlight','GEAR',notes='独立无底座；和H-01挂载比例一致')

icons=[('crystal','荧晶'),('pearl','珍珠'),('marrow','深海髓'),('core_cyan','青渊核'),('core_red','绯渊核'),('ticket','装备升级券'),('hp','生命'),('attack','攻击'),('attack_speed','攻速'),('move_speed','移速'),('cargo','舱容'),('oxygen','氧效/氧气瓶'),('home','母港'),('equipment','装备入口'),('upgrade','强化入口'),('tech','科技入口'),('supply','补给站'),('archive','探索档案'),('gift','深海馈赠'),('blessing','洋流祝福'),('sonar','声呐协击'),('silver_chest','白银珍珠箱'),('gold_chest','黄金珍珠箱'),('rescue','救援浮标'),('locked','未解锁锁头'),('warning','告警三角'),('video','激励视频三角'),('pause','暂停'),('close','关闭'),('ascend','向上双箭头'),('dive','向下双箭头'),('depth_marker','深度游标')]
for key,name in icons:
    add('icon_'+key,'MVP','UI图标',f'icon_{key}.png',name,96,96,'是','main' if key in ['oxygen','cargo','hp','pause','ascend','warning','depth_marker','video','rescue'] else 'meta','ICON',notes='同一描边粗细与视角；不含文字数字/外框；video/warning纯形可由矢量重绘')
for key,name in [('codex','图鉴'),('symbiont','共生体'),('friends','好友榜'),('poster','深度海报'),('pass','战令')]:
    add('icon_'+key,'P1','UI图标',f'icon_{key}.png',name+'入口',96,96,'是','social' if key=='friends' else 'meta','ICON')

for key,name,w,h,notes in [
('panel','面板底板',128,128,'九宫格边距24px；中心纯色可拉伸'),('button_primary','青色主按钮',160,80,'九宫格左右32/上下24px；不画文字'),('button_secondary','次按钮',160,80,'九宫格左右32/上下24px'),('slot','装备槽底板',128,128,'九宫格24px；不带物品'),('bar_track','氧气舱容条底',128,32,'九宫格左右12/上下8px'),('bar_cyan','氧气填充',128,16,'左右8px拉伸；代码裁剪'),('bar_amber','舱容填充',128,16,'左右8px拉伸；代码裁剪'),('joystick_base','摇杆底',256,256,'透明中心，圆形'),('joystick_thumb','摇杆柄',128,128,'与底同心'),('toast','轻提示底',128,64,'九宫格24/16px'),('red_dot','可领奖红点',32,32,'少量使用，仅每日必做')]:
    add('ui_'+key,'MVP','UI皮肤',f'ui_{key}.png',name,w,h,'是','main' if key in ['bar_track','bar_cyan','bar_amber','joystick_base','joystick_thumb','button_primary','panel'] else 'meta','UI',notes=notes+'；默认/按下/禁用以程序调色，不再生成3份')
for key,color in [('broken','破损灰'),('standard','标准蓝'),('fine','精良青'),('epic','史诗紫'),('legend','传说金')]:
    add('frame_'+key,'MVP','品质框',f'frame_{key}.png',color+'品质边框',128,128,'是','meta','UI',notes='透明中心；九宫格24px；无物品/文字')

fx=[('bubble','海水气泡',64,64),('glow','小型局部光晕',128,128),('crystal_drop','单颗荧晶掉落',64,64),('sonic_ring','声波空心圆环',256,256),('torpedo','橙头鱼雷弹体',128,64),('arc','电弧单段',256,64),('mine','浮雷弹体',96,96),('hit','命中小闪光',96,96),('death_particle','死亡荧光粒子',32,32),('shield','水母护盾环',256,256),('heal','维修微光',128,128),('thruster','青色推进尾焰',128,64),('telegraph_violet','渊主紫色圆形预警',256,256),('telegraph_amber','渊主橙色圆形预警',256,256),('boss_projectile','渊主紫光弹',64,64),('milestone','深度纪录星光',128,128)]
for key,name,w,h in fx:
    add('fx_'+key,'P1' if key in ['shield','heal','milestone'] else 'MVP','特效',f'fx_{key}.png',name,w,h,'是','abyss' if key.startswith('telegraph') or key=='boss_projectile' else 'main' if key in ['bubble','crystal_drop','sonic_ring','torpedo','hit','death_particle','thruster'] else 'sunlight','FX',notes='透明边无黑白色污染；可用Sprite缩放/旋转/淡出；不生成整屏Bloom；预警区域中心透明')
add('poster_base','P1','分享','poster_depth_base.png','深度海报无字底图',750,1200,'否','social','ABYSS',notes='数字昵称与合法小游戏码由程序叠加；底部留240px，不生成假二维码')
add('silhouette_mask','P1','图鉴','ui_unknown_eyes.png','未知生物荧光眼睛覆层',128,128,'是','symbiont','ICON',notes='黑色剪影由已知立绘程序着色，复用36种生物轮廓')

out=ROOT/'docs'/'潜渊猎手-完整素材清单.csv'
with out.open('w',encoding='utf-8-sig',newline='') as f:
    writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
assert len(normal)==24 and len(elite)==8 and len(boss)==4 and len(companions)==8
assert len({r['文件名'] for r in rows})==len(rows)
assert all(r['宽px']<=2048 and r['高px']<=2048 for r in rows)
print(f'{out.name}: {len(rows)} files; MVP={sum(r["阶段"]=="MVP" for r in rows)}, P1={sum(r["阶段"]=="P1" for r in rows)}; enemies 24+8+4, companions 8; unique names; <=2048px')
