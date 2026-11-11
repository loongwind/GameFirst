export interface HudRect { x: number; y: number; width: number; height: number }
export interface HudInsets { top: number; bottom: number; left?: number; right?: number }

/** Coordinates start at the top left, in 375-wide logical units. */
export function hudLayout(width: number, height: number, insets: HudInsets = { top: 0, bottom: 0 }) {
  if (![width, height].every(n => Number.isFinite(n) && n > 0)
    || ![insets.top, insets.bottom, insets.left ?? 0, insets.right ?? 0].every(n => Number.isFinite(n) && n >= 0)) throw new RangeError('Invalid HUD bounds');
  const scale = width / 375, h = height / scale;
  const top = insets.top / scale, bottom = h - insets.bottom / scale;
  const left = (insets.left ?? 0) / scale, right = (insets.right ?? 0) / scale;
  const rect = (x: number, y: number, w: number, rh: number): HudRect => ({ x, y, width: w, height: rh });
  // Targets remain >=44 physical CSS pixels even on 320px wide phones.
  const touch = Math.max(44, 44 / scale);
  const joystick = rect(left + 18, bottom - 122, 112, 112); // legacy test anchor; never an input restriction
  const status = rect(left + 14, top + 66, 347 - left - right, 26);
  const modalHeight = Math.min(280, joystick.y - (status.y + status.height) - 20);
  const modal = rect(left + 22, status.y + status.height + (joystick.y - status.y - status.height - modalHeight) / 2, 331 - left - right, modalHeight);
  return {
    scale, height: h, top, left, right,
    oxygen: rect(left + 18, top + 12, 153 - left, 24),
    cargo: rect(left + 18, top + 42, 230 - left - right, 22), status, joystick, modal,
    sonar: rect(left + 12, bottom - touch - 10, 125 - left - right, touch),
    oxygenCard: rect(left + 12, bottom - touch - 118, 351 - left - right, 100),
    oxygenAd: rect(left + 20, bottom - touch * 2 - 26, 170 - left - right, touch),
    oxygenDismiss: rect(202 - right, bottom - touch * 2 - 26, 151, touch),
    rail: rect(357 - right, top + 126, 6, joystick.y - top - 140),
    pause: rect(145 - right, bottom - touch - 10, 65, touch),
    return: rect(218 - right, bottom - touch - 10, 145, touch),
    primary: rect(modal.x + 16, modal.y + modal.height - 116, modal.width - 32, 48),
    secondary: rect(modal.x + 16, modal.y + modal.height - 60, modal.width - 32, 48),
  };
}
export type HudLayout = ReturnType<typeof hudLayout>;
