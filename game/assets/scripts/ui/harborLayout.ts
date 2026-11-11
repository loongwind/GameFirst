export interface Rect { x: number; y: number; width: number; height: number }
export interface HarborInsets { top?: number; bottom?: number; left?: number; right?: number; capsuleBottom?: number }
/** UI coordinates are logical 375-wide units, independent of texture resolution. */
export function harborLayout(width: number, height: number, safe: HarborInsets = {}, viewport = { width, height }) {
  const scale = width / 375, h = height / scale;
  const left = 16 + (safe.left ?? 0) / scale, right = 16 + (safe.right ?? 0) / scale;
  const top = Math.max(safe.top ?? 0, safe.capsuleBottom ?? 0) / scale + 12;
  const bottom = (safe.bottom ?? 0) / scale, cssScale = viewport.height / h, touch = Math.max(44, 44 / cssScale);
  const navHeight = Math.max(60,touch), navY = h - bottom - navHeight - 12;
  const usable = 375 - left - right, navWidth = (usable - 18) / 4;
  const targets: Record<string, Rect> = {
    archive: { x: 375 - right - 58, y: navY - Math.max(56,touch) - touch - 32, width: 58, height: touch },
    tasks: { x: left, y: navY - Math.max(56,touch) - touch - 32, width: usable - 66, height: touch },
    launch: { x: left, y: navY - Math.max(56,touch) - 16, width: usable, height: Math.max(56,touch) },
  };
  ['upgrade', 'tech', 'equipment', 'supply'].forEach((name, i) => { targets[name] = { x: left + i * (navWidth + 6), y: navY, width: navWidth, height: navHeight }; });
  const heroSize = Math.max(50,Math.min(260,targets.tasks.y-top-145));
  return { scale, height: h, top, bottom, left, right, navY, targets, cssScale, touch, heroSize,
    heroY: (top+112+targets.tasks.y-30)/2-heroSize/2,
    panel: { x: left - 4, y: top, width: usable + 8, height: h-bottom-top-12 } as Rect };
}
/** Two overscan rows; bounded even when ScrollView elastically overscrolls. */
export function virtualRange(count: number, offset: number, viewport: number, rowHeight: number) {
  const visible = Math.ceil(viewport / rowHeight), maxStart = Math.max(0, count - visible - 1);
  const start = Math.min(maxStart, Math.max(0, Math.floor(offset / rowHeight) - 1));
  return { start, end: Math.min(count, start + visible + 3) };
}
