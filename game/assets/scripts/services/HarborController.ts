import { _decorator, Component, assetManager, AssetManager, SpriteFrame, BitmapFont, Texture2D, UITransform, director, isValid } from 'cc';
import { WECHAT } from 'cc/env';
import { createPlatformAdapter } from '../platform/createPlatformAdapter';
import type { DepthPosterData, PlatformAdapter, PosterCreature } from '../platform/PlatformAdapter';
import { EconomyService } from './local/EconomyService';
import { LocalSaveService } from './local/SaveService';
import { AdService } from './local/AdService';
import type { AdDriver } from './local/AdService';
import { HarborModel } from '../meta/HarborModel';
import { HarborView } from '../ui/HarborView';
import { SEA_ART, SEA_IDENTITIES } from '../ui/SeaArt';
import { UiScope, C } from '../ui/HarborKit';
import { harborLayout } from '../ui/harborLayout';

const { ccclass } = _decorator;
const unavailable: AdDriver = { isMock: false, async load() { throw new Error('AD_DRIVER_UNAVAILABLE'); }, async show() { throw new Error('AD_DRIVER_UNAVAILABLE'); } };
/** Harbor shares the P1-04 durable store with Dive; no development ad driver is imported. */
@ccclass('HarborController')
export class HarborController extends Component {
  economy!: EconomyService;
  model!: HarborModel;
  view?: HarborView;
  private platform!: PlatformAdapter;
  private readonly frames = new Map<string, SpriteFrame>();
  private font?: BitmapFont;
  private offShow?: () => void;
  private loading?: UiScope;
  private dead = false;
  private loadingAssets = false;
  private adService?: AdService;
  private error = '';
  private loadingKey = '';
  /** Encounter art for the depth poster, loaded lazily per key and retained until teardown. */
  private readonly posterCreatures = new Map<string, PosterCreature>();
  private readonly posterFrames = new Map<string, SpriteFrame>();
  private loadingCreatures?: Promise<ReadonlyMap<string, PosterCreature>>;

  onLoad(): void {
    this.platform = createPlatformAdapter(WECHAT ? 'wechat' : 'browser');
    this.economy = new EconomyService(new LocalSaveService(this.platform.storage));
    this.model = new HarborModel(this.economy);
    this.configureAds(unavailable);
    this.offShow = this.platform.onShow(() => { this.view?.update(); });
    void this.loadAssets();
  }
  configureAds(driver: AdDriver): void {
    this.adService = undefined;
    const service = (): AdService => this.adService ?? (this.adService = new AdService(this.economy, driver));
    // Recovery construction can write a cancelled reservation. Keep quota failures in the retry UI.
    this.model.setAds({ watch: request => service().watch(request), retryClaim: () => service().retryClaim() });
  }
  private async loadAssets(): Promise<void> {
    if (this.loadingAssets || this.dead) return;
    this.loadingAssets = true; this.error = ''; this.drawLoading();
    try {
      const bundle = await new Promise<AssetManager.Bundle>((resolve, reject) => assetManager.loadBundle('meta', (error, bundle) => error ? reject(error) : resolve(bundle)));
      const [framesResult, fontResult] = await Promise.allSettled([
        new Promise<SpriteFrame[]>((resolve, reject) => bundle.loadDir('ui', SpriteFrame, (error, assets) => {
          if (error) reject(error); else { assets.forEach(asset => asset.addRef()); resolve(assets); }
        })),
        new Promise<BitmapFont>((resolve, reject) => bundle.load('fonts/digits', BitmapFont, (error, asset) => {
          if (error) reject(error); else { asset.addRef(); resolve(asset); }
        })),
      ] as const);
      if (this.dead || !isValid(this.node) || framesResult.status === 'rejected' || fontResult.status === 'rejected') {
        if (framesResult.status === 'fulfilled') framesResult.value.forEach(frame => frame.decRef());
        if (fontResult.status === 'fulfilled') fontResult.value.decRef();
        if (this.dead || !isValid(this.node)) return;
        throw new Error('HARBOR_ASSETS_UNAVAILABLE');
      }
      framesResult.value.forEach(frame => this.frames.set(frame.name, frame));
      this.font = fontResult.value;
      this.loading?.dispose(); this.loading = undefined;
      this.view = new HarborView(this.node, this.model, this.frames, this.font, () => {
        director.loadScene('Dive', error => { if (error && !this.dead) { this.model.notice = '潜航资源未就绪，请稍后重试。'; this.view?.open('supply'); } });
      }, {
        // Real encounter art: the poster awaits one cached bundle read per new species.
        create: async record => this.platform.createDepthPoster(record, await this.readyPosterCreatures(record)),
        save: record => this.platform.saveDepthPoster(record),
      });
      this.update();
    } catch (error) {
      if (!this.dead) {
        this.view?.destroy(); this.view = undefined;
        this.frames.forEach(frame => frame.decRef()); this.frames.clear(); this.font?.decRef(); this.font = undefined;
        this.error = '港口资源加载失败，已确认资产保持不变。'; this.drawLoading();
      }
    }
    finally { this.loadingAssets = false; }
  }
  /** Resolves the encounter keys' real art from their layer bundles; failures fall back to
   *  the painter's silhouettes one key at a time. Cached across poster opens. */
  private readyPosterCreatures(record: DepthPosterData): Promise<ReadonlyMap<string, PosterCreature>> {
    if (this.loadingCreatures) return this.loadingCreatures;
    const keys = Array.from(new Set(record.encounters)).slice(0, 12).filter(key => !this.posterCreatures.has(key) && SEA_IDENTITIES[key]);
    const load = (async () => {
      for (const key of keys) {
        const art = SEA_ART[SEA_IDENTITIES[key].idle];
        if (!art) continue;
        try {
          const bundle = await new Promise<AssetManager.Bundle>((resolve, reject) => assetManager.loadBundle(art.bundle, (error, result) => error ? reject(error) : resolve(result)));
          const frame = await new Promise<SpriteFrame>((resolve, reject) => bundle.load(`${art.path}/spriteFrame`, SpriteFrame, (error, asset) => error ? reject(error) : resolve(asset as SpriteFrame)));
          if (this.dead) break;
          // The engine hands Texture2D.image as an ImageAsset whose .data is the drawable;
          // accept either shape. Constructor-name checks stay platform-free (no DOM globals).
          const drawable = ['HTMLImageElement', 'HTMLCanvasElement', 'ImageBitmap'];
          const raw = (frame.texture as Texture2D | undefined)?.image as { data?: unknown; constructor?: { name?: string } } | undefined;
          const name = (value: unknown): string => (value as { constructor?: { name?: string } } | undefined)?.constructor?.name ?? '';
          const source = raw && drawable.includes(name(raw)) ? raw : raw && drawable.includes(name(raw.data)) ? raw.data : undefined;
          if (!source) continue;
          frame.addRef(); this.posterFrames.set(key, frame);
          const rect = art.frames?.[0];
          const [sx, sy, sw, sh] = rect ?? [0, 0, art.width, art.height];
          this.posterCreatures.set(key, { source, sx, sy, sw, sh });
        } catch { /* one missing creature keeps the rest on the silhouette fallback */ }
      }
      return this.posterCreatures;
    })();
    this.loadingCreatures = load.finally(() => { this.loadingCreatures = undefined; });
    return this.loadingCreatures;
  }

  private drawLoading(): void {
    this.loading?.dispose(); if (this.dead) return;
    const size=this.node.getComponent(UITransform)!.contentSize,device=this.platform.getDeviceInfo(),ratio=size.width/device.windowWidth;
    this.loadingKey=JSON.stringify({size,device,error:this.error});
    const l=harborLayout(size.width,size.height,{top:Math.max(device.safeArea.top,device.capsule?.bottom??0)*ratio,
      bottom:Math.max(0,device.windowHeight-device.safeArea.top-device.safeArea.height)*ratio,
      left:device.safeArea.left*ratio,right:Math.max(0,device.windowWidth-device.safeArea.left-device.safeArea.width)*ratio},{width:device.windowWidth,height:device.windowHeight});
    const root=this.newLoadingRoot();root.setScale(l.scale,l.scale,1);
    const s = this.loading = new UiScope(root, this.frames, undefined, l.touch);
    const height=2*l.touch+144,y=l.top+Math.max(0,(l.height-l.bottom-l.top-height)/2),width=375-l.left-l.right;
    s.box('LoadingPlate', { x:l.left,y,width,height });
    s.text('LoadTitle','港口通信 / PORT 01',l.left+16,y+16,width-32,32,19,C.amber);
    s.text('LoadState', this.error || '正在准备母港…',l.left+16,y+54,width-32,54,14,this.error?C.danger:C.mint);
    if (this.error) s.button('retry-assets',{x:l.left+16,y:y+116,width:width-32,height:l.touch},'重新连接港口',()=>{void this.loadAssets();},true,undefined,true);
    s.button('safe-dive',{x:l.left+16,y:y+128+l.touch,width:width-32,height:l.touch},'返回潜航现场',()=>director.loadScene('Dive'));
  }
  private newLoadingRoot() {
    const s = new UiScope(this.node, this.frames), n = s.node('HarborLoading');
    const size = this.node.getComponent(UITransform)!.contentSize; n.setPosition(-size.width / 2, size.height / 2); return n;
  }
  update(): void {
    if(this.dead)return;
    if(!this.view){
      const size=this.node.getComponent(UITransform)!.contentSize,device=this.platform.getDeviceInfo();
      if(this.loadingKey!==JSON.stringify({size,device,error:this.error}))this.drawLoading();
      return;
    }
    const size = this.node.getComponent(UITransform)!.contentSize, device = this.platform.getDeviceInfo(), ratio = size.width / device.windowWidth;
    this.view.resize(size.width, size.height, {
      top: device.safeArea.top * ratio, bottom: Math.max(0, device.windowHeight - device.safeArea.top - device.safeArea.height) * ratio,
      left: device.safeArea.left * ratio, right: Math.max(0, device.windowWidth - device.safeArea.left - device.safeArea.width) * ratio,
      // Mini game platforms can provide their capsule rect; reserve its bottom in logical units.
      capsuleBottom: (device.capsule?.bottom ?? device.safeArea.top) * ratio,
    }, { width:device.windowWidth,height:device.windowHeight });
    this.view.update();
  }
  onDestroy(): void {
    this.dead = true; this.offShow?.(); this.view?.destroy(); this.loading?.dispose(); this.model?.dispose();
    this.frames.forEach(frame => frame.decRef()); this.frames.clear(); this.font?.decRef(); this.font = undefined;
    this.posterFrames.forEach(frame => frame.decRef()); this.posterFrames.clear(); this.posterCreatures.clear();
    this.platform?.dispose();
  }
}
