// 敵などのスプライト。
//
// 描き方は2通りあり、同じ投影計算を共有する。
//   emoji: 格子の上に重ねた要素1個。transform: scale() で距離に応じて拡大縮小する
//   dot:   1bit のビットマップを格子に直接焼く
// どちらも壁の手前／奥はカラムごとの距離（scene.js の colDist）で判定する。

import { BAYER, MAX_DIST, colDist } from './scene.js';
import { COVERAGE_STEPS } from './display.js';
import { blocked } from './camera.js';

const HEIGHT = 0.85;   // 世界での背丈。1.0 で床から天井まで
export const BASE_FONT = 64; // 絵文字の素の字面。これを固定して scale で伸縮させる

// 1bit の敵。ドット版で使う
const IMP = [
  '.....######.....',
  '....########....',
  '...##..##..##...',
  '...##..##..##...',
  '....########....',
  '.....#.##.#.....',
  '..#..######..#..',
  '.###.######.###.',
  '..#..######..#..',
  '.....######.....',
  '.....##..##.....',
  '.....##..##.....',
  '....###..###....',
  '...###....###...',
  '..####....####..',
  '..###......###..',
].map((row) => row.split('').map((c) => (c === '#' ? 1 : 0)));

export function makeEnemies() {
  return [
    { x: 4.5, y: 4.5, emoji: '👹', speed: 0.012 },
    { x: 17.5, y: 4.5, emoji: '👻', speed: 0.016 },
    { x: 5.5, y: 12.5, emoji: '🤖', speed: 0.010 },
    { x: 16.5, y: 12.5, emoji: '👽', speed: 0.014 },
    { x: 11.5, y: 8.5, emoji: '💀', speed: 0.018 },
  ];
}

// プレイヤーへゆっくり寄ってくるだけの挙動
export function updateEnemies(enemies, cam) {
  for (const e of enemies) {
    const dx = cam.x - e.x;
    const dy = cam.y - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 9 || dist < 0.6) continue;
    const nx = e.x + (dx / dist) * e.speed;
    const ny = e.y + (dy / dist) * e.speed;
    if (!blocked(nx, e.y)) e.x = nx;
    if (!blocked(e.x, ny)) e.y = ny;
  }
}

// カメラ座標系へ投影して、画面上の矩形を求める。奥のものから順に返す
export function project(enemies, cam, w, h) {
  const out = [];
  const invDet = 1 / (cam.planeX * cam.dirY - cam.dirX * cam.planeY);

  for (const e of enemies) {
    const relX = e.x - cam.x;
    const relY = e.y - cam.y;
    const camX = invDet * (cam.dirY * relX - cam.dirX * relY);
    const depth = invDet * (-cam.planeY * relX + cam.planeX * relY);
    if (depth <= 0.2 || depth > MAX_DIST) continue; // 背後と遠すぎるものは捨てる

    const screenX = (w / 2) * (1 + camX / depth);
    const fullH = h / depth;          // 背丈 1.0 のときの高さ
    const size = fullH * HEIGHT;
    const bottom = h / 2 + fullH / 2; // 足を床につける
    out.push({
      enemy: e,
      depth,
      size,
      left: screenX - size / 2,
      top: bottom - size,
    });
  }
  out.sort((a, b) => b.depth - a.depth);
  return out;
}

// 壁に隠れていない列の範囲を返す。中心が隠れていれば null
function visibleSpan(s, w) {
  const center = Math.round(s.left + s.size / 2);
  const from = Math.max(0, Math.floor(s.left));
  const to = Math.min(w - 1, Math.ceil(s.left + s.size));
  if (center < 0 || center >= w || colDist[center] <= s.depth) return null;

  let start = center;
  let end = center;
  while (start - 1 >= from && colDist[start - 1] > s.depth) start--;
  while (end + 1 <= to && colDist[end + 1] > s.depth) end++;
  return { start, end };
}

// --- ドット版: 1bit のビットマップを格子に焼く ---
export function drawDots(grid, projected, mode) {
  const w = grid.width;
  const h = grid.height;
  const ink = grid.ink;
  const cov = grid.coverage;
  const halftone = mode === 'C';

  for (const s of projected) {
    const span = visibleSpan(s, w);
    if (!span) continue;
    const shade = Math.max(0, 1 - s.depth / MAX_DIST);
    if (shade <= 0) continue;

    const yStart = Math.max(0, Math.ceil(s.top));
    const yEnd = Math.min(h - 1, Math.floor(s.top + s.size));

    for (let x = span.start; x <= span.end; x++) {
      const tx = Math.floor((x + 0.5 - s.left) / s.size * 16);
      if (tx < 0 || tx > 15) continue;
      for (let y = yStart; y <= yEnd; y++) {
        const ty = Math.floor((y + 0.5 - s.top) / s.size * 16);
        if (ty < 0 || ty > 15 || !IMP[ty][tx]) continue;
        const i = y * w + x;
        if (halftone) {
          ink[i] = 1;
          cov[i] = Math.max(1, Math.round(shade * COVERAGE_STEPS));
        } else if (shade > BAYER[(y & 3) * 4 + (x & 3)]) {
          ink[i] = 1;
          cov[i] = COVERAGE_STEPS;
        } else {
          ink[i] = 0; // 敵の中の暗い点。背景を透けさせない
        }
      }
    }
  }
}

// --- 絵文字版: 格子の上に重ねた要素を動かす ---
export class EmojiLayer {
  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'spritelayer';
    this.root.setAttribute('aria-hidden', 'true');
    this.pool = [];
  }

  attach(host) {
    host.appendChild(this.root);
  }

  // cellPx はドット1個の実ピクセル幅。格子の縮小率がそのまま効く
  sync(projected, cellPx, gridWidth) {
    let used = 0;
    for (const s of projected) {
      const span = visibleSpan(s, gridWidth);
      if (!span) continue;

      const el = this.pool[used] || this.addCell();
      used++;

      // font-size は固定のまま scale で伸縮させる。毎フレーム字を組み直させない
      const scale = s.size * cellPx / BASE_FONT;
      el.style.transform =
        `translate(${(s.left * cellPx).toFixed(1)}px, ${(s.top * cellPx).toFixed(1)}px) scale(${scale.toFixed(3)})`;
      // 壁に食い込んでいる側を切り落とす
      const leftCut = Math.max(0, (span.start - s.left) / s.size) * 100;
      const rightCut = Math.max(0, (s.left + s.size - span.end - 1) / s.size) * 100;
      el.style.clipPath = leftCut || rightCut
        ? `inset(0 ${rightCut.toFixed(1)}% 0 ${leftCut.toFixed(1)}%)` : '';
      el.textContent = s.enemy.emoji;
      el.style.display = '';
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i].style.display = 'none';
  }

  addCell() {
    const el = document.createElement('span');
    el.className = 'sprite';
    this.root.appendChild(el);
    this.pool.push(el);
    return el;
  }

  clear() {
    for (const el of this.pool) el.style.display = 'none';
  }
}
