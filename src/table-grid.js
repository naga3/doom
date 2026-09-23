// <table> の1マスを1ドットとして扱う表示面。
//
// td そのものを塗ると点灯のたびにテーブルのレイアウトを疑わせるので、
// 中に置いた <i> をインクにして visibility と transform だけで動かす。
// これならセルの寸法は固定のまま、再レイアウトが起きない。

import { CELL, DotDisplay } from './display.js';

export class TableGrid extends DotDisplay {
  constructor(host, width, height) {
    super(host, width, height);

    const table = document.createElement('table');
    table.className = 'dottable';
    table.setAttribute('aria-hidden', 'true');
    const body = document.createElement('tbody');

    for (let y = 0; y < height; y++) {
      const tr = document.createElement('tr');
      for (let x = 0; x < width; x++) {
        const td = document.createElement('td');
        const dot = document.createElement('i');
        td.appendChild(dot);
        tr.appendChild(td);
        this.cells[y * width + x] = dot;
      }
      body.appendChild(tr);
    }
    table.appendChild(body);
    table.style.width = `${width * CELL}px`;
    host.appendChild(table);

    this.root = table;
    this.fit();
  }

  paintInk(cell, on) {
    cell.className = on ? 'on' : '';
  }

  paintScale(cell, amount) {
    cell.style.transform = amount >= 1 ? '' : `scale(${amount.toFixed(3)})`;
  }
}
