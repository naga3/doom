// 表示装置の共通部分。
//
// フレームバッファの持ち方と差分の取り方はどの装置でも同じで、
// 「1ドットをどう点けるか」「大きさをどう変えるか」だけが違う。

export const CELL = 14; // ネイティブのチェックボックスがほぼ 13px。どの装置もこれに揃える

// 被覆率の量子化段数。大きさの種類が増えたときのコストを測れるように可変にしてある
export let COVERAGE_STEPS = 16;

export function setCoverageSteps(steps) {
  COVERAGE_STEPS = steps;
}

export class DotDisplay {
  constructor(host, width, height) {
    this.host = host;
    this.width = width;
    this.height = height;
    this.size = width * height;

    // 表と裏。ink は 0/1、coverage は 0..COVERAGE_STEPS
    this.ink = new Uint8Array(this.size);
    this.coverage = new Uint8Array(this.size);
    this.prevInk = new Uint8Array(this.size);
    this.prevCoverage = new Uint8Array(this.size);
    this.prevCoverage.fill(COVERAGE_STEPS);
    this.cells = new Array(this.size);

    host.textContent = '';
  }

  // 装置全体を1枚の transform で縮める。セルごとに width を変えると格子が崩れる
  fit(maxWidth = Math.min(window.innerWidth - 40, 1280)) {
    const scale = Math.min(1, maxWidth / (this.width * CELL));
    this.root.style.transform = `scale(${scale})`;
    this.host.style.width = `${this.width * CELL * scale}px`;
    this.host.style.height = `${this.height * CELL * scale}px`;
  }

  clear() {
    this.ink.fill(0);
    this.coverage.fill(COVERAGE_STEPS);
  }

  set(x, y, on, coverage = 1) {
    const i = y * this.width + x;
    this.ink[i] = on ? 1 : 0;
    this.coverage[i] = Math.round(Math.max(0, Math.min(1, coverage)) * COVERAGE_STEPS);
  }

  // 全セルを次の flush で書き直させる
  invalidate() {
    this.prevCoverage.fill(255);
  }

  // 差分のあるセルだけ DOM に反映する。戻り値は書き込んだ数
  flush(useCoverage) {
    const { ink, coverage, prevInk, prevCoverage, cells, size } = this;
    let writes = 0;
    for (let i = 0; i < size; i++) {
      const on = ink[i];
      if (on !== prevInk[i]) {
        this.paintInk(cells[i], on === 1);
        prevInk[i] = on;
        writes++;
      }
      if (!on) continue; // 消えているセルの大きさは見えないので触らない
      const cov = useCoverage ? coverage[i] : COVERAGE_STEPS;
      if (cov !== prevCoverage[i]) {
        this.paintScale(cells[i], cov / COVERAGE_STEPS);
        prevCoverage[i] = cov;
        writes++;
      }
    }
    return writes;
  }
}
