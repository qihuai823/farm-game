import { TILE, PLAYER_SPEED } from '../config.js';
import { playerBody } from '../systems/PackSizes.js';

// ============================================================
// 玩家
// ============================================================
// 两个关键设计，后面加种田/工具都要靠它：
//
// 1. 锚点在脚底（origin 0.5, 1）
//    这样 this.y 就等于"脚踩在地面上的位置"。
//    深度排序直接用 this.y，和树/围栏的排序规则天然一致。
//
// 2. 碰撞盒只占脚部（12x8），不是整个人
//    这样上半身可以盖在树冠、围栏上面，是俯视 RPG 的标准手感。
//    以后要判断"玩家面朝哪一格"（锄地/浇水），就是拿脚底位置往外推一格。
// ============================================================

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'player-down-0');

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0.5, 1);

    // 碰撞盒只占脚部。尺寸从当前素材包的玩家贴图高度算出来 ——
    // 星露谷的玩家是 16x32，CC0 的可能是 16x16，换包时这里自动跟着走。
    const pb = playerBody();
    this.body.setSize(pb.w, pb.h);
    this.body.setOffset(pb.ox, pb.oy);
    this.body.updateFromGameObject();

    this.facing = 'down';
    this.speed = PLAYER_SPEED;

    this.cursors = scene.input.keyboard.createCursorKeys();
    this.wasd = scene.input.keyboard.addKeys('W,A,S,D');
  }

  update() {
    const left = this.cursors.left.isDown || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up = this.cursors.up.isDown || this.wasd.W.isDown;
    const down = this.cursors.down.isDown || this.wasd.S.isDown;

    let vx = 0;
    let vy = 0;
    if (left) vx -= 1;
    if (right) vx += 1;
    if (up) vy -= 1;
    if (down) vy += 1;

    // 斜着走不能更快
    if (vx !== 0 && vy !== 0) {
      vx *= Math.SQRT1_2;
      vy *= Math.SQRT1_2;
    }

    this.setVelocity(vx * this.speed, vy * this.speed);

    // 朝向：水平优先（和星露谷一致，斜着走时人物朝左右）
    if (vx < 0) this.facing = 'left';
    else if (vx > 0) this.facing = 'right';
    else if (vy < 0) this.facing = 'up';
    else if (vy > 0) this.facing = 'down';

    if (vx !== 0 || vy !== 0) {
      this.anims.play(`walk-${this.facing}`, true);
    } else {
      this.anims.stop();
      this.setTexture(`player-${this.facing}-0`);
    }

    // 深度排序：脚底越靠下，画得越靠前
    this.setDepth(this.y);
  }

  // 玩家正对着的那一格（阶段 1 的锄地/浇水要用）
  getFacingTile() {
    const dx = this.facing === 'left' ? -1 : this.facing === 'right' ? 1 : 0;
    const dy = this.facing === 'up' ? -1 : this.facing === 'down' ? 1 : 0;
    const footX = this.x + dx * TILE;
    const footY = this.y + dy * TILE;
    return { tx: Math.floor(footX / TILE), ty: Math.floor(footY / TILE) };
  }
}
