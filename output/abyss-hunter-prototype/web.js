/* 浏览器评审入口；无网络、构建或第三方运行依赖。 */
const state = HunterModel.createState();
const canvas = document.querySelector('#game');
const layer = document.querySelector('#hit-layer');
const images = {}; let logicalH = 750; let previousKey = '';
for (const [key,name] of Object.entries({harbor:'01-harbor-preparation',battle:'02-sunlight-combat',abyss:'03-abyss-boss'})) {
  const im=new Image();images[key]=im;im.onload=()=>render();im.onerror=()=>{state.uiState='error';render();};im.src='assets/'+name+'.png';
}
const view = HunterView.createView(canvas,images,state,logicalH);
function setSize(height) {
  logicalH=height;const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=375*dpr;canvas.height=height*dpr;canvas.style.width='100%';canvas.style.height='auto';canvas.getContext('2d').scale(dpr,dpr);view.resize(height);
  document.querySelector('#viewport').textContent='375 × '+height;previousKey='';render();
}
const labels={harbor:['母港整备','一个出发入口，三条成长路线。安全、明亮的母港与深海风险形成节奏反差。'],battle:['日光层探索','氧气决定时间，舱容决定收益。上浮卸货后，荧晶才会进入永久余额。'],abyss:['深渊渊主战','低氧、满舱与渊主同屏。紧急供氧保持可选，上浮始终可达。'],upgrade:['机体强化','六项基础属性。荧晶不足时保留上下文，引导先下潜收集。'],tech:['潜航科技','五条成长分支，前置关系与花费在当前面板内可见。'],equipment:['挂载装备','两武器与两辅件；Lv.40 槽位保持锁定，三合一消耗明确。'],rewards:['深海补给','按需领取与珍珠消费并行。视频关闭、失败、完成分别反馈。'],codex:['探索档案 · P1','图鉴、共生体、好友榜为后续迭代预览，不读取真实好友资料。']};
function render() {
  const hits=view.render();const key=JSON.stringify(hits);
  if(previousKey!==key){previousKey=key;layer.replaceChildren();for(const hit of hits){const b=document.createElement('button');b.className='hit';b.setAttribute('aria-label',hit.label);b.dataset.action=hit.action;Object.assign(b.style,{left:(hit.x/375*100)+'%',top:(hit.y/logicalH*100)+'%',width:(hit.w/375*100)+'%',height:(hit.h/logicalH*100)+'%'});if(hit.action!=='joystick')b.onclick=()=>act(hit.action);else b.addEventListener('pointerdown',startStick);layer.append(b);}}
  const label=labels[state.screen];document.querySelector('#scene-name').textContent=label[0];document.querySelector('#scene-note').textContent=label[1];
  for(const b of document.querySelectorAll('nav button'))b.classList.toggle('active',b.dataset.action==='route:'+state.screen);
  document.querySelector('#ui-state').value=state.uiState;
}
function act(action){HunterModel.dispatch(state,action);previousKey='';render();}
document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>act(b.dataset.action)));
document.querySelector('#ui-state').onchange=e=>act('state:'+e.target.value);
document.querySelector('#size').onchange=e=>setSize(Number(e.target.value));
function startStick(e){e.preventDefault();const target=e.currentTarget;target.setPointerCapture(e.pointerId);const rect=canvas.getBoundingClientRect();const move=ev=>{state.joystick={x:Math.max(-25,Math.min(25,(ev.clientX-rect.left)*375/rect.width-68)),y:Math.max(-25,Math.min(25,(ev.clientY-rect.top)*logicalH/rect.height-(logicalH-132)))};render();};const stop=()=>{state.joystick=null;target.removeEventListener('pointermove',move);render();};target.addEventListener('pointermove',move);target.addEventListener('pointerup',stop,{once:true});target.addEventListener('pointercancel',stop,{once:true});move(e);}
document.addEventListener('visibilitychange',()=>{state.hidden=document.hidden;render();});
setInterval(()=>{HunterModel.tick(state,1);render();},1000);
setSize(750);
// 自动化只读/操作桥：与界面按钮调用同一真实模型。
window.prototype={state,act,view,render,images};
