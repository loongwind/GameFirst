// 微信小程序 Canvas 预览壳；正式游戏 UI 迁移至 Cocos Canvas/Prefab。
const M = require('../../shared/model');
const V = require('../../shared/view');
Page({
  data: { canvasWidth:375, canvasHeight:750,canvasLeft:0,canvasTop:0,error:'' },
  onLoad(){this.state=M.createState();},
  onReady(){this.prepare();},
  prepare(){
    const info=wx.getWindowInfo();
    const scale=info.windowWidth/375;
    // 顶部避开状态栏，底部使用真实安全区域。微信胶囊位置在视图顶部留白中。
    const top=info.statusBarHeight||24;const bottom=info.safeArea?info.screenHeight-info.safeArea.bottom:0;
    const height=info.windowHeight-top-bottom;this.scale=scale;this.logicalH=height/scale;
    this.setData({canvasWidth:info.windowWidth,canvasHeight:height,canvasTop:top,canvasLeft:0,error:''});
    wx.createSelectorQuery().select('#prototype').fields({node:true,size:true}).exec(res=>{
      if(!res[0]||!res[0].node){this.setData({error:'Canvas 尚未就绪，请重试'});return;}
      const canvas=res[0].node;const dpr=Math.min(info.pixelRatio,2);canvas.width=info.windowWidth*dpr;canvas.height=height*dpr;canvas.getContext('2d').scale(scale*dpr,scale*dpr);
      this.images={};this.view=V.createView(canvas,this.images,this.state,this.logicalH);
      for(const [key,file] of Object.entries({harbor:'01-harbor-preparation',battle:'02-sunlight-combat',abyss:'03-abyss-boss'})){
        const im=canvas.createImage();this.images[key]=im;im.onload=()=>this.draw();im.onerror=()=>this.setData({error:'概念图加载失败，请重试'});im.src='/assets/'+file+'.png';
      }
      clearInterval(this.timer);this.timer=setInterval(()=>{M.tick(this.state,1);this.draw();},1000);this.draw();
    });
  },
  draw(){if(this.view)this.view.render();},
  point(e){const t=e.touches[0]||e.changedTouches[0];return{x:t.x/this.scale,y:t.y/this.scale};},
  onTouchStart(e){if(!this.view)return;const p=this.point(e);const hit=this.view.tap(p.x,p.y);this.dragging=hit&&hit.action==='joystick';this.draw();},
  onTouchMove(e){if(!this.dragging)return;const p=this.point(e);this.state.joystick={x:Math.max(-25,Math.min(25,p.x-68)),y:Math.max(-25,Math.min(25,p.y-(this.logicalH-132)))};this.draw();},
  onTouchEnd(){this.dragging=false;this.state.joystick=null;this.draw();},
  onHide(){this.state.hidden=true;},
  onShow(){if(this.state)this.state.hidden=false;},
  onUnload(){clearInterval(this.timer);},
  onRetry(){this.prepare();}
});
