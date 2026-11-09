/* 共享 Canvas 视图：浏览器与 WXML 预览壳使用同一套坐标和交互。 */
(function (root) {
  const M = typeof module !== 'undefined' ? require('./model') : root.HunterModel;
  const C = { bg: '#041b2a', panel: '#082d40', line: '#246073', text: '#eafaff', muted: '#94bccb', cyan: '#54eee2', amber: '#ffca7a', violet: '#bb9df4', red: '#ff8973' };
  const routes = [['harbor', '母港'], ['equipment', '装备'], ['upgrade', '强化'], ['tech', '科技']];
  function createView(canvas, images, state, height) {
    const ctx = canvas.getContext('2d'); const W = 375; let H = height || 750; let hits = [];
    function box(x,y,w,h,r,color,stroke) {
      ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
      if(color){ctx.fillStyle=color;ctx.fill();} if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}
    }
    function text(t,x,y,size=14,color=C.text,weight=400,align='left') {
      ctx.font=weight+' '+size+'px "PingFang SC", "Microsoft YaHei", sans-serif';ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(String(t),x,y);
    }
    function line(x1,y1,x2,y2,color=C.line) {ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=1;ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
    function circle(x,y,r,color,stroke) {ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);if(color){ctx.fillStyle=color;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
    function button(label,x,y,w,h,action,primary=false,color) {
      box(x,y,w,h,12,primary?C.cyan:C.panel,primary?null:C.line);
      text(label,x+w/2,y+h/2,14,primary?C.bg:(color||C.text),600,'center');
      // 图形可紧凑，交互热区仍至少44逻辑像素。
      hits.push({label,x:x-(Math.max(44,w)-w)/2,y:y-(Math.max(44,h)-h)/2,w:Math.max(44,w),h:Math.max(44,h),action});
    }
    function smallTag(label,x,y,color=C.cyan) {box(x,y,52,22,6,C.bg,color);text(label,x+26,y+11,10,color,600,'center');}
    function gem(x,y,color=C.cyan,size=10) {ctx.beginPath();ctx.moveTo(x,y-size);ctx.lineTo(x+size*.6,y);ctx.lineTo(x,y+size);ctx.lineTo(x-size*.6,y);ctx.closePath();ctx.fillStyle=color;ctx.fill();line(x,y-size,x,y+size,C.text);}
    function icon(type,x,y,color=C.cyan) {
      ctx.strokeStyle=color;ctx.lineWidth=2;
      if(type==='crystal'){gem(x,y,color,10);return;}
      if(type==='oxygen'){box(x-7,y-10,14,23,5,null,color);line(x-4,y-14,x+4,y-14,color);line(x-6,y-2,x+6,y-2,color);return;}
      if(type==='cargo'){box(x-11,y-9,22,20,3,null,color);line(x-11,y-2,x+11,y-2,color);line(x,y-9,x,y+11,color);return;}
      if(type==='pearl'){circle(x,y,8,color);circle(x-2,y-2,2,C.text);return;}
      if(type==='up'||type==='down'){const d=type==='up'?-1:1;line(x-9,y-d*4,x,y+d*4,color);line(x,y+d*4,x+9,y-d*4,color);return;}
      circle(x,y,10,null,color);line(x-5,y,x+5,y,color);line(x,y-5,x,y+5,color);
    }
    function gauge(label,value,total,y,color,type) {
      icon(type,29,y+18,color);text(label,48,y+5,10,C.muted);text(Math.round(value)+(type==='oxygen'?'%':' / '+total),345,y+5,12,color,600,'right');
      box(48,y+17,296,6,3,'#173d4b');box(48,y+17,Math.max(4,296*value/total),6,3,color);
    }
    function backdrop(key,dim=.1) {
      const im=images[key];
      ctx.fillStyle=C.bg;ctx.fillRect(0,0,W,H);
      if(im && im.width){
        // 仅在运行时遮罩已有概念图中的旧 HUD，不导出或生成新素材。
        const crop = key==='harbor' ? [0,155,1024,980] : key==='abyss' ? [0,200,1024,1120] : [0,140,1024,1130];
        const dy=key==='harbor'?95:158,dh=key==='harbor'?H-180:H-260;
        const sw=Math.min(crop[2],crop[3]*W/dh),sh=Math.min(crop[3],crop[2]*dh/W);
        // 等比 cover，保留潜航器圆形舷窗与原概念稿比例。
        ctx.drawImage(im,(1024-sw)/2,crop[1]+(crop[3]-sh)/2,sw,sh,0,dy,W,dh);
      } else {text('概念图加载中',W/2,H/2,14,C.muted,400,'center');}
      ctx.fillStyle='rgba(2,19,31,'+dim+')';ctx.fillRect(0,0,W,H);
      const g=ctx.createLinearGradient(0,H-310,0,H);g.addColorStop(0,'rgba(4,27,42,0)');g.addColorStop(.65,'rgba(4,27,42,.95)');g.addColorStop(1,C.bg);ctx.fillStyle=g;ctx.fillRect(0,H-310,W,310);
    }
    function top(title,subtitle,back=false) {
      ctx.fillStyle=C.bg;ctx.fillRect(0,0,W,94);
      if(back){button('‹',16,30,34,36,'route:harbor');text(title,64,43,20,C.text,700);}
      else text(title,20,43,20,C.text,700);
      text(subtitle,back?64:20,72,11,C.muted);
      // 与微信右上胶囊留出互不遮挡的保留区。
      box(283,28,72,29,16,'#061f30',C.line);text('•••   ◉',319,43,13,C.muted,500,'center');
    }
    function wallet(y=99) {
      box(16,y,343,42,12,'rgba(5,31,46,.95)',C.line);
      icon('crystal',35,y+21);text(state.bank.toLocaleString(),53,y+21,14,C.text,600);
      icon('pearl',163,y+21,C.amber);text(state.pearls,180,y+21,14,C.text,600);
      icon('core',269,y+21,C.violet);text(state.marrow,287,y+21,14,C.text,600);
    }
    function nav() {
      ctx.fillStyle=C.bg;ctx.fillRect(0,H-85,W,85);line(16,H-84,359,H-84);
      routes.forEach((r,i)=>{const active=r[0]===state.screen;const x=18+i*88;
        if(active)box(x,H-74,75,53,10,'#104651');
        icon(['up','cargo','core','oxygen'][i],x+37,H-57,active?C.cyan:C.muted);text(r[1],x+37,H-33,11,active?C.cyan:C.muted,600,'center');hits.push({label:r[1],x,y:H-77,w:75,h:57,action:'route:'+r[0]});
      });
      box(135,H-9,105,3,2,'#6f939f');
    }
    function harbor() {
      backdrop('harbor',.08);top('潜渊猎手','ABYSS HUNTER  /  母港 07');wallet();
      box(18,151,208,43,10,'rgba(5,31,46,.88)',C.line);text('今日航志 · 完成 3 次下潜',31,166,11,C.text,500);text('1 / 3   ·   奖励珍珠 ×20',31,182,10,C.amber);
      smallTag('Lv.12',294,155);
      box(20,H-310,188,43,10,'rgba(5,31,46,.86)',C.line);text('H-01 / 潮汐号',32,H-295,14,C.text,700);text('象牙白装甲 · 双挂载就绪',32,H-278,10,C.muted);
      text('探索尚未抵达的光',20,H-238,24,C.text,700);
      text('个人最深 '+state.record+'m  /  日光层已就绪',20,H-211,12,C.muted);
      button('补给站',20,H-184,101,42,'route:rewards');button('探索档案 P1',129,H-184,120,42,'route:codex');
      button('↓  出发下潜',20,H-130,335,45,'dive',true);
      if(state.pending)text('待确认收益 '+state.pending+' 荧晶 · 联网后同步',20,H-148,11,C.amber);
      nav();
    }
    function battle() {
      const abyss=state.screen==='abyss';backdrop(abyss?'abyss':'battle',.03);
      ctx.fillStyle=C.bg;ctx.fillRect(0,0,W,158);
      text(abyss?'03 / 深渊层':'01 / 日光层',20,38,16,C.text,700);text('•••   ◉',320,38,13,C.muted,500,'center');
      gauge('O₂  氧气储量',state.oxygen,100,61,state.oxygen<15?C.red:C.cyan,'oxygen');
      gauge('收集舱 · 上浮卸货后入账',state.cargo,state.capacity,105,C.amber,'cargo');
      box(18,155,104,27,8,'rgba(5,31,46,.9)',C.line);text('机体 '+Math.round(state.hp)+'%',31,169,11,C.text,500);
      button('Ⅱ',311,153,44,36,'pause');
      if(abyss){box(56,197,263,36,9,'#14263e',C.violet);text('渊主 / 流光巨鱿',68,209,11,C.violet,600);box(68,219,235,4,2,'#344057');box(68,219,146,4,2,C.violet);}
      // 深度刻度与背景示意标尺统一覆盖，数字由代码绘制。
      box(322,235,40,H-470,10,'rgba(4,27,42,.86)');
      line(344,254,344,H-249,'#519ca9');
      for(let i=0;i<6;i++)line(337,254+i*(H-510)/5,345,254+i*(H-510)/5,C.muted);
      text('⌂',344,246,16,C.cyan,500,'center');text(Math.round(state.depth),337,H-234,13,C.cyan,700,'center');text('米',337,H-218,10,C.muted,400,'center');
      if(state.tutorial){box(20,207,228,52,12,'rgba(5,31,46,.94)',C.cyan);text('01 / 先学会平安返航',34,224,13,C.cyan,700);text('拖动摇杆查看反馈，再上浮卸货',34,243,11,C.text);}
      if(state.oxygen<15){box(20,H-254,283,46,10,'#392b32',C.red);text('低氧警告 · 上浮方向始终向上',32,H-239,12,C.red,700);text('耗尽后持续损失生命，仍可抢救返航',32,H-222,10,C.text);}
      circle(68,H-132,46,'rgba(9,54,70,.85)',C.line);circle(68+(state.joystick?state.joystick.x:0),H-132+(state.joystick?state.joystick.y:0),21,'#2b8190',C.cyan);
      text('移动',68,H-70,11,C.muted,500,'center');
      hits.push({label:'拖动移动摇杆',x:20,y:H-180,w:96,h:96,action:'joystick'});
      if(state.joystick){circle(187+state.joystick.x,H*.5+state.joystick.y,16,null,C.cyan);text('移动反馈',187+state.joystick.x,H*.5+state.joystick.y+28,10,C.cyan,500,'center');}
      button('↑ 上浮',263,H-161,92,61,'ascend',true);
      if(state.oxygen<15)button('▷ 应急供氧',245,H-211,110,38,'oxygen',false,C.amber);
      box(126,H-152,120,50,12,'rgba(5,31,46,.9)',C.line);
      ['声波','鱼雷','装甲'].forEach((v,i)=>{icon(i===2?'cargo':'core',148+i*37,H-135,i===2?C.amber:C.cyan);text(v,148+i*37,H-113,9,C.muted,400,'center');});
      text('武器自动索敌 · 战斗画面为概念示意',187,H-43,10,C.muted,400,'center');
      if(!state.online)text('离线 · 本局现场保留，收益待确认',187,193,11,C.amber,600,'center');
      box(135,H-10,105,3,2,C.muted);
    }
    function section(title,caption){top(title,caption,true);wallet();}
    function upgrade(){
      section('机体强化','六项基础属性 / 首次卸货后开放');
      text('每一点成长，都能潜得更远',20,170,17,C.text,700);
      Object.keys(M.names).forEach((key,i)=>{const y=195+i*62;box(18,y,339,54,11,C.panel,C.line);icon(i<4?'core':key,39,y+27,i===4?C.amber:C.cyan);text(M.names[key],61,y+17,13,C.text,600);text('Lv.'+state.upgrades[key]+' → '+(state.upgrades[key]+1)+(key==='cargo'?'  / 容量 +50':'  / 属性 +5%'),61,y+37,10,C.muted);button('◇ '+M.cost(state,key),260,y+9,84,36,'upgrade:'+key,false,state.bank>=M.cost(state,key)?C.cyan:C.muted);});
      text('门槛等级消耗渊核 · 样例展示前期强化',20,580,10,C.muted);nav();
    }
    function tech(){
      section('潜航科技','五系节点树 / 每系 20 个节点');
      ['攻击','生存','氧气','舱容','特殊'].forEach((v,i)=>button(v,18+i*69,161,63,35,'branch:'+i,state.techBranch===i));
      const names=[['脉冲增幅','鱼雷贯穿','深海聚能'],['复合装甲','缓释护盾','紧急回弹'],['高效换气','深潜呼吸','储氧回收'],['舱体扩容','压缩收集','远距卸货'],['声呐延时','自动巡航','捕捉增幅']][state.techBranch];
      names.forEach((n,i)=>{const y=227+i*93; if(i)line(61,y-34,61,y-3,C.cyan);box(25,y,325,67,12,C.panel,i===0?C.cyan:C.line);circle(61,y+33,20,i===0?'#18545b':'#163443',i===0?C.cyan:C.line);text(i===0?'01':'0'+(i+1),61,y+33,13,i===0?C.cyan:C.muted,600,'center');text(n,95,y+23,15,C.text,600);text(i===0?'已解锁 '+state.tech+' 次 · 效果 +5%':'前置节点达 3 级后开放',95,y+45,11,C.muted);});
      button('点亮首节点 · ◇240 + 渊核1',25,534,325,46,'tech',true);text('当前渊核 '+state.cores+'  /  样例节点可重复强化',25,603,11,C.muted);nav();
    }
    function equipment(){
      section('挂载装备','2 个主武器 + 2 个辅件 / 第 4 槽 Lv.40');
      text('当前挂载',20,170,15,C.text,700);
      ['声波炮','鱼雷巢','装甲片','Lv.40'].forEach((v,i)=>{const x=20+i*86;box(x,193,77,79,12,C.panel,i===3?C.line:C.cyan);icon(i===2?'cargo':'core',x+38,218,i===3?C.muted:C.cyan);text(v,x+38,251,11,C.text,500,'center');hits.push({label:v,x,y:193,w:77,h:79,action:i===3?'locked':'equip'});});
      text('收纳舱',20,303,17,C.text,700);text(state.items+' 件',352,303,12,C.muted,400,'right');
      for(let i=0;i<Math.min(6,state.items);i++){const x=20+i%3*115,y=329+Math.floor(i/3)*103;box(x,y,105,91,10,C.panel,state.merged&&i===0?C.violet:C.line);icon('core',x+52,y+29,state.merged&&i===0?C.violet:C.cyan);text('声波炮',x+52,y+56,12,C.text,600,'center');text(state.merged&&i===0?'精良 · 可装配':'标准 · Lv.1',x+52,y+76,10,C.muted,400,'center');hits.push({label:'装配声波炮 '+(i+1),x,y,w:105,h:91,action:'equip'});}
      button('三合一 · 消耗 3 件标准声波炮',20,554,335,45,'merge',true);text('品质：破损 / 标准 / 精良 / 史诗 / 传说',20,620,10,C.muted);nav();
    }
    function rewards(){
      section('深海补给站','可选增益 / 随时关闭 / 无现金购买');
      const rows=[['gift','深海馈赠','随机资源 · 样例荧晶180 / 珍珠5'],['blessing','洋流祝福','三选一 · 持续20分钟 · '+(2-state.blessingUsed)+'/2'],['sonar','声呐协击','15分钟自动战斗 · '+(state.sonar?'已启用':'未启用')]];
      rows.forEach((r,i)=>{const y=160+i*78;box(18,y,339,66,12,C.panel,C.line);icon(i===1?'oxygen':'core',42,y+31,i===1?C.amber:C.cyan);text(r[1],67,y+21,14,C.text,700);text(r[2],67,y+44,10,C.muted);hits.push({label:r[1],x:18,y,w:339,h:66,action:r[0]});text('›',339,y+31,20,C.cyan);});
      text('珍珠装备箱',20,419,17,C.text,700);
      box(18,443,339,153,12,C.panel,C.line);text('白银箱',32,464,14,C.text,600);button('50 珍珠',32,486,128,35,'buySilver');button('▷ 免费 '+(3-state.silverUsed)+'/3',173,486,169,35,'ad:silver');
      text('黄金箱 · 十连保底史诗',32,544,12,C.amber);button('100 珍珠',32,565,128,24,'buyGold');button('▷ 免费 '+(2-state.goldUsed)+'/2',173,565,169,24,'ad:gold');
      text('战令加领 P1 · 后续版本开放',20,623,11,C.muted);nav();
    }
    function codex(){
      section('探索档案','P1 预览 / 不计入本轮 MVP 功能');
      smallTag('P1',20,159,C.violet);text('每一束光，都值得被发现',20,204,19,C.text,700);
      [['01','百科图鉴','发现 3 / 36 种生物','荧光水母 / 灯笼鮟鱇 / 电鳗'],['02','共生体','首发 8 只 · 装配预览','照明 / 护盾 / 拾取 / 连锁'],['03','好友深度榜','仅样例，不读取真实好友','01 你 1280m   02 潜友A 1120m']].forEach((r,i)=>{const y=239+i*108;box(18,y,339,94,12,C.panel,C.line);text(r[0],33,y+24,12,C.violet,700);text(r[1],65,y+24,17,C.text,700);text(r[2],33,y+53,12,C.cyan);text(r[3],33,y+76,10,C.muted);hits.push({label:r[1]+' P1',x:18,y,w:339,h:94,action:'p1'});});
      button('深度海报 · P1',20,594,335,42,'p1');nav();
    }
    function stateScreen(){
      const t={loading:['资源加载中','正在预取下一海层 · 62%','返回母港'],empty:['这里暂时没有收获','完成一次下潜，点亮你的探索记录','前往下潜'],error:['连接暂时中断','现场已保留，请重试或安全返回母港','重试连接']}[state.uiState];
      top('潜航终端','资源与网络状态预览',true);circle(187,H/2-85,42,C.panel,C.line);icon(state.uiState==='empty'?'cargo':'core',187,H/2-85);
      text(t[0],187,H/2-12,22,C.text,700,'center');text(t[1],187,H/2+23,11,C.muted,400,'center');
      if(state.uiState==='loading'){box(60,H/2+61,255,6,3,C.panel);box(60,H/2+61,158,6,3,C.cyan);}
      button(t[2],55,H/2+100,265,45,state.uiState==='error'?'retry':state.uiState==='empty'?'dive':'route:harbor',true);
      if(state.uiState==='error')button('安全返回母港',55,H/2+158,265,42,'route:harbor');
    }
    function modal(){
      if(!state.panel)return;
      // 保留底层控件可见，但只允许当前弹窗接收事件。
      hits=[];ctx.fillStyle='rgba(0,12,22,.79)';ctx.fillRect(0,0,W,H);
      const p=state.panel;const y=Math.max(116,H/2-186);box(20,y,335,372,20,'#092b3d',C.line);
      if(p==='settlement'){
        text('安全返航',187,y+37,25,C.text,700,'center');text('把探索，变成下一次的底气',187,y+67,12,C.muted,400,'center');
        gem(187,y+112,C.cyan,22);text('+'+state.settlement,187,y+159,40,C.cyan,700,'center');text('荧晶 · 确认卸货后'+(state.online?'入账':'待确认'),187,y+197,12,C.muted,400,'center');
        text('本次深度 '+Math.round(state.depth)+'m    /    舱容 '+state.capacity,187,y+230,12,C.text,400,'center');button(state.online?'卸货并返回母港':'保留待确认收益',40,y+271,295,47,'unload',true);text('收益使用同一潜航记录，仅结算一次',187,y+342,10,C.muted,400,'center');
      } else if(p==='rescue'){
        text('救援浮标已定位',187,y+40,23,C.text,700,'center');text('舱体受损 · '+state.cargo+' 荧晶尚可保住',187,y+85,13,C.amber,500,'center');text('完成视频后原地复活，恢复 50% 生命',187,y+120,12,C.muted,400,'center');text('今日剩余 '+(3-state.rescueUsed)+' / 3 次',187,y+150,12,C.cyan,500,'center');
        button('▷ 救援并保住荧晶',40,y+218,295,46,'ad:rescue',true);button('放弃救援 · 清空本局收集舱',40,y+280,295,43,'abandon',false,C.red);
      } else if(p==='oxygen'){
        text('应急供氧',187,y+39,25,C.text,700,'center');icon('oxygen',187,y+96,C.amber);text('氧气 '+Math.round(state.oxygen)+'% · 还能坚持上浮',187,y+147,14,C.amber,600,'center');text('可选视频补满氧气 · 今日 '+(3-state.oxygenUsed)+'/3',187,y+184,12,C.muted,400,'center');
        button('▷ 补满氧气',40,y+234,295,46,'ad:oxygen',true);button('坚持上浮',40,y+294,295,44,'close');
      } else if(p==='ad'||p==='adFailed'){
        text(p==='ad'?'激励视频模拟器':'视频暂不可用',187,y+40,23,C.text,700,'center');text('本地评审模式 · 不会播放真实广告',187,y+78,11,C.muted,400,'center');
        text(p==='ad'?'完成观看才确认奖励':'拉取失败 · 保留原选择，不发奖',187,y+125,13,p==='ad'?C.cyan:C.amber,600,'center');
        button(p==='ad'?'模拟完整观看':state.adRetries>=1?'返回原选择':'重试加载（限一次）',40,y+184,295,45,p==='ad'?'ad:complete':state.adRetries>=1?'ad:cancel':'ad:retry',true);
        if(p==='ad')button('模拟拉取失败',40,y+241,295,40,'ad:fail');button('提前关闭 · 不领奖',40,y+298,295,40,'ad:cancel');
      } else if(p==='pause'){
        text('潜航已暂停',187,y+43,25,C.text,700,'center');text('氧气、敌人与收益均已冻结',187,y+88,12,C.muted,400,'center');button('继续探索',40,y+157,295,46,'resume',true);button('安全上浮',40,y+217,295,42,'ascend');button('返回评审母港',40,y+279,295,42,'route:harbor');
      } else {
        const title={gift:'深海馈赠',blessing:'洋流祝福',sonar:'声呐协击'}[p];text(title,187,y+36,25,C.text,700,'center');
        if(p==='blessing'){
          ['收益 +10%','氧气 +20%','舱容 +20%'].forEach((v,i)=>button(v,40+i*99,y+107,91,64,'choice:'+i,state.choice===i));text('任选一种 · 持续 20 分钟',187,y+199,12,C.muted,400,'center');
        }else{text(p==='gift'?'资源补给，帮助下一次下潜':'解放双手，自动战斗 15 分钟',187,y+124,14,C.text,500,'center');text(p==='gift'?'随机奖励以确认结果为准':'基础武器始终自动索敌',187,y+167,12,C.muted,400,'center');}
        button('▷ 观看视频领取',40,y+244,295,46,'ad:'+p,true);button('暂时不用',40,y+304,295,40,'close');
      }
    }
    function render(){
      hits=[];ctx.clearRect(0,0,W,H);ctx.fillStyle=C.bg;ctx.fillRect(0,0,W,H);
      if(state.uiState!=='default')stateScreen();
      else if(['upgrade','tech','equipment','rewards','codex'].includes(state.screen)){
        // 短屏按纵向比例收拢面板，确保底栏与最后一项不重叠。
        const actualH=H;const ratio=actualH/750;ctx.save();ctx.scale(1,ratio);H=750;
        ({upgrade,tech,equipment,rewards,codex}[state.screen])();H=actualH;ctx.restore();
        hits=hits.map(h=>Object.assign({},h,{y:h.y*ratio,h:h.h*ratio}));
      } else ({harbor,battle,abyss:battle}[state.screen]||harbor)();
      modal();
      if(state.toastTime>0){box(20,190,335,38,10,'#214652',C.line);text(state.toast,187,209,11,C.text,500,'center');}
      return hits;
    }
    function tap(x,y){const hit=hits.slice().reverse().find(h=>x>=h.x&&x<=h.x+h.w&&y>=h.y&&y<=h.y+h.h);if(hit&&hit.action!=='joystick')M.dispatch(state,hit.action);return hit;}
    return { render,tap,getHits:()=>hits,resize:h=>{H=h;},height:()=>H };
  }
  const api={createView,colors:C};if(typeof module!=='undefined')module.exports=api;else root.HunterView=api;
})(typeof globalThis!=='undefined'?globalThis:this);
