/** Cocos uses upward-positive y. Only camera displacement drives these decorative strips.
 * Mirror alternating world tiles so the two texture edges always meet themselves.
 * The caller renders span+2 high to cover subpixel filtering at seams. */
export function wallTiles(cameraY: number, span: number, rate: number): { index: number; y: number; flip: number }[] {
  const offset = cameraY * rate, center = Math.floor(offset / span);
  return [-1, 0, 1].map(delta => {
    const index = center + delta;
    return { index, y: offset - index * span, flip: Math.abs(index % 2) ? -1 : 1 };
  }).sort((a, b) => a.y - b.y);
}
