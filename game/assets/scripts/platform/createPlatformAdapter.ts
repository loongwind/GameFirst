import { BrowserPlatformAdapter } from './browser/BrowserPlatformAdapter';
import type { PlatformAdapter } from './PlatformAdapter';

export function createPlatformAdapter(platform: 'browser' | 'wechat'): PlatformAdapter {
  if (platform === 'wechat') throw new Error('WeChat PlatformAdapter is not implemented (stage three).');
  return new BrowserPlatformAdapter();
}
