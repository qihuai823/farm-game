import Phaser from 'phaser';
import { makeRng, createMinigame, stepMinigame } from '../systems/Fishing.js';

// ============================================================
// 钓鱼小游戏（绿条追鱼）
// ============================================================
// 全部逻辑在 systems/Fishing.js 里，这里只负责画和收键盘输入。
// 打开时 Farm 场景会被暂停，所以钓鱼不消耗游戏时间。

const FONT = 'system-ui, "Microsoft YaHei", sans-serif';

export class FishingScene extends Phaser.Scene {
  constructor() {
    super('Fishing');
  }

  create(data) {
    this.fish = data.fish;
    this.rng = makeRng(Date.now() % 2147483647 || 1);
    this.m = createMinigame(this.fish);

    this.holding = false;
    this.result = null; // null | 'win' | 'lose'
    this.resultAt = 0;

    this.gfx = this.add.graphics().setDepth(1);
    this.fishIcon = this.add.image(0, 0, `fish-${this.fish.id}`).setDepth(3);

    const mk = (size, color) => ({ fontFamily: FONT, fontSize: `${size}px`, color });
    this.nameText = this.add.text(0, 0, this.fish.name, mk(19, '#ffffff')).setDepth(2);
    this.diffText = this.add.text(0, 0, '', mk(12, '#8fa88a')).setOrigin(1, 0).setDepth(2);
    this.resultText = this.add.text(0, 0, '', mk(22, '#ffffff')).setOrigin(0.5).setDepth(2);
    this.hintText = this.add
      .text(0, 0, '按住 空格 让绿条上升 · 松开 下降', mk(12, '#9db894'))
      .setOrigin(0.5)
      .setDepth(2);

    this.diffText.setText(`难度 ${this.fish.difficulty} · 价值 ${this.fish.sellPrice} g`);

    const kb = this.input.keyboard;
    kb.addCapture('SPACE');
    kb.on('keydown-SPACE', () => {
      if (this.result === null) this.holding = true;
    });
    kb.on('keyup-SPACE', () => {
      this.holding = false;
    });
  }

  finish() {
    const farm = this.scene.get('Farm');
    if (farm) {
      farm.blocking = false;
      farm.onFishingResult(this.result === 'win', this.fish);
    }
    this.scene.resume('Farm');
    this.scene.stop();
  }

  update(time, delta) {
    if (this.result === null) {
      // 卡帧时别让一步走太大，否则模拟会失真
      const dt = Math.min(delta, 50) / 1000;
      stepMinigame(this.m, this.fish, dt, this.holding, this.rng);

      if (this.m.done) {
        this.result = this.m.success ? 'win' : 'lose';
        this.resultAt = time;
        this.holding = false;
        this.resultText.setText(this.m.success ? '钓到了！' : '跑掉了…');
        this.resultText.setColor(this.m.success ? '#b6dd97' : '#e0956a');
      }
    } else if (time - this.resultAt > 1300) {
      this.finish();
      return;
    }

    this.draw();
  }

  draw() {
    const W = this.scale.width;
    const H = this.scale.height;
    const g = this.gfx;
    g.clear();

    const pw = 400;
    const ph = 440;
    const px = (W - pw) / 2;
    const py = (H - ph) / 2;

    // 压暗背景
    g.fillStyle(0x000000, 0.6).fillRect(0, 0, W, H);

    // 面板
    g.fillStyle(0x101d1a, 0.97).fillRoundedRect(px, py, pw, ph, 14);
    g.lineStyle(1, 0x3f6b62, 1).strokeRoundedRect(px, py, pw, ph, 14);

    // 竖直轨道
    const barX = px + 110;
    const barY = py + 86;
    const barW = 52;
    const barH = 290;
    const barBottom = barY + barH;

    g.fillStyle(0x08110f, 1).fillRoundedRect(barX, barY, barW, barH, 8);

    const normToY = (n) => barBottom - n * barH;

    // 绿条（玩家）
    const half = this.m.barH / 2;
    const topN = Math.min(1, this.m.barY + half);
    const botN = Math.max(0, this.m.barY - half);
    const gTop = normToY(topN);
    const gBot = normToY(botN);
    const barColor = this.result === 'lose' ? 0x6b7a66 : 0x6fbf5a;
    g.fillStyle(barColor, 0.9).fillRoundedRect(barX + 3, gTop, barW - 6, Math.max(4, gBot - gTop), 6);

    // 进度条
    const pbX = barX + barW + 20;
    const pbW = 16;
    g.fillStyle(0x08110f, 1).fillRoundedRect(pbX, barY, pbW, barH, 6);
    const progColor = this.m.progress > 0.6 ? 0x7fc46a : this.m.progress > 0.3 ? 0xe0b23a : 0xd9534f;
    const progH = Math.max(3, this.m.progress * barH);
    g.fillStyle(progColor, 1).fillRoundedRect(pbX, barBottom - progH, pbW, progH, 6);

    // 文字
    this.nameText.setPosition(px + 24, py + 20);
    this.diffText.setPosition(px + pw - 24, py + 28);
    this.resultText.setPosition(px + pw / 2, py + ph - 62);
    this.hintText.setPosition(px + pw / 2, py + ph - 26);

    // 鱼图标
    this.fishIcon.setPosition(barX + barW / 2, normToY(this.m.fishY));
  }
}
