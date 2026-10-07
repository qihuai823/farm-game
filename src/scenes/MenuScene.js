import Phaser from 'phaser';
import { CROP_LIST, CROPS, ITEMS } from '../data/gameData.js';
import { saveGame } from '../systems/Save.js';
import { buySeed, sellValue, itemCount, sellAll as sellAllItems, cropEconomics } from '../systems/Shop.js';

// 背包里每样东西用哪张贴图
function iconKey(id) {
  return CROPS[id] ? `crop-mature-${id}` : `fish-${id}`;
}

// ============================================================
// 菜单层：背包 / 种子商店
// ============================================================
// 打开时会把 Farm 场景暂停 —— 所以看商店不会消耗游戏时间。
// 状态一律从 farm.state 现读，这里不存副本。
// ============================================================

const FONT = 'system-ui, "Microsoft YaHei", sans-serif';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(data) {
    this.mode = (data && data.mode) || 'inventory';
    this.farm = this.scene.get('Farm');
    this.sel = 0;
    this.msg = '';
    this.msgColor = '#9db894';

    this.gfx = this.add.graphics().setDepth(1);
    this.texts = [];
    this.icons = [];

    this.bindInput();
    this.refresh();

    this.scale.on('resize', this.refresh, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.refresh, this));
  }

  bindInput() {
    const kb = this.input.keyboard;
    kb.addCapture(['UP', 'DOWN', 'SPACE', 'ENTER', 'ESC', 'TAB', 'W', 'S', 'B']);

    kb.on('keydown-UP', () => this.move(-1));
    kb.on('keydown-W', () => this.move(-1));
    kb.on('keydown-DOWN', () => this.move(1));
    kb.on('keydown-S', () => this.move(1));
    kb.on('keydown-SPACE', () => this.confirm(1));
    kb.on('keydown-ENTER', () => this.confirm(1));
    kb.on('keydown-B', () => this.confirm(5));
    kb.on('keydown-ESC', () => this.close());
    kb.on('keydown-TAB', () => this.close());
  }

  // ---------- 数据 ----------

  shopRows() {
    return [...CROP_LIST.map((c) => ({ kind: 'seed', crop: c })), { kind: 'sell' }];
  }

  items() {
    return this.farm.state.inventory.items;
  }

  // ---------- 操作 ----------

  move(d) {
    if (this.mode !== 'shop') return;
    const n = this.shopRows().length;
    this.sel = (this.sel + d + n) % n;
    this.refresh();
  }

  confirm(n) {
    if (this.mode !== 'shop') return;
    const row = this.shopRows()[this.sel];
    if (row.kind === 'sell') return this.doSellAll();
    return this.buy(row.crop, n);
  }

  buy(crop, n) {
    const bought = buySeed(this.farm.state, crop.id, n);
    if (bought === 0) {
      this.flash('金币不够', '#e0956a');
    } else {
      this.flash(`买了 ${bought} 个${crop.name}种子`, '#b6dd97');
    }
    this.refresh();
  }

  doSellAll() {
    const { count, total } = sellAllItems(this.farm.state);
    if (count === 0) {
      this.flash('背包里没有东西', '#e0956a');
    } else {
      this.flash(`卖出 ${count} 件，+${total} g`, '#f0cf72');
    }
    this.refresh();
  }

  flash(msg, color) {
    this.msg = msg;
    this.msgColor = color || '#9db894';
  }

  close() {
    const farm = this.scene.get('Farm');
    if (farm) {
      farm.blocking = false;
      saveGame(farm.state); // 商店里花过钱，顺手存一下
    }
    this.scene.resume('Farm');
    this.scene.stop();
  }

  // ---------- 渲染 ----------

  addLine(x, y, text, size, color, align) {
    const t = this.add
      .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color })
      .setDepth(2);
    if (align === 'right') t.setOrigin(1, 0);
    if (align === 'center') t.setOrigin(0.5, 0);
    this.texts.push(t);
    return t;
  }

  refresh() {
    for (const t of this.texts) t.destroy();
    for (const i of this.icons) i.destroy();
    this.texts = [];
    this.icons = [];

    const W = this.scale.width;
    const H = this.scale.height;
    const g = this.gfx;
    g.clear();

    // 背景压暗
    g.fillStyle(0x000000, 0.55).fillRect(0, 0, W, H);

    const w = Math.min(580, W - 60);
    const h = Math.min(440, H - 80);
    const x = (W - w) / 2;
    const y = (H - h) / 2;

    g.fillStyle(0x14210f, 0.97).fillRoundedRect(x, y, w, h, 14);
    g.lineStyle(1, 0x4c6b3f, 1).strokeRoundedRect(x, y, w, h, 14);

    const title = this.mode === 'shop' ? '种子商店' : '背包';
    this.addLine(x + 26, y + 20, title, 18, '#e6ffd8');
    this.addLine(x + w - 26, y + 24, `${this.farm.state.gold} g`, 15, '#f0cf72', 'right');

    if (this.mode === 'shop') this.renderShop(x, y, w, h);
    else this.renderInventory(x, y, w, h);

    // 消息
    if (this.msg) this.addLine(x + 26, y + h - 56, this.msg, 13, this.msgColor);

    // 底部提示
    const hint =
      this.mode === 'shop'
        ? '↑↓ 选择 · 空格 买 1 · B 买 5 · Esc 关闭'
        : 'Tab 或 Esc 关闭';
    this.addLine(x + w / 2, y + h - 28, hint, 12, '#8fa88a', 'center');
  }

  renderShop(x, y, w, h) {
    const rows = this.shopRows();
    const top = y + 64;
    const rowH = 40;
    const s = this.farm.state;

    rows.forEach((row, i) => {
      const ry = top + i * rowH;
      const selected = i === this.sel;

      if (selected) {
        this.gfx.fillStyle(0x2f4a2a, 0.92).fillRoundedRect(x + 16, ry, w - 32, rowH - 6, 8);
      }

      if (row.kind === 'seed') {
        const c = row.crop;
        const owned = s.inventory.seeds[c.id] || 0;
        const afford = s.gold >= c.seedCost;
        const nameColor = selected ? '#e6ffd8' : '#cfe3c4';

        this.addLine(x + 32, ry + 9, c.name, 15, nameColor);
        this.addLine(x + 148, ry + 12, `${c.growthDays} 天成熟`, 12, '#8fa88a');
        this.addLine(x + w - 120, ry + 10, `${c.seedCost} g`, 14, afford ? '#f0cf72' : '#a05a5a', 'right');
        this.addLine(x + w - 28, ry + 12, `持有 ${owned}`, 12, '#8fa88a', 'right');
      } else {
        const count = itemCount(this.items());
        const total = sellValue(this.items());
        const dim = count === 0;
        this.addLine(x + 32, ry + 9, '卖出全部收获', 15, dim ? '#6b7a66' : selected ? '#e6ffd8' : '#cfe3c4');
        this.addLine(
          x + w - 28,
          ry + 10,
          dim ? '背包里没有东西' : `${count} 件   +${total} g`,
          14,
          dim ? '#6b7a66' : '#f0cf72',
          'right'
        );
      }
    });

    // 当前作物的收益提示 —— 让"该种什么"这个取舍在界面上可见
    const row = rows[this.sel];
    if (row.kind === 'seed') {
      const c = row.crop;
      const { profit, perDay, steadyPerDay } = cropEconomics(c);
      const detail =
        c.regrowDays > 0
          ? `净利 ${profit} g / ${c.growthDays} 天 · 复收后每 ${c.regrowDays} 天 +${c.sellPrice} g（稳态 ≈${steadyPerDay.toFixed(0)} g 每天）`
          : `净利 ${profit} g / ${c.growthDays} 天  ≈ ${perDay.toFixed(1)} g 每天`;
      this.addLine(x + 26, y + h - 84, detail, 13, '#b6dd97');
    }
  }

  renderInventory(x, y, w, h) {
    const s = this.farm.state;
    let ly = y + 64;

    const icon = (id, indent) => {
      this.icons.push(this.add.image(x + indent + 8, ly + 8, iconKey(id)).setDepth(2));
    };
    const line = (text, color, size, indent) => {
      this.addLine(x + (indent === undefined ? 32 : indent), ly, text, size || 14, color);
      ly += 26;
    };

    const seedIds = Object.keys(s.inventory.seeds).filter((id) => s.inventory.seeds[id] > 0);
    line('种子', '#b6dd97', 15, 24);
    if (seedIds.length === 0) line('（没有种子了，去商店买）', '#6b7a66', 13, 48);
    for (const id of seedIds) {
      icon(id, 24);
      line(`${CROPS[id].name} × ${s.inventory.seeds[id]}`, '#cfe3c4', 14, 48);
    }

    ly += 10;
    const itemIds = Object.keys(s.inventory.items).filter((id) => s.inventory.items[id] > 0);
    line('收获', '#b6dd97', 15, 24);
    if (itemIds.length === 0) line('（还没有收获，去种地或者钓鱼）', '#6b7a66', 13, 48);
    for (const id of itemIds) {
      const n = s.inventory.items[id];
      icon(id, 24);
      line(`${ITEMS[id].name} × ${n}`, '#cfe3c4', 14, 48);
      this.addLine(x + w - 32, ly - 26, `价值 ${ITEMS[id].sellPrice * n} g`, 13, '#f0cf72', 'right');
    }

    ly += 10;
    line('统计', '#b6dd97', 15, 24);
    line(`已过天数   ${s.stats.daysPlayed}`, '#9db894', 13, 48);
    line(`累计收入   ${s.stats.totalEarned} g`, '#9db894', 13, 48);
    line(`当前体力   ${Math.round(s.energy)}`, '#9db894', 13, 48);
  }
}
