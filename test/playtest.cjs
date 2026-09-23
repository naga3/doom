// 自動プレイテスト。3面を実際に攻略しきれるかを確かめる。
//   node test/playtest.cjs
// 敵の位置へカメラを寄せて撃ち、全滅させたら出口へ歩く、を最後の面まで繰り返す。

const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const PORT = Number(process.env.PORT) || 4202;

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

// ページの中で1面ぶん攻略する
async function clearLevel(page) {
  return page.evaluate(async () => {
    const engine = window.__engine;
    const game = engine.game;
    const frame = () => new Promise((r) => requestAnimationFrame(r));

    const startLevel = game.levelIndex;
    const startState = game.state;
    let shots = 0;

    // まずアイテムを回収する。実際のプレイでも道中で拾う。
    // 体力が満タンだと回復は拾わない仕様なので、拾えない品があっても構わない
    const targets = game.pickups.slice();
    for (const item of targets) {
      game.cam.x = item.x;
      game.cam.y = item.y;
      await frame();
    }
    const pickupCount = targets.length;
    const pickedUp = pickupCount - game.pickups.length;

    // 敵を1体ずつ片付ける
    let guard = 0;
    let ranDry = false;
    let missedAim = 0;
    while (game.enemies.length > 0 && guard++ < 200) {
      if (game.ammo <= 0) { ranDry = true; break; } // 弾切れなら即座に諦める
      const target = game.enemies[0];

      // 狙える立ち位置を探す。壁の中に立つと敵が隠れて当たらない
      let aimed = false;
      for (const back of [1.6, 1.2, 0.9, 0.6, 0.3]) {
        const angle = Math.atan2(target.y - game.cam.y, target.x - game.cam.x);
        game.cam.x = target.x - Math.cos(angle) * back;
        game.cam.y = target.y - Math.sin(angle) * back;
        game.cam.angle = Math.atan2(target.y - game.cam.y, target.x - game.cam.x);
        game.cam.dirX = Math.cos(game.cam.angle);
        game.cam.dirY = Math.sin(game.cam.angle);
        game.cam.planeX = -game.cam.dirY * Math.tan(33 * Math.PI / 180);
        game.cam.planeY = game.cam.dirX * Math.tan(33 * Math.PI / 180);
        game.health = 100; // 接近戦の被弾はここでは見ない（弾数は補充しない）
        await frame();
        const locked = engine.aim();
        if (locked && locked.entity === target) { aimed = true; break; }
      }
      if (!aimed) { missedAim++; game.enemies.shift(); continue; }

      const before = game.enemies.length;
      for (let i = 0; i < 30 && game.enemies.length === before; i++) {
        game.fireCooldown = 0;
        if (engine.fire()) shots++;
        await frame();
      }
    }

    const killedAll = game.enemies.length === 0;
    // 出口の施錠は「移動する前」に見る。乗った瞬間に次の面へ進んでしまうため
    await frame();
    const exitLocked = game.exit.locked;

    // 出口へ
    game.cam.x = game.exit.x;
    game.cam.y = game.exit.y;
    await frame();
    await frame();

    return {
      startLevel,
      startState,
      killedAll,
      ranDry,
      missedAim,
      pickupCount,
      pickedUp,
      shots,
      exitLocked,
      ammoLeft: game.ammo,
      levelAfter: game.levelIndex,
      stateAfter: game.state,
    };
  });
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  const failures = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    page.on('pageerror', (e) => failures.push(`ページ内エラー: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') failures.push(`console: ${m.text()}`); });

    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => Boolean(window.__engine));

    const total = await page.evaluate(() => window.__engine.game.constructor && 3);
    for (let i = 0; i < total; i++) {
      const result = await clearLevel(page);
      const name = await page.evaluate(() => window.__engine.game.levelName);
      console.log(
        `面 ${result.startLevel + 1}: 回収 ${result.pickedUp}/${result.pickupCount} / `
        + `全滅 ${result.killedAll ? '○' : '×'} / `
        + `発砲 ${result.shots} / 残弾 ${result.ammoLeft} / 出口 ${result.exitLocked ? '施錠' : '開放'} / `
        + `→ ${result.stateAfter === 'cleared' ? 'クリア' : `面 ${result.levelAfter + 1} (${name})`}`,
      );
      if (!result.killedAll) failures.push(`面 ${result.startLevel + 1} の敵を全滅できない`);
      if (result.missedAim) failures.push(`面 ${result.startLevel + 1} で ${result.missedAim} 体を狙えない`);
      if (result.ranDry) failures.push(`面 ${result.startLevel + 1} で弾が尽きて敵を倒しきれない`);
      if (result.exitLocked) failures.push(`面 ${result.startLevel + 1} の出口が開かない`);
      const advanced = result.levelAfter > result.startLevel || result.stateAfter === 'cleared';
      if (!advanced) failures.push(`面 ${result.startLevel + 1} から先へ進めない`);
      if (result.stateAfter === 'cleared') break;
    }

    const final = await page.evaluate(() => window.__engine.game.state);
    if (final !== 'cleared') failures.push(`最後まで到達できない (state=${final})`);

    // 死ねることも確かめる
    const died = await page.evaluate(async () => {
      const game = window.__engine.game;
      game.restart();
      for (let i = 0; i < 60 && game.state !== 'dead'; i++) game.hurt(10);
      return game.state;
    });
    if (died !== 'dead') failures.push(`体力 0 で死亡状態にならない (state=${died})`);
    else console.log('体力 0 → ゲームオーバーに入る: ○');
  } finally {
    await browser.close();
    server.kill();
  }

  if (failures.length) {
    console.error('\n失敗:\n- ' + failures.join('\n- '));
    process.exit(1);
  }
  console.log('\nすべて通った。3面とも攻略できる。');
})();
