// グリッド・カメラ・シーンをまとめた最小の実行系。デモと計測で共有する。

import { CheckboxGrid } from './grid.js';
import { TableGrid } from './table-grid.js';
import { renderScene } from './scene.js';
import { makeCamera, autoStep } from './camera.js';

export const SIZES = [
  { label: '64 x 40', w: 64, h: 40 },
  { label: '96 x 60', w: 96, h: 60 },
  { label: '128 x 80', w: 128, h: 80 },
  { label: '160 x 100', w: 160, h: 100 },
];

export const BACKENDS = {
  checkbox: { label: 'チェックボックス', ctor: CheckboxGrid },
  table: { label: 'table の td', ctor: TableGrid },
};

export class Engine {
  constructor(host) {
    this.host = host;
    this.mode = 'B';
    this.backend = 'checkbox';
    this.frame = 0;
    this.grid = null;
    this.cam = makeCamera();
    this.setSize(96, 60);
  }

  setSize(w, h) {
    const Ctor = BACKENDS[this.backend].ctor;
    this.grid = new Ctor(this.host, w, h);
  }

  setBackend(name) {
    this.backend = name;
    this.setSize(this.grid.width, this.grid.height);
  }

  setMode(mode) {
    this.mode = mode;
    // モードが変わると大きさの意味が変わるので、全セルを書き直させる
    this.grid.invalidate();
  }

  reset() {
    this.cam = makeCamera();
    this.frame = 0;
  }

  // 1フレーム描いて内訳を返す
  step(auto) {
    if (auto) autoStep(this.cam, this.frame);
    this.frame++;

    const t0 = performance.now();
    renderScene(this.grid, this.cam, this.mode);
    const t1 = performance.now();
    const writes = this.grid.flush(this.mode !== 'A');
    const t2 = performance.now();

    return { renderMs: t1 - t0, flushMs: t2 - t1, writes };
  }
}
