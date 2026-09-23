// レベル。文字で書いて読み込み時に解釈する。
//
//   # = %  +   壁（見た目が違う4種類）
//   .        床
//   @        プレイヤーの出現地点
//   a b c z  敵（下の KINDS）
//   h m      回復とアンモ
//   E        出口。敵を全滅させてから乗ると次の面へ

export const KINDS = {
  a: { name: 'grunt', emoji: '👹', bitmap: 'imp', hp: 2, speed: 0.016, damage: 0.55, reach: 0.9 },
  b: { name: 'ghost', emoji: '👻', bitmap: 'ghost', hp: 1, speed: 0.028, damage: 0.35, reach: 0.9 },
  c: { name: 'tank', emoji: '🤖', bitmap: 'tank', hp: 5, speed: 0.011, damage: 0.9, reach: 1.0 },
  z: { name: 'boss', emoji: '💀', bitmap: 'imp', hp: 10, speed: 0.020, damage: 1.4, reach: 1.2, size: 1.25 },
};

export const PICKUPS = {
  h: { kind: 'health', emoji: '💊', bitmap: 'medkit', amount: 35 },
  m: { kind: 'ammo', emoji: '📦', bitmap: 'ammo', amount: 10 },
};

const LAYOUTS = [
  {
    name: '倉庫',
    rows: [
      '######################',
      '#@...........#.......#',
      '#...====.....#...%%%.#',
      '#...=..=.....#...%.%.#',
      '#...=..=.....#...%.%.#',
      '#...====.....#.......#',
      '#............#...a...#',
      '#####.########.#######',
      '#....h.......m.......#',
      '#..++++..........a...#',
      '#..+..+..............#',
      '#..+..+....%%%%......#',
      '#..++++....%..%......#',
      '#..........%..%...E..#',
      '#....a.....%%%%......#',
      '######################',
    ],
  },
  {
    name: '回廊',
    rows: [
      '######################',
      '#@..#....b...#...h...#',
      '#...#.#####..#.#####.#',
      '#...#.#...#..#.#...#.#',
      '#.a.#.#.b.#..+.#.c.#.#',
      '#...#.#...#..#.#...#.#',
      '#...#.##+##..#.#####.#',
      '#...#........#....m..#',
      '#...##########.#####.#',
      '#....m.......#.....#.#',
      '####.#######.#####.#.#',
      '#....#.....#.....#.#.#',
      '#.b..#.%%%.#..a..#.#.#',
      '#....#.%E%.#.....#...#',
      '#....#.....#.....#.a.#',
      '######################',
    ],
  },
  {
    name: '大広間',
    rows: [
      '######################',
      '#@.......m...h.......#',
      '#....##.......##.....#',
      '#...##...........##..#',
      '#..##......z......##.#',
      '#..#....m..........#.#',
      '#..#...%%%...%%%...#.#',
      '#..#...%.......%...#.#',
      '#..#...%.......%...#.#',
      '#..#...%%%...%%%...#.#',
      '#..#..........m....#.#',
      '#..##.....c.......##.#',
      '#...##....b......##..#',
      '#.h..##.a......##....#',
      '#......####E####.....#',
      '######################',
    ],
  },
];

const WALL_CHARS = { '#': 1, '=': 2, '%': 3, '+': 4 };

function parse(layout) {
  const height = layout.rows.length;
  const width = layout.rows[0].length;
  const grid = [];
  const enemies = [];
  const pickups = [];
  let spawn = null;
  let exit = null;

  for (let y = 0; y < height; y++) {
    const row = layout.rows[y];
    if (row.length !== width) {
      throw new Error(`${layout.name} の ${y} 行目の幅が揃っていない`);
    }
    const cells = [];
    for (let x = 0; x < width; x++) {
      const ch = row[x];
      const center = { x: x + 0.5, y: y + 0.5 };
      cells.push(WALL_CHARS[ch] || 0);

      if (ch === '@') spawn = center;
      else if (ch === 'E') exit = center;
      else if (KINDS[ch]) enemies.push({ ...center, kind: ch });
      else if (PICKUPS[ch]) pickups.push({ ...center, kind: ch });
    }
    grid.push(cells);
  }

  if (!spawn) throw new Error(`${layout.name} に出現地点がない`);
  if (!exit) throw new Error(`${layout.name} に出口がない`);
  return { name: layout.name, grid, spawn, exit, enemies, pickups };
}

export const LEVELS = LAYOUTS.map(parse);
