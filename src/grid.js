// チェックボックス1個を1ドットとして扱う表示面。
//
// 要素は起動時に一度だけ生成し、以降は差分のあるセルにだけ書き込む。
// checked はインクの有無、transform: scale() はインクの量（被覆率）。
// scale はレイアウトに影響しないので、隣のセルを動かさずに大きさを変えられる。

import { CELL, DotDisplay } from './display.js';

export class CheckboxGrid extends DotDisplay {
  constructor(host, width, height) {
    super(host, width, height);

    const grid = document.createElement('div');
    grid.className = 'dotgrid';
    grid.style.gridTemplateColumns = `repeat(${width}, ${CELL}px)`;
    grid.style.gridAutoRows = `${CELL}px`;
    // 1万個のタブ停止点とクリックによるフレームバッファ破壊を防ぐ
    grid.setAttribute('aria-hidden', 'true');

    const frag = document.createDocumentFragment();
    for (let i = 0; i < this.size; i++) {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.tabIndex = -1;
      frag.appendChild(box);
      this.cells[i] = box;
    }
    grid.appendChild(frag);
    host.appendChild(grid);

    this.root = grid;
    this.fit();
  }

  paintInk(cell, on) {
    cell.checked = on;
  }

  paintScale(cell, amount) {
    cell.style.transform = amount >= 1 ? '' : `scale(${amount.toFixed(3)})`;
  }
}
