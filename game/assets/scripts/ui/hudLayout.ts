export interface HudRect { x: number; y: number; width: number; height: number }
export interface HudInsets { top: number; bottom: number; left?: number; right?: number }
export interface HudViewport { width: number; height: number }

/** Coordinates start at the top left, in 375-wide logical units. */
export function hudLayout(width: number, height: number, insets: HudInsets = { top: 0, bottom: 0 }, viewport: HudViewport = { width, height }) {
  if (![width, height, viewport.width, viewport.height].every(n => Number.isFinite(n) && n > 0)
    || ![insets.top, insets.bottom, insets.left ?? 0, insets.right ?? 0].every(n => Number.isFinite(n) && n >= 0)) throw new RangeError('Invalid HUD bounds');
  const scale = width / 375, h = height / scale;
  const top = insets.top / scale, bottom = h - insets.bottom / scale;
  const left = (insets.left ?? 0) / scale, right = (insets.right ?? 0) / scale;
  const rect = (x: number, y: number, w: number, rh: number): HudRect => ({ x, y, width: w, height: rh });
  // Canvas/UITransform dimensions are logical; CSS pixels come from the actual viewport.
  // DPR changes backing pixels, not touch targets, so it must not enter this conversion.
  const cssScale = viewport.height / h;
  const compact = bottom - top < 500;
  const touch = compact ? 44/cssScale : Math.max(44,44/cssScale);
  const joystick = rect(left + 18, bottom - 122, 112, 112); // legacy test anchor; never an input restriction
  const status = rect(left + 14, top + 66, 347 - left - right, 26);
  const modalHeight = compact ? bottom-top-8 : Math.min(280, joystick.y - (status.y + status.height) - 20);
  const modal = rect(left + 22, compact ? top+4 : status.y + status.height + (joystick.y - status.y - status.height - modalHeight) / 2, 331 - left - right, modalHeight);
  const dockY = bottom-touch-(compact ? 4 : 10);
  const cardBottom = dockY-8, cardHeight = compact ? touch+8 : touch+56;
  const modalTouch = compact ? touch : Math.max(48,touch);
  const primaryY = modal.y+modal.height-8-2*modalTouch-8;
  return {
    scale, height: h, top, left, right, compact, cssScale,
    oxygen: rect(left + 18, top + 12, 153 - left, 24),
    cargo: rect(left + 18, top + 42, 230 - left - right, 22), status, joystick, modal,
    // LOO-70 §4 R2: pause moves to the far left (clear of the WeChat capsule cluster),
    // then the sonar supply, then surface on the right. Four mount sockets sit above.
    pause: rect(left + 12, dockY, 60, touch),
    sonar: rect(left + 80, dockY, Math.max(80, 130 - left - right), touch),
    seaRetry: rect(left + 12, dockY + touch + 8, 125 - left - right, touch),
    mounts: rect(left + 12, dockY - 34, 351 - left - right, 26),
    oxygenCard: rect(left + 12, cardBottom-cardHeight, compact ? 142 : 351-left-right, cardHeight),
    oxygenAd: rect(left + (compact ? 16 : 20), cardBottom-touch-(compact ? 4 : 8), compact ? 61 : 170-left-right, touch),
    oxygenDismiss: rect(compact ? left+83 : 202-right, cardBottom-touch-(compact ? 4 : 8), compact ? 61 : 151, touch),
    rail: rect(357 - right, top + 126, 6, joystick.y - top - 140),
    return: rect(218 - right, dockY, 145, touch),
    primary: rect(modal.x + 16, primaryY, modal.width - 32, modalTouch),
    secondary: rect(modal.x + 16, modal.y+modal.height-8-modalTouch, modal.width - 32, modalTouch),
  };
}
export type HudLayout = ReturnType<typeof hudLayout>;
