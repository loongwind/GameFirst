export interface Vector { x: number; y: number }

export function joystickVector(dx: number, dy: number, radius: number, deadZone = 0.12): Vector {
  if (![dx, dy, radius, deadZone].every(Number.isFinite) || radius <= 0 || deadZone < 0 || deadZone >= 1) return { x: 0, y: 0 };
  const length = Math.hypot(dx, dy);
  const fraction = Math.min(1, length / radius);
  if (fraction <= deadZone) return { x: 0, y: 0 };
  const magnitude = (fraction - deadZone) / (1 - deadZone);
  return { x: dx / length * magnitude, y: dy / length * magnitude };
}
