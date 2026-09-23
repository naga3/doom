// レイキャストの結果を 1bit のフレームバッファに落とす。
//
// モードの違いはここだけに現れる:
//   A: checked のみ。壁の端は四捨五入で行に丸める
//   B: A に加えて、壁の輪郭の1マスだけ端数ぶん小さくする（1カラムあたり最大2個）
//   C: インクの乗る全セルの大きさで明暗を表す（網点）

import { castRay } from './raycast.js';
import { COVERAGE_STEPS } from './display.js';

// 4x4 の順序ディザ。閾値はセル中央の値にずらしてある
const BAYER = new Float32Array(
  [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16),
);

const MAX_DIST = 22; // 壁がこれより遠いと真っ暗
const FLOOR_DIST = 9; // 床はもっと手前で暗く落とす。明るいままだと壁と混ざって形が読めない
const SIDE_SHADE = 0.62; // 横向きの面を暗くして角を立たせる

let colTop = null;
let colBottom = null;

function wallAlbedo(tile, u, v) {
  const tx = (u * 16) | 0;
  const ty = (v * 16) | 0;
  switch (tile) {
    case 1: { // レンガ
      const shift = (ty >> 2) & 1 ? 8 : 0;
      const bx = (tx + shift) & 15;
      return (ty & 3) === 0 || bx === 0 ? 0.22 : 0.95;
    }
    case 2: // 縦の桟
      return (tx & 3) === 0 ? 0.18 : 0.82;
    case 3: // 市松
      return ((tx >> 2) + (ty >> 2)) & 1 ? 0.34 : 0.92;
    default: { // 枠付きの板
      const edge = tx === 0 || ty === 0 || tx === 15 || ty === 15;
      return edge ? 0.28 : 0.72;
    }
  }
}

export function renderScene(grid, cam, mode) {
  const w = grid.width;
  const h = grid.height;
  const ink = grid.ink;
  const cov = grid.coverage;
  const halfH = h / 2;

  if (!colTop || colTop.length !== w) {
    colTop = new Float32Array(w);
    colBottom = new Float32Array(w);
  }

  ink.fill(0);
  cov.fill(COVERAGE_STEPS);

  const useCoverage = mode === 'B' || mode === 'C';
  const halftone = mode === 'C';

  // --- 壁: カラムごとに垂直な帯を1本 ---
  for (let x = 0; x < w; x++) {
    const camX = 2 * x / w - 1;
    const hit = castRay(cam.x, cam.y, cam.dirX + cam.planeX * camX, cam.dirY + cam.planeY * camX);

    const lineH = h / hit.dist;
    const top = halfH - lineH / 2;
    const bottom = halfH + lineH / 2;
    colTop[x] = top;
    colBottom[x] = bottom;

    const shade = Math.max(0, 1 - hit.dist / MAX_DIST) * (hit.side === 1 ? SIDE_SHADE : 1);
    if (shade <= 0) continue;

    const rowTop = Math.floor(top);
    const rowBottom = Math.floor(bottom);
    const fullStart = Math.max(0, Math.ceil(top));
    const fullEnd = Math.min(h - 1, rowBottom - 1);

    for (let y = fullStart; y <= fullEnd; y++) {
      plotWall(ink, cov, w, x, y, 1, top, lineH, hit, shade, halftone, false);
    }

    // 壁が1行に収まらない太さのときは上下の端数を別々に扱う
    if (rowTop === rowBottom) {
      if (rowTop >= 0 && rowTop < h) {
        plotWall(ink, cov, w, x, rowTop, bottom - top, top, lineH, hit, shade, halftone, useCoverage);
      }
      continue;
    }
    if (rowTop >= 0 && rowTop < fullStart) {
      plotWall(ink, cov, w, x, rowTop, rowTop + 1 - top, top, lineH, hit, shade, halftone, useCoverage);
    }
    if (rowBottom > fullEnd && rowBottom < h) {
      plotWall(ink, cov, w, x, rowBottom, bottom - rowBottom, top, lineH, hit, shade, halftone, useCoverage);
    }
  }

  // --- 床と天井: 行ごとに横断する（同じ行なら距離が一定） ---
  const rdx0 = cam.dirX - cam.planeX;
  const rdy0 = cam.dirY - cam.planeY;
  const rdx1 = cam.dirX + cam.planeX;
  const rdy1 = cam.dirY + cam.planeY;

  for (let y = (halfH | 0) + 1; y < h; y++) { // 天井は塗らない。1bit では黒のほうが形が立つ
    const p = (y + 0.5) - halfH;
    const rowDist = halfH / p;
    if (rowDist > FLOOR_DIST) continue;

    const shade = 1 - rowDist / FLOOR_DIST;
    const stepX = rowDist * (rdx1 - rdx0) / w;
    const stepY = rowDist * (rdy1 - rdy0) / w;
    let fx = cam.x + rowDist * rdx0;
    let fy = cam.y + rowDist * rdy0;
    const rowOff = y * w;
    const yc = y + 0.5;

    for (let x = 0; x < w; x++, fx += stepX, fy += stepY) {
      if (yc < colBottom[x]) continue; // 壁の裏
      const checker = (Math.floor(fx) + Math.floor(fy)) & 1;
      const brightness = (checker ? 0.62 : 0.26) * shade;
      const i = rowOff + x;
      if (halftone) {
        if (brightness > 0.05) {
          ink[i] = 1;
          cov[i] = Math.round(brightness * COVERAGE_STEPS);
        }
      } else if (brightness > BAYER[(y & 3) * 4 + (x & 3)]) {
        ink[i] = 1;
      }
    }
  }
}

// coverage は壁がそのセルを覆っている割合（0..1）
function plotWall(ink, cov, w, x, y, coverage, top, lineH, hit, shade, halftone, partial) {
  const v = (y + 0.5 - top) / lineH;
  const brightness = wallAlbedo(hit.tile, hit.wallX, v < 0 ? 0 : v > 1 ? 1 : v) * shade;
  const i = y * w + x;

  if (halftone) {
    const amount = brightness * coverage;
    if (amount <= 0.05) return;
    ink[i] = 1;
    cov[i] = Math.round(amount * COVERAGE_STEPS);
    return;
  }

  if (partial) {
    // B: 大きさで端数を表す。明るさも掛けて、遠くの壁の輪郭が浮かないようにする
    const amount = brightness * coverage;
    if (amount <= 0.05) return;
    ink[i] = 1;
    cov[i] = Math.round(amount * COVERAGE_STEPS);
    return;
  }

  // A: 半分以上覆っていれば点灯。実質の四捨五入
  if (coverage < 0.5) return;
  if (brightness > BAYER[(y & 3) * 4 + (x & 3)]) ink[i] = 1;
}
