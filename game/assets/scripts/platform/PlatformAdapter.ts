/** Platform-free contract. Browser APIs and wx belong in implementations only. */
export type Unsubscribe = () => void;
export interface DepthPosterData { depth: number; diveId: string; encounters: readonly string[] }
export interface PosterImage { dataUrl: string; filename: string }
/** A ready-to-draw creature for the depth poster. `source` is deliberately platform-free
 *  here; only each implementation's painter interprets it (browser: image/canvas/bitmap). */
export interface PosterCreature { readonly source: unknown; readonly sx: number; readonly sy: number; readonly sw: number; readonly sh: number }

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
  /** Rendering tier: low degrades decorative layers, never collision or danger hints. */
  readonly quality: 'high' | 'low';
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
  createDepthPoster(record: DepthPosterData, creatures?: ReadonlyMap<string, PosterCreature>): PosterImage;
  /** Resolves after handing the local PNG to the platform download/save mechanism. */
  saveDepthPoster(record: DepthPosterData): Promise<{ filename: string }>;
  /** Owner releases browser/native event listeners on teardown. */
  dispose(): void;
}
