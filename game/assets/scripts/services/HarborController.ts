import { _decorator, Component, assetManager, AssetManager, SpriteFrame, BitmapFont, UITransform, director, isValid } from 'cc';
import { WECHAT } from 'cc/env';
import { createPlatformAdapter } from '../platform/createPlatformAdapter';
import type { PlatformAdapter } from '../platform/PlatformAdapter';
import { EconomyService } from './local/EconomyService';
import { LocalSaveService } from './local/SaveService';
import { AdService } from './local/AdService';
import type { AdDriver } from './local/AdService';
import { HarborModel } from '../meta/HarborModel';
import { HarborView } from '../ui/HarborView';
import { UiScope, C } from '../ui/HarborKit';

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
  private drawLoading(): void {
    this.loading?.dispose(); if (this.dead) return;
    const s = this.loading = new UiScope(this.newLoadingRoot(), this.frames);
    s.box('LoadingPlate', { x: 15, y: 100, width: 345, height: 280 });
    s.text('LoadState', this.error || '正在准备母港…', 35, 130, 305, 80, 18, this.error ? C.danger : C.mint);
    if (this.error) s.button('retry-assets', { x: 35, y: 230, width: 305, height: 48 }, '重新连接港口', () => { void this.loadAssets(); });
    s.button('safe-dive', { x: 35, y: 300, width: 305, height: 48 }, '返回潜航现场', () => director.loadScene('Dive'));
  }
  private newLoadingRoot() {
    const s = new UiScope(this.node, this.frames), n = s.node('HarborLoading');
    const size = this.node.getComponent(UITransform)!.contentSize; n.setPosition(-size.width / 2, size.height / 2); return n;
  }
  update(): void {
    if (!this.view || this.dead) return;
    const size = this.node.getComponent(UITransform)!.contentSize, device = this.platform.getDeviceInfo(), ratio = size.width / device.windowWidth;
    this.view.resize(size.width, size.height, {
      top: device.safeArea.top * ratio, bottom: Math.max(0, device.windowHeight - device.safeArea.top - device.safeArea.height) * ratio,
      left: device.safeArea.left * ratio, right: Math.max(0, device.windowWidth - device.safeArea.left - device.safeArea.width) * ratio,
      // Mini game platforms can provide their capsule rect; reserve its bottom in logical units.
      capsuleBottom: (device.capsule?.bottom ?? device.safeArea.top) * ratio,
    });
    this.view.update();
  }
  onDestroy(): void {
    this.dead = true; this.offShow?.(); this.view?.destroy(); this.loading?.dispose(); this.model?.dispose();
    this.frames.forEach(frame => frame.decRef()); this.frames.clear(); this.font?.decRef(); this.font = undefined;
    this.platform?.dispose();
  }
}
