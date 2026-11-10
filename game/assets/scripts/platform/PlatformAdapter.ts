/** Platform-free contract. Browser APIs and wx belong in implementations only. */
export type Unsubscribe = () => void;

export interface PlatformStorage {
  /** Missing keys return null. Permission/quota failures must propagate. */
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DeviceInfo {
  readonly platform: 'browser' | 'wechat';
  readonly system: string;
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly windowWidth: number;
  readonly windowHeight: number;
  readonly pixelRatio: number;
  /** Native menu button bounds, in window logical pixels. */
  readonly capsule?: { readonly bottom: number };
  readonly safeArea: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
}

export interface PlatformAdapter {
  readonly kind: 'browser' | 'wechat';
  /** Any future simulator must explicitly set true; release must reject it. */
  readonly isMock: boolean;
  readonly storage: PlatformStorage;
  onShow(listener: () => void): Unsubscribe;
  onHide(listener: () => void): Unsubscribe;
  getDeviceInfo(): DeviceInfo;
  /** Owner releases browser/native event listeners on teardown. */
  dispose(): void;
}
