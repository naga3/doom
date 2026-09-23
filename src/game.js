// ゲームの状態。レベル、プレイヤー、敵、アイテム、勝ち負けを持つ。
// 描画は一切しない。

import { LEVELS, KINDS, PICKUPS } from './levels.js';
import { setLevel } from './raycast.js';
import { makeCamera, blocked } from './camera.js';

export const MAX_HEALTH = 100;
const START_AMMO = 30;
const FIRE_COOLDOWN = 9;  // フレーム
const FLASH_FRAMES = 5;
const CHASE_RANGE = 11;

export class Game {
  constructor() {
    this.health = MAX_HEALTH;
    this.ammo = START_AMMO;
    this.load(0);
  }

  // レベルを読み込む。体力とアンモは持ち越す
  load(index) {
    const def = LEVELS[index];
    setLevel(index);

    this.levelIndex = index;
    this.levelName = def.name;
    this.cam = makeCamera(def.spawn.x, def.spawn.y, 0);

    this.enemies = def.enemies.map((e) => {
      const kind = KINDS[e.kind];
      return {
        x: e.x, y: e.y,
        emoji: kind.emoji, bitmap: kind.bitmap,
        hp: kind.hp, maxHp: kind.hp,
        speed: kind.speed, damage: kind.damage, reach: kind.reach,
        size: kind.size || 0.85,
        hitFlash: 0, attackCooldown: 0,
      };
    });

    this.pickups = def.pickups.map((p) => {
      const item = PICKUPS[p.kind];
      return {
        x: p.x, y: p.y,
        emoji: item.emoji, bitmap: item.bitmap,
        kind: item.kind, amount: item.amount,
        size: 0.35, lift: 0.22, // 床から少し浮かせる
      };
    });

    this.exit = {
      x: def.exit.x, y: def.exit.y,
      emoji: '🚪', bitmap: 'door', size: 0.9, locked: true,
    };
    this.effects = [];

    this.state = 'playing'; // playing | dead | cleared
    this.fireCooldown = 0;
    this.muzzleFlash = 0;
    this.hurtFlash = 0;
    this.events = [];       // 効果音のために1フレーム分ためる
  }

  restart() {
    this.health = MAX_HEALTH;
    this.ammo = START_AMMO;
    this.load(0);
  }

  get isLastLevel() {
    return this.levelIndex >= LEVELS.length - 1;
  }

  // 描画対象をひとまとめにして返す
  entities() {
    const list = [this.exit, ...this.pickups, ...this.enemies, ...this.effects];
    return list;
  }

  update() {
    this.muzzleFlash = Math.max(0, this.muzzleFlash - 1);
    this.hurtFlash = Math.max(0, this.hurtFlash - 1);
    this.fireCooldown = Math.max(0, this.fireCooldown - 1);

    for (let i = this.effects.length - 1; i >= 0; i--) {
      if (--this.effects[i].life <= 0) this.effects.splice(i, 1);
    }
    if (this.state !== 'playing') return;

    this.updateEnemies();
    this.collectPickups();
    this.checkExit();
  }

  updateEnemies() {
    for (const e of this.enemies) {
      e.hitFlash = Math.max(0, e.hitFlash - 1);
      e.attackCooldown = Math.max(0, e.attackCooldown - 1);

      const dx = this.cam.x - e.x;
      const dy = this.cam.y - e.y;
      const dist = Math.hypot(dx, dy);
      if (dist > CHASE_RANGE) continue;

      if (dist <= e.reach) {
        if (e.attackCooldown === 0) {
          this.hurt(e.damage * 12);
          e.attackCooldown = 30;
        }
        continue;
      }
      // 壁に沿って回り込めるように軸ごとに試す
      const nx = e.x + (dx / dist) * e.speed;
      const ny = e.y + (dy / dist) * e.speed;
      if (!blocked(nx, e.y)) e.x = nx;
      if (!blocked(e.x, ny)) e.y = ny;
    }
  }

  hurt(amount) {
    this.health = Math.max(0, this.health - amount);
    this.hurtFlash = FLASH_FRAMES;
    this.events.push('hurt');
    if (this.health === 0) {
      this.state = 'dead';
      this.events.push('dead');
    }
  }

  collectPickups() {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (Math.hypot(p.x - this.cam.x, p.y - this.cam.y) > 0.6) continue;
      if (p.kind === 'health') {
        if (this.health >= MAX_HEALTH) continue; // 満タンなら残しておく
        this.health = Math.min(MAX_HEALTH, this.health + p.amount);
      } else {
        this.ammo += p.amount;
      }
      this.pickups.splice(i, 1);
      this.events.push('pickup');
    }
  }

  checkExit() {
    this.exit.locked = this.enemies.length > 0;
    this.exit.emoji = this.exit.locked ? '🚪' : '🏁';
    if (this.exit.locked) return;
    if (Math.hypot(this.exit.x - this.cam.x, this.exit.y - this.cam.y) > 0.7) return;

    if (this.isLastLevel) {
      this.state = 'cleared';
      this.events.push('clear');
      return;
    }
    this.events.push('nextlevel');
    this.load(this.levelIndex + 1);
  }

  // 撃つ。命中したら true。target は sprites.pickTarget が返したもの
  fire(target) {
    if (this.state !== 'playing') return false;
    if (this.fireCooldown > 0) return false;
    if (this.ammo <= 0) {
      this.events.push('empty');
      return false;
    }

    this.ammo--;
    this.fireCooldown = FIRE_COOLDOWN;
    this.muzzleFlash = FLASH_FRAMES;
    this.events.push('shot');

    if (!target) return false;
    const enemy = target.entity;
    enemy.hp--;
    enemy.hitFlash = 3;
    this.events.push('hit');

    if (enemy.hp <= 0) {
      const index = this.enemies.indexOf(enemy);
      if (index >= 0) this.enemies.splice(index, 1);
      this.effects.push({
        x: enemy.x, y: enemy.y,
        emoji: '💥', bitmap: 'boom', size: enemy.size, life: 14,
      });
      this.events.push('kill');
    }
    return true;
  }

  // ためた効果音イベントを取り出す
  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }
}
