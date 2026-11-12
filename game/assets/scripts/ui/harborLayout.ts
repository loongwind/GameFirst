export interface Rect { x: number; y: number; width: number; height: number }
export interface HarborInsets { top?: number; bottom?: number; left?: number; right?: number; capsuleBottom?: number }
/** UI coordinates are logical 375-wide units, independent of texture resolution.
 *  LOO-70 §4 R2: no bottom navigation bar. Three scene stations (weld desk, crane,
 *  sonar table), supply and archive, and a single standalone launch button; the
 *  bottom 19px stays free for the home indicator and larger safe areas shift the
 *  whole lower cluster up instead of compressing touch targets. */
export function harborLayout(width: number, height: number, safe: HarborInsets = {}, viewport = { width, height }) {
  const scale = width / 375, h = height / scale;
  const left = 16 + (safe.left ?? 0) / scale, right = 16 + (safe.right ?? 0) / scale;
  const top = Math.max(safe.top ?? 0, safe.capsuleBottom ?? 0) / scale + 12;
  const bottom = (safe.bottom ?? 0) / scale, cssScale = viewport.height / h, touch = Math.max(44, 44 / cssScale);
  const safeBottom = Math.max(19, bottom);
  const launch = { x: 70, y: h - safeBottom - Math.max(47, touch), width: 235, height: Math.max(47, touch) } as Rect;
  const targets: Record<string, Rect> = {
    launch,
    // R2 device positions from the design table (375x667: weld y439, crane y375,
    // sonar y476, launch y600), anchored to the launch button so taller viewports keep
    // the composition and short ones never compress touch areas.
    equipment: { x: 266, y: launch.y - 225, width: 96, height: 167 },
    upgrade: { x: 16, y: launch.y - 161, width: 115, height: 115 },
    tech: { x: 148, y: launch.y - 124, width: 107, height: 102 },
    supply: { x: Math.max(12, left - 4), y: top + 219, width: 64, height: 64 },
    archive: { x: 375 - Math.max(12, right - 4) - 64, y: top + 219, width: 64, height: 64 },
  };
  const stationsTop = Math.min(targets.upgrade.y, targets.tech.y, targets.equipment.y);
  const heroSize = Math.max(72, Math.min(260, stationsTop - (top + 120) - 46));
  return { scale, height: h, top, bottom, left, right, cssScale, touch, heroSize, targets,
    heroY: (top + 120 + stationsTop - 30) / 2 - heroSize / 2,
    panel: { x: left - 4, y: top, width: 375 - left - right + 8, height: h - bottom - top - 12 } as Rect };
}
/** Two overscan rows; bounded even when ScrollView elastically overscrolls. */
export function virtualRange(count: number, offset: number, viewport: number, rowHeight: number) {
  const visible = Math.ceil(viewport / rowHeight), maxStart = Math.max(0, count - visible - 1);
  const start = Math.min(maxStart, Math.max(0, Math.floor(offset / rowHeight) - 1));
  return { start, end: Math.min(count, start + visible + 3) };
}
