// グリッド・カメラ・シーンをまとめた最小の実行系。デモと計測で共有する。

import { CheckboxGrid } from './grid.js';
import { TableGrid } from './table-grid.js';
import { renderScene } from './scene.js';
import { makeCamera, autoStep } from './camera.js';
import { makeEnemies, updateEnemies, project, drawDots, EmojiLayer } from './sprites.js';

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
    this.spriteStyle = 'emoji'; // 'emoji' | 'dot'
    this.sprites = true;        // 計測では切って、壁だけのコストを見る
    this.frame = 0;
    this.grid = null;
    this.cam = makeCamera();
    this.enemies = makeEnemies();
    this.health = 100;
    this.emojiLayer = new EmojiLayer();
    this.setSize(96, 60);
  }

  setSize(w, h) {
    const Ctor = BACKENDS[this.backend].ctor;
    // 表示面を作り直すと host の中身が消えるので、絵文字の層は毎回付け直す
    this.grid = new Ctor(this.host, w, h);
    this.emojiLayer.attach(this.host);
  }

  setSpriteStyle(style) {
    this.spriteStyle = style;
    if (style !== 'emoji') this.emojiLayer.clear();
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
    this.enemies = makeEnemies();
    this.health = 100;
    this.frame = 0;
  }

  // 一番近い敵に触られていると体力が減る。顔の表情はこれで決まる
  updateHealth() {
    let nearest = Infinity;
    for (const e of this.enemies) {
      nearest = Math.min(nearest, Math.hypot(e.x - this.cam.x, e.y - this.cam.y));
    }
    if (nearest < 0.8) this.health = Math.max(0, this.health - 0.4);
  }

  // 1フレーム描いて内訳を返す
  step(auto) {
    if (auto) autoStep(this.cam, this.frame);
    this.frame++;

    const t0 = performance.now();
    renderScene(this.grid, this.cam, this.mode);

    let projected = null;
    if (this.sprites) {
      updateEnemies(this.enemies, this.cam);
      this.updateHealth();
      projected = project(this.enemies, this.cam, this.grid.width, this.grid.height);
      // ドット版は格子に焼くので flush より前。絵文字版は重ねるだけなので後でよい
      if (this.spriteStyle === 'dot') drawDots(this.grid, projected, this.mode);
    }

    const t1 = performance.now();
    const writes = this.grid.flush(this.mode !== 'A');
    if (projected && this.spriteStyle === 'emoji') {
      this.emojiLayer.sync(projected, this.grid.cellPx, this.grid.width);
    }
    const t2 = performance.now();

    return { renderMs: t1 - t0, flushMs: t2 - t1, writes };
  }
}
