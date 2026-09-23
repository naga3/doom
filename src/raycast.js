// グリッドマップに対する DDA レイキャスト。Wolf3D 方式。
// 1カラムにつき「垂直な壁の帯1本」を返すので、差分更新と相性がよい。

import { LEVELS } from './levels.js';

let map = LEVELS[0].grid;
export let MAP_H = map.length;
export let MAP_W = map[0].length;

export function setLevel(index) {
  map = LEVELS[index].grid;
  MAP_H = map.length;
  MAP_W = map[0].length;
}

export function tileAt(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return 1;
  return map[y | 0][x | 0];
}

// 1本のレイを飛ばして、壁までの垂直距離・当たった面・面上の位置を返す
export function castRay(px, py, rdx, rdy) {
  let mapX = px | 0;
  let mapY = py | 0;

  const deltaX = rdx === 0 ? Infinity : Math.abs(1 / rdx);
  const deltaY = rdy === 0 ? Infinity : Math.abs(1 / rdy);

  const stepX = rdx < 0 ? -1 : 1;
  const stepY = rdy < 0 ? -1 : 1;

  let sideX = rdx < 0 ? (px - mapX) * deltaX : (mapX + 1 - px) * deltaX;
  let sideY = rdy < 0 ? (py - mapY) * deltaY : (mapY + 1 - py) * deltaY;

  let side = 0; // 0 = 縦の面, 1 = 横の面
  let tile = 0;
  for (let guard = 0; guard < 128; guard++) {
    if (sideX < sideY) {
      sideX += deltaX;
      mapX += stepX;
      side = 0;
    } else {
      sideY += deltaY;
      mapY += stepY;
      side = 1;
    }
    tile = tileAt(mapX, mapY);
    if (tile > 0) break;
  }

  const dist = side === 0 ? sideX - deltaX : sideY - deltaY;
  // 壁面上のどこに当たったか（テクスチャの横座標）
  const hit = side === 0 ? py + dist * rdy : px + dist * rdx;
  const wallX = hit - Math.floor(hit);

  return { dist: Math.max(dist, 1e-4), side, tile, wallX };
}
