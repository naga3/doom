// A / B / C x 解像度 の描画コストを実測する。
//   node bench/measure.cjs [frames]
// DISPLAY があれば実画面で、無ければヘッドレスで動かす。

const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const PORT = Number(process.env.PORT) || 4188;
const FRAMES = Number(process.argv[2]) || 180;
const HEADED = Boolean(process.env.DISPLAY) && process.env.HEADLESS !== '1';

function startServer() {
  const child = spawn(process.execPath, ['server.cjs'], {
    cwd: `${__dirname}/..`,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((resolve, reject) => {
    child.stdout.once('data', () => resolve(child));
    child.once('error', reject);
    setTimeout(() => reject(new Error('サーバが起動しない')), 5000);
  });
}

function table(rows) {
  const head = ['backend', 'grid', 'cells', 'mode', 'steps', 'fps', 'render ms', 'flush ms', 'cost ms', 'writes/frame'];
  const body = rows.map((r) => [
    r.backend, r.grid, String(r.cells), r.mode, String(r.steps),
    r.fps.toFixed(1), r.renderMs.toFixed(2), r.flushMs.toFixed(2), r.costMs.toFixed(2),
    String(r.writes),
  ]);
  const widths = head.map((_, i) => Math.max(head[i].length, ...body.map((row) => row[i].length)));
  const line = (cells) => cells.map((c, i) => c.padStart(widths[i])).join('  ');
  return [line(head), widths.map((n) => '-'.repeat(n)).join('  '), ...body.map(line)].join('\n');
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch({ headless: !HEADED });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    page.on('pageerror', (e) => console.error('ページ内エラー:', e.message));
    await page.goto(`http://127.0.0.1:${PORT}/bench.html`);
    await page.waitForFunction(() => Boolean(window.__bench));

    console.log(`\n実行環境: ${HEADED ? '実画面 (headed)' : 'ヘッドレス'} / ${FRAMES} フレーム`);

    const results = await page.evaluate((frames) => window.__bench.runAll(frames), FRAMES);
    console.log('\n[1] 表示方式 x 解像度 x モード\n');
    console.log(table(results));

    const sweep = await page.evaluate((frames) => window.__bench.runStepSweep(frames), FRAMES);
    console.log('\n[2] 大きさの段数を変えたとき（B と C のみ）\n');
    console.log(table(sweep));

    console.log([
      '',
      'render ms / flush ms は JS の中だけの時間。fps が落ちているのに cost ms が小さいなら、',
      '時間はブラウザ側の style 再計算と再描画に出ている。判断は fps を見る。',
      'writes/frame がほぼ同じまま fps が変わるなら、原因は style の代入回数ではなく',
      '大きさの種類（ネイティブ部品の再ラスタライズ）。',
    ].join('\n'));
  } finally {
    await browser.close();
    server.kill();
  }
})();
