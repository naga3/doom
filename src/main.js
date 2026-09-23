// 遊ぶ側の配線。入力・HUD・効果音。

import { Engine, SIZES, BACKENDS } from './engine.js';
import { move, turn } from './camera.js';
import { MAX_HEALTH } from './game.js';
import { LEVELS } from './levels.js';
import * as sound from './sound.js';

const host = document.getElementById('screen');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayBody = document.getElementById('overlay-body');

const sizeSelect = document.getElementById('size');
const modeSelect = document.getElementById('mode');
const spriteSelect = document.getElementById('sprite');
const backendSelect = document.getElementById('backend');
const autoToggle = document.getElementById('auto');
const soundToggle = document.getElementById('sound');

const faceEl = document.getElementById('face');
const hpEl = document.getElementById('hp');
const ammoEl = document.getElementById('ammo');
const leftEl = document.getElementById('left');
const levelEl = document.getElementById('level');
const hud = document.getElementById('hud');
const note = document.getElementById('note');
const stage = document.getElementById('stage');
// window.status という既存のグローバル（文字列）があるので、名前をずらして取る
const statusBar = document.getElementById('status');

const engine = new Engine(host);

for (const [i, size] of SIZES.entries()) {
  const option = document.createElement('option');
  option.value = String(i);
  option.textContent = size.label;
  sizeSelect.appendChild(option);
}
sizeSelect.value = '1'; // 96x60 から始める

const MAX_SCREEN_WIDTH = 1000;

// ステータスバーと説明文のぶんを残して、画面がちょうど収まる大きさにする。
// 余白の見積もりは当てにならないので、一度置いてみてから溢れたぶんだけ縮め直す
function fitScreen() {
  const width = Math.min(window.innerWidth - 40, MAX_SCREEN_WIDTH);
  const top = stage.getBoundingClientRect().top + window.scrollY;
  const footer = statusBar.offsetHeight + hud.offsetHeight + note.offsetHeight + 56;
  let maxHeight = Math.max(240, window.innerHeight - top - footer);

  engine.grid.fit(width, maxHeight);
  const overflow = document.documentElement.scrollHeight - window.innerHeight;
  if (overflow > 1) engine.grid.fit(width, Math.max(240, maxHeight - overflow));
}

function applySize() {
  const size = SIZES[Number(sizeSelect.value)];
  engine.setSize(size.w, size.h);
  engine.setMode(engine.mode);
  fitScreen();
}

sizeSelect.addEventListener('change', applySize);
modeSelect.addEventListener('change', () => engine.setMode(modeSelect.value));
spriteSelect.addEventListener('change', () => engine.setSpriteStyle(spriteSelect.value));
backendSelect.addEventListener('change', () => {
  engine.setBackend(backendSelect.value);
  engine.setMode(engine.mode);
  fitScreen();
});
soundToggle.addEventListener('change', () => sound.setEnabled(soundToggle.checked));
window.addEventListener('resize', fitScreen);

// --- 入力 ---
const held = new Set();
let mouseDown = false;

window.addEventListener('keydown', (e) => {
  sound.resume();
  if (e.code === 'KeyR') engine.reset();
  // 押した瞬間に1発。押しっぱなしの連射は readInput が拾う
  if (e.code === 'Space' && !e.repeat) engine.fire();
  held.add(e.code);
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('blur', () => { held.clear(); mouseDown = false; });

host.addEventListener('mousedown', () => {
  sound.resume();
  if (document.pointerLockElement !== host) host.requestPointerLock();
  else engine.fire();
  mouseDown = true;
});
window.addEventListener('mouseup', () => { mouseDown = false; });
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
  if (mouseDown || held.has('Space')) engine.fire();
}

// --- 表示 ---
// 体力で表情が変わる。DOOM のステータスバーの顔のつもり
const FACES = [[80, '😀'], [60, '🙂'], [40, '😐'], [20, '😠'], [1, '🤕'], [0, '💀']];

function faceFor(health) {
  for (const [threshold, emoji] of FACES) if (health >= threshold) return emoji;
  return '💀';
}

function paintOverlay() {
  const game = engine.game;
  if (game.state === 'playing') {
    overlay.hidden = true;
    return;
  }
  overlay.hidden = false;
  if (game.state === 'dead') {
    overlayTitle.textContent = 'やられた';
    overlayBody.textContent = `「${game.levelName}」で力尽きた`;
  } else {
    overlayTitle.textContent = 'クリア';
    overlayBody.textContent = `全 ${LEVELS.length} 面を突破した`;
  }
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

  if (!autoToggle.checked && engine.game.state === 'playing') readInput();
  const stat = engine.step(autoToggle.checked);
  cost += ((stat.renderMs + stat.flushMs) - cost) * 0.1;

  for (const event of engine.game.drainEvents()) sound.play(event);
  host.classList.toggle('hurt', engine.game.hurtFlash > 0);

  sinceUpdate += dt;
  if (sinceUpdate > 120) {
    sinceUpdate = 0;
    const game = engine.game;
    faceEl.textContent = faceFor(game.health);
    hpEl.textContent = Math.round(game.health);
    ammoEl.textContent = game.ammo;
    leftEl.textContent = game.enemies.length;
    levelEl.textContent = `${game.levelIndex + 1} / ${LEVELS.length} ${game.levelName}`;
    paintOverlay();
    hud.textContent =
      `${fps.toFixed(0)} fps / 描画 ${cost.toFixed(1)} ms / 書き込み ${stat.writes} セル / `
      + `${engine.grid.size} ドット / ${BACKENDS[engine.backend].label}`;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// 体力が満タンでないと回復を拾わない仕様なので、初期値を見せておく
hpEl.textContent = String(MAX_HEALTH);

fitScreen();

// 自動プレイテストから触るための口
window.__engine = engine;
