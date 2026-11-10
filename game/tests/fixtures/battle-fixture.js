import { Battle, joystickVector } from '/assets/scripts/battle/index.ts';

const params = new URLSearchParams(location.search);
const enemyCount = params.get('enemies') === '40' ? 40 : 80;
const stress = params.get('stress') === '1' || !location.search;
const seed = Number(params.get('seed') || 7);
const form = document.querySelector('form');
form.elements.enemies.value = String(enemyCount); form.elements.seed.value = String(seed); form.elements.stress.checked = stress;
const battle = new Battle({ seed, spawn: !stress, spawnIntervalTicks: 3, capacities: { enemies: enemyCount }, weapons: ['sonic', 'torpedo', 'arc', 'mine'].map(kind => ({ kind })) });
const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
const metricsOutput = document.querySelector('#metrics');
const samples = { frame: [], logic: [], cpu: [], draw: [] };
let frame = 0, lastTime, alpha = 0, paused = false, pointer, serial = 0;
let camera = { x: 0, y: 0 };
const keys = new Set();
let stick = { x: 0, y: 0 };

function replenish() {
  while (battle.enemies.size < enemyCount) {
    const angle = serial++ * 2.399963229728653;
    const r = 90 + (serial % 7) * 30;
    battle.spawnEnemy({ x: battle.player.x + Math.cos(angle) * r, y: battle.player.y + Math.sin(angle) * r, hp: 50, speed: 20 });
  }
  if (!stress) return;
  while (battle.projectiles.size < 200) {
    const p = battle.projectiles.acquire(), angle = serial++ * 2.399963229728653;
    p.kind = serial % 20 === 0 ? 'mine' : serial % 10 === 0 ? 'sonic' : 'torpedo';
    p.x = p.previousX = battle.player.x + Math.cos(angle) * 250;
    p.y = p.previousY = battle.player.y + Math.sin(angle) * 250;
    p.damage = 5; p.radius = p.kind === 'mine' ? 55 : 3; p.triggerRadius = 25;
    p.vx = -Math.cos(angle) * 180; p.vy = -Math.sin(angle) * 180;
    p.speed = 180; p.range = 100; p.bornTick = battle.tick; p.expiresTick = battle.tick + 90; p.owner = -1;
  }
  while (battle.loot.size < 100) {
    const angle = serial++ * 2.399963229728653;
    battle.addLoot(battle.player.x + Math.cos(angle) * 160, battle.player.y + Math.sin(angle) * 160, 1);
  }
}

const point = e => {
  const rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) * canvas.width / rect.width, y: (e.clientY - rect.top) * canvas.height / rect.height };
};
canvas.addEventListener('pointerdown', e => { if (point(e).y < 450) return; pointer = e.pointerId; canvas.setPointerCapture(pointer); moveStick(e); });
function moveStick(e) {
  if (e.pointerId !== pointer) return;
  const p = point(e); stick = joystickVector(p.x - 95, p.y - 580, 55); battle.setInput(stick.x, stick.y);
}
canvas.addEventListener('pointermove', moveStick);
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, () => { pointer = undefined; stick = { x: 0, y: 0 }; battle.setInput(0, 0); });
window.addEventListener('keydown', e => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'w', 'a', 's', 'd'].includes(e.key)) { e.preventDefault(); keys.add(e.key); } });
window.addEventListener('keyup', e => keys.delete(e.key));
function suspend(value) { paused = value; keys.clear(); pointer = undefined; stick = { x: 0, y: 0 }; battle.setPaused(value); lastTime = undefined; }
document.addEventListener('visibilitychange', () => suspend(document.hidden));
window.addEventListener('blur', () => suspend(true)); window.addEventListener('focus', () => suspend(document.hidden));

function position(item) { return { x: 360 + item.previousX + (item.x - item.previousX) * alpha - camera.x, y: 300 + item.previousY + (item.y - item.previousY) * alpha - camera.y }; }
function circle(x, y, r, color, stroke = false) { ctx.beginPath(); ctx.arc(x, y, Math.max(1, r), 0, Math.PI * 2); ctx[stroke ? 'strokeStyle' : 'fillStyle'] = color; ctx[stroke ? 'stroke' : 'fill'](); }
function draw() {
  camera = battle.samplePlayer(alpha);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#123342'; ctx.lineWidth = 1;
  for (let x = -camera.x % 64; x < 720; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 680); ctx.stroke(); }
  for (let y = -camera.y % 64; y < 680; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(720, y); ctx.stroke(); }
  for (const l of battle.loot.values()) { const p = position(l); circle(p.x, p.y, 3, '#75efb3'); }
  for (const e of battle.enemies.values()) { const p = position(e); circle(p.x, p.y, e.radius, '#be5a7f'); }
  for (const p of battle.projectiles.values()) {
    const pos = position(p);
    circle(pos.x, pos.y, p.radius, p.kind === 'sonic' ? '#4cd4df' : p.kind === 'mine' ? '#ff9f43' : '#f6e4a7', p.kind !== 'torpedo');
    if (p.kind === 'mine') circle(pos.x, pos.y, 5, '#ff9f43');
  }
  for (const e of battle.effects.values()) {
    const p = position(e); ctx.strokeStyle = '#b594ff'; ctx.lineWidth = 2;
    if (e.kind === 'arc') { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(360 + e.endX - camera.x, 300 + e.endY - camera.y); ctx.stroke(); }
    else circle(p.x, p.y, e.radius, '#ff9f43', true);
  }
  for (const t of battle.texts.values()) { const p = position(t); ctx.fillStyle = '#fff'; ctx.fillText(String(t.value), p.x, p.y); }
  const p = position(battle.player); circle(p.x, p.y, 12, '#d7fffc'); circle(p.x, p.y, 18, '#51d9c4', true);
  circle(95, 580, 55, '#4a6c7b', true); circle(95 + stick.x * 55, 580 + stick.y * 55, 22, '#4a9caa');
  ctx.fillStyle = '#d8f3ef'; ctx.font = '14px system-ui';
  ctx.fillText(`${enemyCount} 怪 · ${battle.projectiles.size} 弹 · ${battle.loot.size} 掉落 | tick ${battle.tick}`, 18, 26);
}

const counts = () => ({ enemies: battle.enemies.size, projectiles: battle.projectiles.size, loot: battle.loot.size });
let minima = { enemies: Infinity, projectiles: Infinity, loot: Infinity };
function summary(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return { n: sorted.length, p50: sorted[Math.floor(sorted.length * 0.5)] || 0, p95: sorted[Math.floor(sorted.length * 0.95)] || 0, max: sorted.at(-1) || 0 };
}
function report() { return { frames: frame, tick: battle.tick, stress, seed, counts: counts(), minima, stats: { ...battle.stats }, frameMs: summary(samples.frame), logicStepMs: summary(samples.logic), frameCpuMs: summary(samples.cpu), drawMs: summary(samples.draw), userAgent: navigator.userAgent }; }
window.battleFixture = { battle, report, resetMetrics() { frame = 0; for (const values of Object.values(samples)) values.length = 0; minima = { enemies: Infinity, projectiles: Infinity, loot: Infinity }; } };
replenish();
function render(time) {
  const begin = performance.now();
  const dt = lastTime === undefined ? 0 : (time - lastTime) / 1000;
  lastTime = time;
  if (!paused) {
    if (pointer === undefined) battle.setInput(Number(keys.has('d') || keys.has('ArrowRight')) - Number(keys.has('a') || keys.has('ArrowLeft')), Number(keys.has('s') || keys.has('ArrowDown')) - Number(keys.has('w') || keys.has('ArrowUp')));
    const started = performance.now(), result = battle.advance(dt);
    const elapsed = performance.now() - started;
    alpha = result.alpha;
    if (result.steps) samples.logic.push(elapsed / result.steps);
    replenish();
    const current = counts();
    for (const key of Object.keys(minima)) minima[key] = Math.min(minima[key], current[key]);
    if (dt > 0) samples.frame.push(dt * 1000);
  }
  const drawStart = performance.now(); draw(); samples.draw.push(performance.now() - drawStart);
  frame++;
  if (frame % 30 === 0) metricsOutput.value = `帧 ${frame} · 命中 ${battle.stats.hits} · 击杀 ${battle.stats.kills}\n逻辑 p95 ${summary(samples.logic).p95.toFixed(2)} ms · 帧间隔 p95 ${summary(samples.frame).p95.toFixed(2)} ms`;
  samples.cpu.push(performance.now() - begin);
  // Keep manual sessions bounded without skewing the last recorded report.
  for (const values of Object.values(samples)) if (values.length > 3600) values.splice(0, values.length - 3600);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
