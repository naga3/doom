// 操作できるデモ。A / B / C を歩きながら見比べるためのもの。

import { Engine, SIZES, BACKENDS } from './engine.js';
import { move, turn } from './camera.js';

const host = document.getElementById('screen');
const sizeSelect = document.getElementById('size');
const modeSelect = document.getElementById('mode');
const autoToggle = document.getElementById('auto');
const backendSelect = document.getElementById('backend');
const hud = document.getElementById('hud');

const engine = new Engine(host);

for (const [i, size] of SIZES.entries()) {
  const option = document.createElement('option');
  option.value = String(i);
  option.textContent = size.label;
  sizeSelect.appendChild(option);
}
sizeSelect.value = '1'; // 96x60 から始める

function applySize() {
  const size = SIZES[Number(sizeSelect.value)];
  engine.setSize(size.w, size.h);
  engine.setMode(engine.mode);
}

sizeSelect.addEventListener('change', applySize);
backendSelect.addEventListener('change', () => {
  engine.setBackend(backendSelect.value);
  engine.setMode(engine.mode);
});
modeSelect.addEventListener('change', () => engine.setMode(modeSelect.value));
window.addEventListener('resize', () => engine.grid.fit());

// --- 入力 ---
const held = new Set();
window.addEventListener('keydown', (e) => {
  held.add(e.code);
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('blur', () => held.clear());

host.addEventListener('click', () => {
  if (document.pointerLockElement !== host) host.requestPointerLock();
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === host) turn(engine.cam, e.movementX * 0.0025);
});

const MOVE = 0.055;
const TURN = 0.035;

function readInput() {
  let forward = 0;
  let strafe = 0;
  let rotate = 0;
  if (held.has('KeyW') || held.has('ArrowUp')) forward += MOVE;
  if (held.has('KeyS') || held.has('ArrowDown')) forward -= MOVE;
  if (held.has('KeyA')) strafe -= MOVE;
  if (held.has('KeyD')) strafe += MOVE;
  if (held.has('ArrowLeft')) rotate -= TURN;
  if (held.has('ArrowRight')) rotate += TURN;
  if (rotate) turn(engine.cam, rotate);
  if (forward || strafe) move(engine.cam, forward, strafe);
}

// --- ループ ---
let last = performance.now();
let fps = 0;
let cost = 0;
let sinceUpdate = 0;

function loop(now) {
  const dt = now - last;
  last = now;
  fps += ((1000 / Math.max(dt, 1)) - fps) * 0.1;

  if (!autoToggle.checked) readInput();
  const stat = engine.step(autoToggle.checked);
  cost += ((stat.renderMs + stat.flushMs) - cost) * 0.1;

  sinceUpdate += dt;
  if (sinceUpdate > 250) {
    sinceUpdate = 0;
    hud.textContent =
      `${fps.toFixed(0)} fps / 描画 ${cost.toFixed(1)} ms / 書き込み ${stat.writes} セル / `
      + `${engine.grid.size} ドット / ${BACKENDS[engine.backend].label}`;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
