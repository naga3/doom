// カメラと壁との当たり判定。自動歩行も同じ関数を使う。

import { tileAt } from './raycast.js';

const RADIUS = 0.22;
const FOV = 66 * Math.PI / 180;
const PLANE_LEN = Math.tan(FOV / 2);

export function makeCamera(x = 8.5, y = 8.5, angle = 0) {
  const cam = { x, y, angle, dirX: 0, dirY: 0, planeX: 0, planeY: 0, bump: 0 };
  orient(cam);
  return cam;
}

function orient(cam) {
  cam.dirX = Math.cos(cam.angle);
  cam.dirY = Math.sin(cam.angle);
  // 視線に直交する画面平面。長さが半画角のタンジェント
  cam.planeX = -cam.dirY * PLANE_LEN;
  cam.planeY = cam.dirX * PLANE_LEN;
}

export function turn(cam, radians) {
  cam.angle += radians;
  orient(cam);
}

// 壁に半径ぶん食い込まないように軸ごとに判定する
function blocked(x, y) {
  return tileAt(x - RADIUS, y) !== 0 || tileAt(x + RADIUS, y) !== 0
      || tileAt(x, y - RADIUS) !== 0 || tileAt(x, y + RADIUS) !== 0;
}

// 戻り値は壁に当たったかどうか
export function move(cam, forward, strafe) {
  let hitWall = false;
  const nx = cam.x + cam.dirX * forward + cam.planeX / PLANE_LEN * strafe;
  const ny = cam.y + cam.dirY * forward + cam.planeY / PLANE_LEN * strafe;
  if (!blocked(nx, cam.y)) cam.x = nx; else hitWall = true;
  if (!blocked(cam.x, ny)) cam.y = ny; else hitWall = true;
  return hitWall;
}

// 計測用の決定論的な自動歩行。フレーム番号だけで経路が決まる
export function autoStep(cam, frame) {
  const hitWall = move(cam, 0.05, 0);
  if (hitWall) cam.bump += 0.28;
  cam.bump *= 0.86;
  turn(cam, 0.007 * Math.sin(frame * 0.013) + cam.bump);
}
