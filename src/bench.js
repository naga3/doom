// 計測ページ。window.__bench.run() を Playwright から叩く。

import { Engine, SIZES, BACKENDS } from './engine.js';
import { setCoverageSteps } from './display.js';

const host = document.getElementById('screen');
const readout = document.getElementById('readout');
const engine = new Engine(host);

const WARMUP = 30;

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}

async function run({ w, h, mode, frames = 180, steps = 16, backend = 'checkbox' }) {
  setCoverageSteps(steps);
  engine.sprites = false; // 壁と床だけのコストを測る
  engine.backend = backend;
  engine.setSize(w, h);
  engine.setMode(mode);
  engine.reset();

  for (let i = 0; i < WARMUP; i++) {
    engine.step(true);
    await nextFrame();
  }

  const render = [];
  const flush = [];
  const writes = [];
  const start = performance.now();
  for (let i = 0; i < frames; i++) {
    const s = engine.step(true);
    render.push(s.renderMs);
    flush.push(s.flushMs);
    writes.push(s.writes);
    await nextFrame();
  }
  const elapsed = performance.now() - start;

  const stats = {
    backend,
    mode,
    steps,
    cells: w * h,
    grid: `${w}x${h}`,
    frames,
    fps: frames / (elapsed / 1000),
    renderMs: median(render),
    flushMs: median(flush),
    costMs: median(render.map((v, i) => v + flush[i])),
    writes: Math.round(writes.reduce((a, b) => a + b, 0) / writes.length),
  };
  readout.textContent = JSON.stringify(stats, null, 1);
  return stats;
}

async function runAll(frames) {
  const results = [];
  for (const backend of Object.keys(BACKENDS)) {
    for (const size of SIZES) {
      for (const mode of ['A', 'B', 'C']) {
        results.push(await run({ w: size.w, h: size.h, mode, frames, backend }));
      }
    }
  }
  return results;
}

// 大きさの種類を何段まで許すかで、どれだけコストが変わるかを見る。
// 書き込み回数がほぼ同じなのにコストが変わるなら、原因は style の代入ではなく
// 部品の再ラスタライズだと分かる。
async function runStepSweep(frames) {
  const results = [];
  for (const size of [{ w: 96, h: 60 }, { w: 128, h: 80 }, { w: 160, h: 100 }]) {
    for (const mode of ['B', 'C']) {
      for (const steps of [1, 2, 4, 16]) {
        results.push(await run({ ...size, mode, steps, frames }));
      }
    }
  }
  setCoverageSteps(16);
  return results;
}

window.__bench = { run, runAll, runStepSweep, engine };
readout.textContent = '待機中。__bench.run({w,h,mode}) か __bench.runAll() を呼ぶ。';
