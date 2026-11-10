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
  const joystick = rect(left + 18, bottom - 122, 112, 112);
  const status = rect(left + 18, top + 148, 295 - left - right, 28);
  const modalHeight = Math.min(280, joystick.y - (status.y + status.height) - 20);
  const modal = rect(left + 22, status.y + status.height + (joystick.y - status.y - status.height - modalHeight) / 2, 331 - left - right, modalHeight);
  return {
    scale, height: h, top, left, right,
    oxygen: rect(left + 18, top + 64, 295 - left - right, 40),
    cargo: rect(left + 18, top + 110, 295 - left - right, 28), status, joystick, modal,
    rail: rect(335 - right, top + 192, 22, joystick.y - top - 208),
    pause: rect(156 - right, bottom - 68, 74, 52),
    return: rect(240 - right, bottom - 68, 117, 52),
    primary: rect(modal.x + 16, modal.y + modal.height - 116, modal.width - 32, 48),
    secondary: rect(modal.x + 16, modal.y + modal.height - 60, modal.width - 32, 48),
  };
}
export type HudLayout = ReturnType<typeof hudLayout>;
