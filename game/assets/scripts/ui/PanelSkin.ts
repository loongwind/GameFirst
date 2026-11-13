import { Color, Graphics } from 'cc';

/** Original native steelwork. Coordinates use a top-left origin with upward-positive y.
 * Shared by harbor scopes and dive overlays, including loading/error states. */
export function steelPlate(g: Graphics, x: number, y: number, w: number, h: number, fill: Color, accent = false, enabled = true): void {  if (w <= 0 || h <= 0) return;
  const cut = Math.min(9, h / 5, w / 5);
  const path = (px: number, py: number, width: number, height: number, c: number): void => {
    g.moveTo(px+c,py);g.lineTo(px+width,py);g.lineTo(px+width,py-height+c);g.lineTo(px+width-c,py-height);
    g.lineTo(px,py-height);g.lineTo(px,py-c);g.close();
  };
  if (h < 12) { g.fillColor=fill;g.rect(x,y-h,w,h);g.fill();return; }
  g.fillColor=new Color(0,9,16,160);path(x+2,y-3,w,h,cut);g.fill();
  g.fillColor=fill;g.strokeColor=enabled ? accent ? new Color(225,181,105) : new Color(68,116,130) : new Color(45,65,75);
  g.lineWidth=accent?1.5:1;path(x,y,w,h,cut);g.fill();g.stroke();
  if (w > 30 && h > 26) {
    g.strokeColor=accent?new Color(255,218,151,100):new Color(126,178,187,55);g.lineWidth=1;
    path(x+3,y-3,w-6,h-6,Math.max(2,cut-2));g.stroke();
    g.fillColor=accent?new Color(255,218,151,180):new Color(133,167,170,90);
    g.rect(x+8,y-4,Math.min(28,w/5),1);g.rect(x+w-11,y-h+7,3,3);g.fill();
    if (h > 90) {
      // Fine engraving and corner fasteners belong to the material, not text content.
      g.strokeColor=new Color(136,192,200,14);g.lineWidth=1;
      for(let row=18;row<h-8;row+=24){g.moveTo(x+6,y-row);g.lineTo(x+w-6,y-row);}
      g.stroke();
      g.fillColor=new Color(154,181,176,120);g.rect(x+7,y-h+10,3,3);g.rect(x+w-10,y-10,3,3);g.fill();
    }
  }
}

/** Amber enamel action plate (LOO-70 §4 tokens: #F5B74F face, darker bevel, top light).
 *  Used for primary actions in every panel so harbour and dive modals share one style. */
export function amberPlate(g: Graphics, x: number, y: number, w: number, h: number, pressed = false, enabled = true): void {
  if (w <= 0 || h <= 0) return;
  const radius = Math.min(10, h / 4);
  const face = enabled ? pressed ? new Color(224, 158, 66) : new Color(245, 183, 79) : new Color(96, 104, 108);
  // Drop shadow gives the plate its raised enamel read on both quality tiers.
  g.fillColor = new Color(0, 9, 16, 150);
  g.roundRect(x + 1.5, y - h - 2.5, w, h, radius); g.fill();
  g.fillColor = face;
  g.roundRect(x, y - h, w, h, radius); g.fill();
  g.strokeColor = enabled ? new Color(150, 96, 34) : new Color(52, 62, 66);
  g.lineWidth = 1.5;
  g.roundRect(x, y - h, w, h, radius); g.stroke();
  if (enabled && h >= 30) {
    // Top-edge highlight band and two corner rivets, matching the riveted skin language.
    g.strokeColor = new Color(255, 226, 160, 170); g.lineWidth = 1;
    g.roundRect(x + 2.5, y - h + 2.5, w - 5, h - 5, Math.max(2, radius - 2)); g.stroke();
    g.fillColor = new Color(122, 84, 42);
    g.circle(x + 9, y - 9, 1.6); g.fill(); g.circle(x + w - 9, y - 9, 1.6); g.fill();
  }
}
