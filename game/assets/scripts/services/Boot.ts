import { _decorator, Component } from 'cc';
import { WECHAT } from 'cc/env';
import { PROTOCOL_VERSION } from '@abyss-hunter/shared';
import { createPlatformAdapter } from '../platform/createPlatformAdapter';
import type { PlatformAdapter } from '../platform/PlatformAdapter';

const { ccclass } = _decorator;

@ccclass('Boot')
export class Boot extends Component {
  private platform: PlatformAdapter | undefined;

  onLoad(): void {
    this.platform = createPlatformAdapter(WECHAT ? 'wechat' : 'browser');
    if (this.platform.isMock) throw new Error('Boot requires a real platform adapter.');
    console.info(`[Boot] ready (${this.platform.kind}); protocol=${PROTOCOL_VERSION}`);
  }

  onDestroy(): void {
    this.platform?.dispose();
  }
}
