// 表示面・シーン・ゲーム状態をまとめた実行系。デモと計測で共有する。

import { CheckboxGrid } from './grid.js';
import { TableGrid } from './table-grid.js';
import { renderScene } from './scene.js';
import { autoStep } from './camera.js';
import { project, drawDots, drawWeapon, pickTarget, EmojiLayer } from './sprites.js';
import { Game } from './game.js';

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
    this.projected = [];
    this.game = new Game();
    this.emojiLayer = new EmojiLayer();
    this.setSize(96, 60);
  }

  get cam() {
    return this.game.cam;
  }

  setSize(w, h) {
    const Ctor = BACKENDS[this.backend].ctor;
    // 表示面を作り直すと host の中身が消えるので、絵文字の層は毎回付け直す
    this.grid = new Ctor(this.host, w, h);
    this.emojiLayer.attach(this.host);
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

  setSpriteStyle(style) {
    this.spriteStyle = style;
    if (style !== 'emoji') this.emojiLayer.clear();
  }

  reset() {
    this.game.restart();
    this.frame = 0;
  }

  // いま画面中央に捉えている敵。狙えていなければ null
  aim() {
    return pickTarget(this.projected, this.grid.width);
  }

  // 画面中央に重なっている敵を撃つ
  fire() {
    return this.game.fire(this.aim());
  }

  // 1フレーム描いて内訳を返す
  step(auto) {
    if (auto) autoStep(this.cam, this.frame);
    this.frame++;

    const t0 = performance.now();
    if (this.sprites) this.game.update();
    renderScene(this.grid, this.cam, this.mode);

    if (this.sprites) {
      this.projected = project(this.game.entities(), this.cam, this.grid.width, this.grid.height);
      // ドット版は格子に焼くので flush より前。絵文字版は重ねるだけなので後でよい
      if (this.spriteStyle === 'dot') drawDots(this.grid, this.projected, this.mode);
      drawWeapon(this.grid, this.mode, this.game.muzzleFlash);
    }

    const t1 = performance.now();
    const writes = this.grid.flush(this.mode !== 'A');
    if (this.sprites && this.spriteStyle === 'emoji') {
      this.emojiLayer.sync(this.projected, this.grid.cellPx, this.grid.width);
    } else if (!this.sprites) {
      this.emojiLayer.clear();
    }
    const t2 = performance.now();

    return { renderMs: t1 - t0, flushMs: t2 - t1, writes };
  }
}
