export interface Rect { x: number; y: number; width: number; height: number }
export interface HarborInsets { top?: number; bottom?: number; left?: number; right?: number; capsuleBottom?: number }
/** UI coordinates are logical 375-wide units, independent of texture resolution. */
export function harborLayout(width: number, height: number, safe: HarborInsets = {}) {
  const scale = width / 375, h = height / scale;
  const left = 16 + (safe.left ?? 0) / scale, right = 16 + (safe.right ?? 0) / scale;
  const top = Math.max(safe.top ?? 0, safe.capsuleBottom ?? 0) / scale + 12;
  const bottom = (safe.bottom ?? 0) / scale, navY = h - bottom - 76;
  const usable = 375 - left - right, navWidth = (usable - 18) / 4;
  const targets: Record<string, Rect> = {
    gift: { x: left, y: top + 116, width: 68, height: 64 },
    blessing: { x: 153.5, y: top + 116, width: 68, height: 64 },
    sonar: { x: 375 - right - 68, y: top + 116, width: 68, height: 64 },
    archive: { x: 375 - right - 62, y: navY - 150, width: 62, height: 56 },
    launch: { x: left + 28, y: navY - 74, width: usable - 56, height: 56 },
  };
  ['upgrade', 'tech', 'equipment', 'supply'].forEach((name, i) => { targets[name] = { x: left + i * (navWidth + 6), y: navY, width: navWidth, height: 60 }; });
  return { scale, height: h, top, bottom, left, right, navY, targets,
    panel: { x: left - 4, y: top + 54, width: usable + 8, height: navY - top - 62 } as Rect };
}
/** Two overscan rows; bounded even when ScrollView elastically overscrolls. */
export function virtualRange(count: number, offset: number, viewport: number, rowHeight: number) {
  const visible = Math.ceil(viewport / rowHeight), maxStart = Math.max(0, count - visible - 1);
  const start = Math.min(maxStart, Math.max(0, Math.floor(offset / rowHeight) - 1));
  return { start, end: Math.min(count, start + visible + 3) };
}
