// 敵・アイテム・出口などのスプライト。
//
// 描き方は2通りあり、投影と遮蔽の計算は共通。
//   emoji: 格子の上に重ねた要素1個。transform: scale() で距離に応じて拡大縮小する
//   dot:   16x16 の 1bit ビットマップを格子に焼く
// 壁との前後関係は、カラムごとの距離（scene.js の colDist）で判定する。

import { BAYER, MAX_DIST, colDist } from './scene.js';
import { COVERAGE_STEPS } from './display.js';
import { BITMAPS, OUTLINES, WEAPON } from './bitmaps.js';

export const BASE_FONT = 64; // 絵文字の素の字面。これを固定して scale で伸縮させる

// カメラ座標系へ投影して画面上の矩形を求める。奥のものから順に返す
export function project(entities, cam, w, h) {
  const out = [];
  const invDet = 1 / (cam.planeX * cam.dirY - cam.dirX * cam.planeY);

  for (const e of entities) {
    const relX = e.x - cam.x;
    const relY = e.y - cam.y;
    const camX = invDet * (cam.dirY * relX - cam.dirX * relY);
    const depth = invDet * (-cam.planeY * relX + cam.planeX * relY);
    if (depth <= 0.2 || depth > MAX_DIST) continue; // 背後と遠すぎるものは捨てる

    const screenX = (w / 2) * (1 + camX / depth);
    const fullH = h / depth;              // 背丈 1.0 のときの高さ
    const size = fullH * (e.size || 0.85);
    const floorY = h / 2 + fullH / 2;     // この距離の床の高さ
    out.push({
      entity: e,
      depth,
      size,
      left: screenX - size / 2,
      top: floorY - size - fullH * (e.lift || 0),
    });
  }
  out.sort((a, b) => b.depth - a.depth);
  return out;
}

// 壁に隠れていない列の範囲。中心が隠れていれば null
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

// 画面中央に重なっている一番手前のものを返す。射撃の判定に使う
export function pickTarget(projected, w) {
  const center = w / 2;
  let best = null;
  for (const s of projected) {
    if (!s.entity.hp) continue; // 撃てるのは敵だけ
    if (center < s.left || center > s.left + s.size) continue;
    if (!visibleSpan(s, w)) continue;
    if (!best || s.depth < best.depth) best = s;
  }
  return best;
}

// --- ドット版 ---
export function drawDots(grid, projected, mode) {
  const w = grid.width;
  const h = grid.height;
  const ink = grid.ink;
  const cov = grid.coverage;
  const halftone = mode === 'C';

  for (const s of projected) {
    const name = BITMAPS[s.entity.bitmap] ? s.entity.bitmap : 'imp';
    const bitmap = BITMAPS[name];
    const outline = OUTLINES[name];
    const span = visibleSpan(s, w);
    if (!span) continue;
    // 撃たれた直後は白く光らせる
    const shade = s.entity.hitFlash > 0 ? 1 : Math.max(0, 1 - s.depth / MAX_DIST);
    if (shade <= 0) continue;

    const yStart = Math.max(0, Math.ceil(s.top));
    const yEnd = Math.min(h - 1, Math.floor(s.top + s.size));

    for (let x = span.start; x <= span.end; x++) {
      const tx = Math.floor((x + 0.5 - s.left) / s.size * 16);
      if (tx < 0 || tx > 15) continue;
      for (let y = yStart; y <= yEnd; y++) {
        const ty = Math.floor((y + 0.5 - s.top) / s.size * 16);
        if (ty < 0 || ty > 15) continue;
        const i = y * w + x;
        if (!bitmap[ty][tx]) {
          if (outline[ty][tx]) ink[i] = 0; // 輪郭の外側を抜いて背景から切り離す
          continue;
        }
        if (halftone) {
          ink[i] = 1;
          cov[i] = Math.max(1, Math.round(shade * COVERAGE_STEPS));
        } else if (shade > BAYER[(y & 3) * 4 + (x & 3)]) {
          ink[i] = 1;
          cov[i] = COVERAGE_STEPS;
        } else {
          ink[i] = 0; // 影の部分。背景を透けさせない
        }
      }
    }
  }
}

// 武器は常にドットで描く。絵文字フォントの有無に左右させない
export function drawWeapon(grid, mode, flash) {
  const w = grid.width;
  const h = grid.height;
  const ink = grid.ink;
  const cov = grid.coverage;
  const scale = Math.max(1, Math.round(w / 48));
  const left = ((w - 16 * scale) / 2) | 0;
  const top = h - WEAPON.length * scale;

  for (let ty = 0; ty < WEAPON.length; ty++) {
    for (let tx = 0; tx < 16; tx++) {
      if (!WEAPON[ty][tx]) continue;
      for (let dy = 0; dy < scale; dy++) {
        const y = top + ty * scale + dy;
        if (y < 0 || y >= h) continue;
        const rowOff = y * w;
        for (let dx = 0; dx < scale; dx++) {
          const x = left + tx * scale + dx;
          if (x < 0 || x >= w) continue;
          ink[rowOff + x] = 1;
          cov[rowOff + x] = COVERAGE_STEPS;
        }
      }
    }
  }

  if (flash > 0) drawMuzzleFlash(grid, mode, flash);
}

// 発砲の閃光。銃口の上に広がる
function drawMuzzleFlash(grid, mode, flash) {
  const w = grid.width;
  const h = grid.height;
  const ink = grid.ink;
  const cov = grid.coverage;
  const scale = Math.max(1, Math.round(w / 48));
  const cx = w / 2;
  const cy = h - WEAPON.length * scale - 1;
  const radius = (1 + flash) * scale * 0.55;

  for (let y = Math.max(0, (cy - radius) | 0); y <= Math.min(h - 1, (cy + radius) | 0); y++) {
    for (let x = Math.max(0, (cx - radius) | 0); x <= Math.min(w - 1, (cx + radius) | 0); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / radius;
      if (d > 1) continue;
      const brightness = 1 - d;
      const i = y * w + x;
      if (mode === 'C') {
        ink[i] = 1;
        cov[i] = Math.max(1, Math.round(brightness * COVERAGE_STEPS));
      } else if (brightness > BAYER[(y & 3) * 4 + (x & 3)]) {
        ink[i] = 1;
        cov[i] = COVERAGE_STEPS;
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
      el.style.filter = s.entity.hitFlash > 0 ? 'brightness(3)' : '';
      el.textContent = s.entity.emoji;
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
