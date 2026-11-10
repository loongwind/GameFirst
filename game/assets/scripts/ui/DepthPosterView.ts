import { assetManager, ImageAsset, Texture2D, SpriteFrame, Sprite, UITransform } from 'cc';
import type { DepthRecord } from '../services/local/Objectives';
import type { PosterImage } from '../platform/PlatformAdapter';
import { UiScope, C } from './HarborKit';

export interface PosterPort {
  create(record: DepthRecord): PosterImage;
  save(record: DepthRecord): Promise<{ filename: string }>;
}
/** Owner scope prevents late PNG loads or save responses from reviving a closed panel. */
export function depthPosterView(s: UiScope, width: number, height: number, record: DepthRecord, port: PosterPort): void {
  const previewH = Math.max(80, height - 210), previewW = Math.min(width - 40, previewH * 750 / 1100);
  const n = s.node('DepthPosterPNG', s.root, (width - previewW) / 2, 88, previewW, previewH);
  const sprite = n.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
  const status = s.text('PosterStatus', '正在本地绘制纪录…', 16, height - 112, width - 32, 42, 11, C.mint);
  try {
    const image = port.create(record);
    assetManager.loadRemote<ImageAsset>(image.dataUrl, { ext: '.png', cacheEnabled: false }, (error, asset) => {
      if (error || !asset) { if (s.alive) status.string = '海报预览未就绪，可重开面板或直接保存。'; return; }
      asset.addRef();
      if (!s.alive) { asset.decRef(); return; }
      const texture = new Texture2D(); texture.image = asset;
      const frame = new SpriteFrame(); frame.texture = texture; sprite.spriteFrame = frame;
      n.getComponent(UITransform)!.setContentSize(previewW, previewH);
      s.own(() => { sprite.spriteFrame = null; frame.destroy(); texture.destroy(); asset.decRef(); });
      status.string = `${record.depth}m · ${record.encounters.length} 种沿途生物 · 本地 PNG`;
    });
  } catch { status.string = '本地绘制失败，请重新打开后重试。'; }
  let saving = false;
  s.button('save-depth-poster', { x: 16, y: height - 66, width: width - 32, height: 48 }, '保存深度海报', () => {
    if (saving) return; saving = true;
    status.string = '正在保存本地海报…';
    void port.save(record).then(() => { if (s.alive) status.string = '已交给浏览器下载，请在下载列表查看 PNG。'; }, () => {
      if (s.alive) status.string = '保存未完成，请重试；深度纪录已保留。';
    }).finally(() => { saving = false; });
  }, true, undefined, true);
}
