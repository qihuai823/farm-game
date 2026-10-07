import Phaser from 'phaser';
import { TOOLS, ENERGY_MAX } from '../config.js';
import { CROPS } from '../data/gameData.js';
import { formatClock, nightAlpha } from '../systems/Time.js';

// ============================================================
// HUD 层（独立场景，天然不受摄像机缩放/跟随影响）
// ============================================================
// 这里不存任何游戏状态 —— 每帧从 Farm 场景读，避免两份数据不一致。

const FONT = 'system-ui, "Microsoft YaHei", sans-serif';

export class UIScene extends Phaser.Scene {
  constructor() {
    super('UI');
  }

  create() {
    this.showDebug = true;
    this.farm = this.scene.get('Farm');
    this.state = null;

    // 昼夜遮罩：放在最底层，盖住游戏画面但不盖 HUD
    this.nightOverlay = this.add.rectangle(0, 0, 10, 10, 0x0a1a3a, 0).setOrigin(0, 0).setDepth(-100);

    this.hudGfx = this.add.graphics().setDepth(0);
    this.toolGfx = this.add.graphics().setDepth(0);

    const mk = (size, color, extra = {}) => ({
      fontFamily: FONT,
      fontSize: `${size}px`,
      color,
      ...extra,
    });

    this.dateText = this.add.text(0, 0, '', mk(19, '#ffffff')).setDepth(1);
    this.timeText = this.add.text(0, 0, '', mk(13, '#b6dd97')).setDepth(1);
    this.goldText = this.add.text(0, 0, '', mk(15, '#f0cf72')).setDepth(1);
    this.energyText = this.add.text(0, 0, '', mk(11, '#cfe3c4')).setDepth(1);

    this.toolLabels = TOOLS.map((t, i) =>
      this.add
        .text(0, 0, `${i + 1}\n${t.name}`, mk(13, '#8fa88a', { align: 'center', lineSpacing: 2 }))
        .setOrigin(0.5)
        .setDepth(1)
    );

    this.seedText = this.add.text(0, 0, '', mk(12, '#cfe3c4')).setDepth(1);
    this.promptText = this.add.text(0, 0, '', mk(15, '#ffffff')).setOrigin(0.5).setDepth(1);
    this.toastText = this.add.text(0, 0, '', mk(17, '#ffffff')).setOrigin(0.5).setDepth(1);

    this.debugText = this.add
      .text(0, 0, '', { fontFamily: 'Consolas, monospace', fontSize: '12px', color: '#9fd8a8' })
      .setOrigin(1, 0)
      .setAlign('right')
      .setDepth(1);

    this.hintText = this.add
      .text(0, 0, 'WASD 移动 · 空格 使用工具 · 1-5 切换 · Q 换种子 · Tab 背包 · F8 存档 · F9 重开', mk(12, '#9db894'))
      .setOrigin(1, 0)
      .setDepth(1);

    this.input.keyboard.on('keydown-F1', () => {
      this.showDebug = !this.showDebug;
      this.debugText.setVisible(this.showDebug);
    });

    this.scale.on('resize', this.layout, this);
    this.layout();
  }

  layout() {
    const w = this.scale.width;
    const h = this.scale.height;

    this.nightOverlay.setSize(w, h);

    this.dateText.setPosition(22, 14);
    this.timeText.setPosition(24, 42);
    this.goldText.setPosition(24, 62);
    this.energyText.setPosition(24, 90);

    this.promptText.setPosition(w / 2, h - 132);
    this.toastText.setPosition(w / 2, h * 0.3);
    this.debugText.setPosition(w - 18, 14);
    this.hintText.setPosition(w - 18, h - 24);
  }

  drawHud() {
    const w = this.scale.width;
    const h = this.scale.height;
    const g = this.hudGfx;
    g.clear();

    // 左上状态面板
    g.fillStyle(0x0d1a10, 0.55);
    g.fillRoundedRect(12, 6, 148, 106, 10);

    // 体力条
    const ratio = Math.max(0, Math.min(1, this.state.energy / ENERGY_MAX));
    const bx = 24;
    const by = 92;
    const bw = 124;
    const bh = 8;
    g.fillStyle(0x1d2b1f, 0.9).fillRoundedRect(bx, by, bw, bh, 4);
    const barColor = ratio > 0.5 ? 0x7fc46a : ratio > 0.2 ? 0xe0b23a : 0xd9534f;
    g.fillStyle(barColor, 1).fillRoundedRect(bx, by, Math.max(3, bw * ratio), bh, 4);

    // 操作提示底衬
    if (this.promptText.text) {
      const tw = this.promptText.width + 32;
      g.fillStyle(0x0d1a10, 0.75).fillRoundedRect(w / 2 - tw / 2, h - 150, tw, 36, 10);
    }

    // 抛竿蓄力条
    const fish = this.farm.fishing;
    if (fish && fish.phase === 'charging') {
      const cw = 180;
      const ch = 12;
      const cx = w / 2 - cw / 2;
      const cy = h - 196;
      g.fillStyle(0x0d1a10, 0.85).fillRoundedRect(cx - 6, cy - 6, cw + 12, ch + 12, 8);
      g.fillStyle(0x1d2b1f, 1).fillRoundedRect(cx, cy, cw, ch, 6);
      const p = fish.power;
      g.fillStyle(p > 0.85 ? 0xe0b23a : 0x74b4dd, 1).fillRoundedRect(cx, cy, Math.max(3, cw * p), ch, 6);
    }

    // toast 底衬
    if (this.toastText.text) {
      const tw = this.toastText.width + 32;
      const ty = this.toastText.y - 16;
      g.fillStyle(0x0d1a10, 0.7).fillRoundedRect(w / 2 - tw / 2, ty, tw, 32, 8);
    }

    this.drawToolbar();
  }

  drawToolbar() {
    const g = this.toolGfx;
    g.clear();

    const size = 52;
    const gap = 8;
    const x0 = 16;
    const y0 = this.scale.height - size - 16;

    for (let i = 0; i < TOOLS.length; i++) {
      const x = x0 + i * (size + gap);
      const active = i === this.farm.toolIndex;
      g.fillStyle(active ? 0x2f4a2a : 0x0d1a10, active ? 0.95 : 0.6);
      g.fillRoundedRect(x, y0, size, size, 8);
      g.lineStyle(1, active ? 0xb6dd97 : 0x394a39, 1);
      g.strokeRoundedRect(x, y0, size, size, 8);
    }

    this.toolLabels.forEach((label, i) => {
      label.setPosition(x0 + i * (size + gap) + size / 2, y0 + size / 2);
      label.setColor(i === this.farm.toolIndex ? '#e6ffd8' : '#8fa88a');
    });

    // 当前种子。只有一种的时候要明说，否则玩家会以为 Q 键坏了。
    const owned = this.farm.ownedSeeds();
    const seedId = this.farm.currentSeedId();
    const name = seedId ? CROPS[seedId].name : '无';
    const count = seedId ? this.state.inventory.seeds[seedId] : 0;
    const hint = owned.length > 1 ? '（Q 切换）' : owned.length === 1 ? '（只有这一种）' : '（去商店买）';
    this.seedText.setText(`种子  ${name} ×${count}   ${hint}`);
    this.seedText.setPosition(x0, y0 - 22);
  }

  update() {
    if (!this.farm || !this.farm.state) return;
    this.state = this.farm.state;
    const s = this.state;

    // 昼夜
    this.nightOverlay.setFillStyle(0x0a1a3a, nightAlpha(s.time.minute));

    this.dateText.setText(`第 ${s.time.day} 天`);
    this.timeText.setText(formatClock(s.time.minute));
    this.goldText.setText(`${s.gold} g`);
    this.energyText.setText(`体力 ${Math.round(s.energy)} / ${ENERGY_MAX}`);

    this.promptText.setText(this.farm.prompt || '');
    this.promptText.setVisible(!!this.farm.prompt);

    this.toastText.setText(this.farm.toastMsg || '');

    this.drawHud();

    if (this.showDebug) {
      const p = this.farm.player;
      const t = p.getFacingTile();
      const cell = s.farm.get(t.tx, t.ty);
      this.debugText.setText([
        `pos     ${p.x.toFixed(0)}, ${p.y.toFixed(0)}`,
        `tile    ${t.tx}, ${t.ty}`,
        `ground  ${this.farm.groundGrid[t.ty] ? this.farm.groundGrid[t.ty][t.tx] : '-'}`,
        `soil    ${cell && cell.tilled ? (cell.watered ? 'tilled + wet' : 'tilled') : '-'}`,
        `crop    ${cell && cell.crop ? `${cell.crop.id} ${cell.crop.days}d` : '-'}`,
        `fps     ${Math.round(this.game.loop.actualFps)}`,
      ]);
    }
  }
}
