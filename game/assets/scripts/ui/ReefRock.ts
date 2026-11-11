export interface RockPoint { x: number; y: number }

/** Uneven planar faces tangent to the existing round collider. Corners are decorative:
 * max 57° face spacing gives <14% radial excess (<6.4 units at the largest radius 46).
 * Build once per obstacle; render never allocates a node or recomputes the hull.
 */
export function reefRockHull(radius: number, rotation: number): RockPoint[] {
  const normals = [0,46,92,148,199,249,306].map(degrees=>degrees*Math.PI/180+rotation);
  return normals.map((a,i)=>{
    const b=i===normals.length-1?normals[0]+Math.PI*2:normals[i+1];
    const reach=radius/Math.cos((b-a)/2),angle=(a+b)/2;
    return {x:Math.cos(angle)*reach,y:Math.sin(angle)*reach};
  });
}
