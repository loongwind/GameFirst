import type { DeviceInfo, PlatformAdapter, PlatformStorage, Unsubscribe } from '../PlatformAdapter';

/** Real browser platform, not a reward/storage simulator. */
export class BrowserPlatformAdapter implements PlatformAdapter {
  readonly kind = 'browser' as const;
  readonly isMock = false;
  readonly storage: PlatformStorage;
  private readonly host: Window;
  private readonly showListeners = new Set<() => void>();
  private readonly hideListeners = new Set<() => void>();
  private visible: boolean;
  private disposed = false;

  constructor(host: Window = window) {
    this.host = host;
    this.visible = host.document.visibilityState !== 'hidden';
    const keyFor = (key: string): string => `abyss-hunter:${key}`;
    this.storage = {
      getItem: key => host.localStorage.getItem(keyFor(key)),
      setItem: (key, value) => host.localStorage.setItem(keyFor(key), value),
      removeItem: key => host.localStorage.removeItem(keyFor(key)),
    };
    host.document.addEventListener('visibilitychange', this.onVisibilityChange);
    host.addEventListener('pagehide', this.onPageHide);
    host.addEventListener('pageshow', this.onPageShow);
  }

  onShow(listener: () => void): Unsubscribe {
    this.showListeners.add(listener);
    return () => { this.showListeners.delete(listener); };
  }

  onHide(listener: () => void): Unsubscribe {
    this.hideListeners.add(listener);
    return () => { this.hideListeners.delete(listener); };
  }

  getDeviceInfo(): DeviceInfo {
    const { host } = this;
    return {
      platform: this.kind,
      system: host.navigator.platform,
      screenWidth: host.screen.width,
      screenHeight: host.screen.height,
      windowWidth: host.innerWidth,
      windowHeight: host.innerHeight,
      pixelRatio: host.devicePixelRatio,
      // A browser reports its layout viewport; native safe areas belong to the WeChat adapter.
      safeArea: { left: 0, top: 0, width: host.innerWidth, height: host.innerHeight },
    };
  }

  dispose(): void {
    this.disposed = true;
    this.host.document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.host.removeEventListener('pagehide', this.onPageHide);
    this.host.removeEventListener('pageshow', this.onPageShow);
    this.showListeners.clear();
    this.hideListeners.clear();
  }

  private readonly onVisibilityChange = (): void => {
    this.changeVisibility(this.host.document.visibilityState !== 'hidden');
  };
  private readonly onPageHide = (): void => { this.changeVisibility(false); };
  private readonly onPageShow = (): void => {
    this.changeVisibility(this.host.document.visibilityState !== 'hidden');
  };

  private changeVisibility(visible: boolean): void {
    if (this.disposed || this.visible === visible) return;
    this.visible = visible;
    const listeners = visible ? this.showListeners : this.hideListeners;
    for (const listener of [...listeners]) listener();
  }
}
