import type { DepthPosterData, PosterCreature, PosterImage } from '../PlatformAdapter';

/** Offline painter: no image requests, fonts, runtime AI or player identifiers. Encountered
 *  creatures render from the real in-game art when the caller supplies loaded frames;
 *  anything missing falls back to filled gradient silhouettes (never bare wireframes). */
export function drawDepthPoster(doc: Document, record: DepthPosterData, creatures?: ReadonlyMap<string, PosterCreature>): HTMLCanvasElement {
  if (!Number.isInteger(record.depth) || record.depth < 1 || record.depth > 2400 || !Array.isArray(record.encounters)) throw new RangeError('Invalid poster record');
  const canvas = doc.createElement('canvas'); canvas.width = 750; canvas.height = 1100;
  const c = canvas.getContext('2d'); if (!c) throw new Error('POSTER_CANVAS_UNAVAILABLE');
  const gradient = c.createLinearGradient(0, 0, 0, 1100);
  gradient.addColorStop(0, '#164d62'); gradient.addColorStop(.55, '#092a41'); gradient.addColorStop(1, '#020e20');
  c.fillStyle = gradient; c.fillRect(0, 0, 750, 1100);
  c.strokeStyle = '#72d7cc44'; c.lineWidth = 2;
  for (let y = 160; y < 1020; y += 100) { c.beginPath(); c.moveTo(52, y); c.lineTo(698, y); c.stroke(); }
  for (let i = 0; i < 42; i++) { c.fillStyle = '#9de6de55'; c.beginPath(); c.arc(35 + i * 73 % 680, 100 + i * 149 % 900, 1 + i % 3, 0, Math.PI * 2); c.fill(); }
  c.textAlign = 'center'; c.fillStyle = '#b6f5e6'; c.font = '24px sans-serif'; c.fillText('潜 渊 猎 手   /   深 度 纪 录', 375, 96);
  c.font = 'bold 126px sans-serif'; c.fillStyle = '#f2f9e9'; c.fillText(String(record.depth), 375, 285);
  c.font = '26px sans-serif'; c.fillStyle = '#a5e4dc'; c.fillText('米  ·  海底新坐标', 375, 340);
  c.font = '21px sans-serif'; c.fillText(record.depth < 800 ? '日光层' : record.depth < 1600 ? '暮光层' : '深渊层', 375, 390);
  const keys = Array.from(new Set(record.encounters)).slice(0, 12);
  c.font = '20px sans-serif'; c.fillText(`沿途相遇  ${keys.length} 种生物`, 375, 465);
  keys.forEach((key, i) => {
    const x = 145 + i % 3 * 230, y = 535 + Math.floor(i / 3) * 105;
    c.save(); c.translate(x, y);
    const creature = creatures?.get(key);
    if (creature && creature.source) {
      // Real encounter art, seated on a soft glow so it reads as part of the poster.
      const seat = c.createRadialGradient(0, 4, 4, 0, 4, 66);
      seat.addColorStop(0, '#2f8f8a4d'); seat.addColorStop(1, '#2f8f8a00');
      c.fillStyle = seat; c.beginPath(); c.arc(0, 4, 66, 0, Math.PI * 2); c.fill();
      const fit = Math.min(116 / creature.sw, 78 / creature.sh);
      const w = creature.sw * fit, h = creature.sh * fit;
      c.imageSmoothingEnabled = true;
      try { c.drawImage(creature.source as CanvasImageSource, creature.sx, creature.sy, creature.sw, creature.sh, -w / 2, -h / 2, w, h); } catch { /* unreadable source falls through to the silhouette */ }
    } else {
      // Filled gradient silhouette with a rim light — never a bare wireframe.
      c.fillStyle = '#041324'; c.strokeStyle = '#7fd8cc2e'; c.lineWidth = 2;
      const body = c.createLinearGradient(0, -34, 0, 30);
      body.addColorStop(0, '#1a5f6e'); body.addColorStop(1, '#0a3140');
      if (/jelly|squid|octopus|warden|worm/.test(key)) {
        c.fillStyle = body; c.beginPath(); c.ellipse(0, -10, 40, 26, 0, Math.PI, 0); c.lineTo(40, 2); c.lineTo(-40, 2); c.closePath(); c.fill();
        c.strokeStyle = '#8fe3d84d'; c.lineWidth = 2.5; c.beginPath(); c.ellipse(0, -10, 40, 26, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
        c.strokeStyle = '#6ec4bf55'; c.lineWidth = 3;
        for (let j = -3; j <= 3; j++) { c.beginPath(); c.moveTo(j * 10, 2); c.quadraticCurveTo(j * 14 + 12, 22, j * 9, 42); c.stroke(); }
        c.fillStyle = '#aef2e2b0'; c.beginPath(); c.arc(-12, -16, 3.4, 0, Math.PI * 2); c.fill();
      } else if (/crab|hermit|spider|isopod|star/.test(key)) {
        c.fillStyle = body; c.beginPath(); c.ellipse(0, 0, 30, 22, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#6ec4bf55'; c.lineWidth = 3;
        for (const sign of [-1, 1]) for (let j = -1; j <= 1; j++) { c.beginPath(); c.moveTo(sign * 22, j * 12); c.lineTo(sign * 47, j * 23 - 5); c.lineTo(sign * 55, j * 30 + 6); c.stroke(); }
        c.strokeStyle = '#8fe3d84d'; c.lineWidth = 2.5; c.beginPath(); c.ellipse(0, 0, 30, 22, 0, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
        c.fillStyle = '#aef2e2b0'; c.beginPath(); c.arc(-10, -8, 3, 0, Math.PI * 2); c.fill();
      } else {
        c.fillStyle = body; c.beginPath(); c.ellipse(-8, 0, /whale/.test(key) ? 50 : 37, /eel/.test(key) ? 13 : 23, -.12, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#1d6b7a'; c.beginPath(); c.moveTo(25, 0); c.lineTo(55, -25); c.lineTo(49, 25); c.closePath(); c.fill();
        c.strokeStyle = '#8fe3d84d'; c.lineWidth = 2.5; c.beginPath(); c.ellipse(-8, 0, /whale/.test(key) ? 50 : 37, /eel/.test(key) ? 13 : 23, -.12, Math.PI * .9, Math.PI * 1.8); c.stroke();
        c.fillStyle = '#aef2e2b0'; c.beginPath(); c.arc(-30, -7, 3.4, 0, Math.PI * 2); c.fill();
      }
    }
    c.restore();
  });
  c.font = '20px sans-serif'; c.fillStyle = '#87babd'; c.fillText('每 500 米，留下一次探索的证明。', 375, 1010);
  c.font = '16px sans-serif'; c.fillText('继续下潜，向更深处出发。', 375, 1050);
  return canvas;
}
export function renderDepthPoster(doc: Document, record: DepthPosterData, creatures?: ReadonlyMap<string, PosterCreature>): PosterImage {
  return { dataUrl: drawDepthPoster(doc, record, creatures).toDataURL('image/png'), filename: `abyss-depth-${record.depth}.png` };
}
