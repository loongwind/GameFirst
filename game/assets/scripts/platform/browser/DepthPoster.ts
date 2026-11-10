import type { DepthPosterData, PosterImage } from '../PlatformAdapter';

/** Offline procedural silhouettes: no image requests, fonts, runtime AI or player identifiers. */
export function drawDepthPoster(doc: Document, record: DepthPosterData): HTMLCanvasElement {
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
    c.save(); c.translate(x, y); c.fillStyle = '#041324'; c.strokeStyle = '#6ec4bf'; c.lineWidth = 3;
    if (/jelly|squid|octopus|warden|worm/.test(key)) {
      c.beginPath(); c.ellipse(0, -8, 40, 25, 0, Math.PI, 0); c.lineTo(40, 0); c.lineTo(-40, 0); c.closePath(); c.fill(); c.stroke();
      for (let j = -3; j <= 3; j++) { c.beginPath(); c.moveTo(j * 10, 0); c.quadraticCurveTo(j * 14 + 12, 20, j * 9, 40); c.stroke(); }
    } else if (/crab|hermit|spider|isopod|star/.test(key)) {
      c.beginPath(); c.ellipse(0, 0, 28, 20, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      for (const sign of [-1, 1]) for (let j = -1; j <= 1; j++) { c.beginPath(); c.moveTo(sign * 20, j * 12); c.lineTo(sign * 47, j * 23 - 5); c.lineTo(sign * 55, j * 30 + 6); c.stroke(); }
    } else {
      c.beginPath(); c.ellipse(-8, 0, /whale/.test(key) ? 50 : 37, /eel/.test(key) ? 12 : 23, -.12, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(25, 0); c.lineTo(55, -25); c.lineTo(49, 25); c.closePath(); c.fill(); c.stroke();
    }
    c.restore();
  });
  c.font = '20px sans-serif'; c.fillStyle = '#87babd'; c.fillText('每 500 米，留下一次探索的证明。', 375, 1010);
  c.font = '16px sans-serif'; c.fillText('继续下潜，向更深处出发。', 375, 1050);
  return canvas;
}
export function renderDepthPoster(doc: Document, record: DepthPosterData): PosterImage {
  return { dataUrl: drawDepthPoster(doc, record).toDataURL('image/png'), filename: `abyss-depth-${record.depth}.png` };
}
