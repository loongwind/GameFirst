import { _decorator, Component, director, UITransform } from 'cc';
import { UiScope, C } from '../ui/HarborKit';
import { WECHAT } from 'cc/env';
import { PROTOCOL_VERSION } from '@abyss-hunter/shared';
import { createPlatformAdapter } from '../platform/createPlatformAdapter';
import type { PlatformAdapter } from '../platform/PlatformAdapter';
import { EconomyService } from './local/EconomyService';
import { LocalSaveService } from './local/SaveService';

const { ccclass } = _decorator;

@ccclass('Boot')
export class Boot extends Component {
  private ui?: UiScope;
  private platform: PlatformAdapter | undefined;

  onLoad(): void {
    this.platform = createPlatformAdapter(WECHAT ? 'wechat' : 'browser');
    if (this.platform.isMock) throw new Error('Boot requires a real platform adapter.');
    console.info(`[Boot] ready (${this.platform.kind}); protocol=${PROTOCOL_VERSION}`);
  }

  start(): void {
    const economy = new EconomyService(new LocalSaveService(this.platform!.storage));
    const state = economy.snapshot;
    if (state.activeDive || state.objectives.tutorial.active && state.objectives.tutorial.step < 5) {
      director.loadScene('Dive'); return;
    }
    const canvas = this.node.getChildByName('Canvas')!;
    const root = new UiScope(canvas, new Map()).node('StartTerminal');
    const size = canvas.getComponent(UITransform)!.contentSize;
    root.setPosition(-size.width / 2, size.height / 2);
    this.ui = new UiScope(root, new Map());
    this.ui.text('Title', '潜 渊 猎 手', 40, 180, 295, 50, 32, C.mint);
    this.ui.text('Subtitle', '潮汐号已就绪，准备下一次远航。', 40, 240, 295, 40, 14, C.muted);
    this.ui.button('EnterHarbor', { x: 40, y: 310, width: 295, height: 56 }, '进入母港', () => director.loadScene('Harbor'), true, undefined, true);
  }

  onDestroy(): void {
    this.ui?.dispose();
    this.platform?.dispose();
  }
}
