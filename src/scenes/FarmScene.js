import Phaser from 'phaser';
import {
  TILE,
  ZOOM,
  MAP_W,
  MAP_H,
  TOOLS,
  FISHING,
  MINUTES_PER_REAL_SECOND,
  DAY_START,
  DAY_END,
  ENERGY_COST,
  ENERGY_MAX,
  AUTOSAVE_INTERVAL_MS,
} from '../config.js';
import { buildMap, GROUND, SOLID_GROUND, LANDMARKS } from '../mapData.js';
import { CROPS, FISH_LIST } from '../data/gameData.js';
import { Player } from '../entities/Player.js';
import { createNewState } from '../systems/state.js';
import { loadGame, saveGame, clearSave } from '../systems/Save.js';
import { sellAll } from '../systems/Shop.js';
import { bodyOf } from '../systems/PackSizes.js';
import {
  makeRng,
  pickFish,
  castDistance,
  rollBiteDelay,
} from '../systems/Fishing.js';
import { nextDay, advanceClock } from '../systems/Time.js';

// 每种物件的碰撞盒规格
// w/h = 'full' 表示跟贴图一样大；dx/dy 是相对"贴图底部中心"的偏移
//
// 数值从当前素材包的尺寸按比例算出来（systems/PackSizes.js）——
// 换素材包时房子/树/出货箱的尺寸会变，碰撞盒自动跟着走。
const OBJECT_SPECS = {
  house: { body: bodyOf('house') },
  tree: { body: bodyOf('tree') }, // 只有树干挡路，树冠可以走过去
  fence: { body: { w: TILE, h: 8, dx: 0, dy: -4 } },
  bin: { body: bodyOf('bin') },
  shop: { body: bodyOf('shop') },
};

// 哪些地面可以锄
const TILLABLE = new Set([GROUND.GRASS, GROUND.GRASS_ALT, GROUND.DIRT]);

// 作物当前该用哪张贴图
function cropTextureKey(crop) {
  const def = CROPS[crop.id];
  if (!def) return null;
  if (crop.days >= def.growthDays) return `crop-mature-${crop.id}`;
  const stage = Math.min(3, Math.floor((crop.days / def.growthDays) * 4));
  return `crop-${stage}`;
}

export class FarmScene extends Phaser.Scene {
  constructor() {
    super('Farm');
  }

  create() {
    // ---- 状态：有存档就续上，没有就开新档 ----
    this.state = loadGame() || createNewState();

    // ---- 地图 ----
    const { ground, objects } = buildMap();
    this.groundGrid = ground;

    // 哪些格子被物件占了（不能锄地、不能种）
    this.blocked = new Set();
    for (const o of objects) {
      const tw = o.tw || 1;
      const th = o.th || 1;
      for (let y = o.ty; y < o.ty + th; y++) {
        for (let x = o.tx; x < o.tx + tw; x++) this.blocked.add(`${x},${y}`);
      }
    }

    const map = this.make.tilemap({ data: ground, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0);
    this.groundLayer = map.createLayer(0, tileset, 0, 0);
    this.groundLayer.setCollision(SOLID_GROUND);
    this.groundLayer.setDepth(-1000);

    this.solids = this.physics.add.staticGroup();
    for (const o of objects) this.spawnObject(o);

    const worldW = MAP_W * TILE;
    const worldH = MAP_H * TILE;

    // ---- 玩家 ----
    const sp = this.state.player;
    this.player = new Player(this, sp.x, sp.y);
    this.player.facing = sp.facing || 'down';
    this.player.setTexture(`player-${this.player.facing}-0`);

    this.physics.add.collider(this.player, this.groundLayer);
    this.physics.add.collider(this.player, this.solids);
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.player.setCollideWorldBounds(true);

    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setZoom(ZOOM);
    this.cameras.main.startFollow(this.player, true, 0.18, 0.18);
    this.cameras.main.setBackgroundColor('#16211a');

    // ---- 农田视觉：每个有状态的格子对应 1~2 个精灵 ----
    this.tileVisuals = new Map();
    this.refreshAllTiles();

    // ---- 交互状态 ----
    this.toolIndex = 0;
    this.seedIndex = 0;
    // blocking = 有弹出层占着（菜单 / 钓鱼小游戏）。此时本场景被 pause，输入也要挡掉
    this.blocking = false;
    this.prompt = null;
    this.toastMsg = null;
    this.toastUntil = 0;
    this.autosaveTimer = 0;
    this.warnedLate = false;

    // 钓鱼状态机：idle -> charging -> waiting -> bite -> (小游戏)
    this.rng = makeRng((Date.now() % 2147483647) || 1);
    this.fishing = { phase: 'idle', power: 0, timer: 0, tile: null, bobber: null, mark: null };

    this.bindInput();
    this.bindSaveOnLeave();

    if (!this.scene.isActive('UI')) this.scene.launch('UI');
  }

  // 页面被刷新/关闭/切到后台之前，抢存一次。
  //
  // 为什么需要：开发期改代码会触发热重载，Vite 直接整页刷新 ——
  // 不抢存的话，玩家刚种下去的东西会被刷掉（真踩过）。
  // 定时自动存档（20 秒一次）兜不住这种"随时可能来的刷新"。
  bindSaveOnLeave() {
    const saveNow = () => saveGame(this.state);
    const onHide = () => {
      if (document.hidden) saveNow();
    };

    window.addEventListener('beforeunload', saveNow);
    document.addEventListener('visibilitychange', onHide);

    this.events.once('shutdown', () => {
      window.removeEventListener('beforeunload', saveNow);
      document.removeEventListener('visibilitychange', onHide);
    });
  }

  bindInput() {
    const kb = this.input.keyboard;

    // 抓住这些键，别让浏览器拿去滚动页面 / 切换焦点 / 刷新
    kb.addCapture(['SPACE', 'TAB', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'F1', 'F2', 'F8', 'F9']);

    // 有弹出层的时候，本场景会被 pause，但同帧的按键事件仍可能漏进来 —— 统一挡掉
    const guard = (fn) => () => {
      if (this.blocking) return;
      fn();
    };

    kb.on('keydown-ONE', guard(() => this.selectTool(0)));
    kb.on('keydown-TWO', guard(() => this.selectTool(1)));
    kb.on('keydown-THREE', guard(() => this.selectTool(2)));
    kb.on('keydown-FOUR', guard(() => this.selectTool(3)));
    kb.on('keydown-FIVE', guard(() => this.selectTool(4)));
    kb.on('keydown-Q', guard(() => this.cycleSeed()));
    kb.on('keydown-TAB', guard(() => this.openMenu('inventory')));
    kb.on('keydown-F8', guard(() => this.toast(saveGame(this.state) ? '已存档' : '存档失败')));
    kb.on('keydown-F9', guard(() => this.resetGame()));

    // 空格是"按住/松开"两段语义（蓄力、提竿），不能只用一个 keydown
    kb.on(
      'keydown-SPACE',
      guard(() => {
        if (this.fishing.phase === 'bite') return this.hookFish();
        if (this.fishing.phase !== 'idle') return;
        // 特殊交互（睡觉/出货/商店）不走蓄力，直接执行
        if (this.isSpecialTile()) return this.doAction();
        if (TOOLS[this.toolIndex].id === 'rod') return this.startCharge();
        this.doAction();
      })
    );

    kb.on('keyup-SPACE', () => {
      if (this.blocking) return;
      if (this.fishing.phase === 'charging') return this.releaseCast();
      if (this.fishing.phase === 'waiting') return this.cancelCast();
    });

    // F2 看碰撞盒（调试神器）
    kb.on('keydown-F2', () => {
      const w = this.physics.world;
      w.drawDebug = !w.drawDebug;
      if (!w.drawDebug && w.debugGraphic) w.debugGraphic.clear();
    });
  }

  openMenu(mode) {
    if (this.blocking) return;
    this.blocking = true;
    this.scene.launch('Menu', { mode });
    this.scene.pause();
  }

  // 面朝的那格是不是特殊交互点
  isSpecialTile() {
    const { tx, ty } = this.player.getFacingTile();
    return (
      (tx === LANDMARKS.bed.tx && ty === LANDMARKS.bed.ty) ||
      (tx === LANDMARKS.bin.tx && ty === LANDMARKS.bin.ty) ||
      (tx === LANDMARKS.shop.tx && ty === LANDMARKS.shop.ty)
    );
  }

  // ============================================================
  // 钓鱼
  // ============================================================

  isWater(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    return this.groundGrid[ty][tx] === GROUND.WATER;
  }

  facingDir() {
    const d = this.player.facing;
    return {
      dx: d === 'left' ? -1 : d === 'right' ? 1 : 0,
      dy: d === 'up' ? -1 : d === 'down' ? 1 : 0,
    };
  }

  startCharge() {
    const { tx, ty } = this.player.getFacingTile();
    if (!this.isWater(tx, ty)) return this.toast('要朝着水面才能抛竿');
    if (this.state.energy < ENERGY_COST.rod) return this.toast('体力不够了，回去睡觉吧');

    this.fishing.phase = 'charging';
    this.fishing.power = 0;
  }

  releaseCast() {
    const f = this.fishing;
    const base = this.player.getFacingTile();
    const dir = this.facingDir();
    const dist = castDistance(f.power);

    // 沿朝向找连续的水面，浮标落在最后一格水上（抛过头了也不会白抛）
    let best = null;
    for (let i = 0; i < dist; i++) {
      const tx = base.tx + dir.dx * i;
      const ty = base.ty + dir.dy * i;
      if (!this.isWater(tx, ty)) break;
      best = { tx, ty };
    }

    if (!best) {
      f.phase = 'idle';
      f.power = 0;
      return this.toast('这个方向钓不到');
    }

    this.state.energy = Math.max(0, this.state.energy - ENERGY_COST.rod);
    f.tile = best;
    f.phase = 'waiting';
    f.timer = rollBiteDelay(this.rng);
    f.power = 0;

    const bx = best.tx * TILE + TILE / 2;
    const by = best.ty * TILE + TILE / 2;
    f.bobber = this.add.image(bx, by, 'bobber').setDepth(9000);
    this.tweens.add({
      targets: f.bobber,
      y: by - 2,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  cancelCast() {
    this.toast('收竿了');
    this.clearFishing();
  }

  hookFish() {
    const fish = pickFish(FISH_LIST, this.rng);
    this.clearFishing();

    this.blocking = true;
    this.scene.launch('Fishing', { fish });
    this.scene.pause();
  }

  clearFishing() {
    const f = this.fishing;
    if (f.bobber) {
      this.tweens.killTweensOf(f.bobber);
      f.bobber.destroy();
      f.bobber = null;
    }
    if (f.mark) {
      this.tweens.killTweensOf(f.mark);
      f.mark.destroy();
      f.mark = null;
    }
    f.phase = 'idle';
    f.power = 0;
    f.timer = 0;
    f.tile = null;
  }

  // 小游戏结束后由 FishingScene 回调
  onFishingResult(success, fish) {
    this.blocking = false;
    if (!success) return this.toast(`${fish.name}跑掉了…`);

    const inv = this.state.inventory.items;
    inv[fish.id] = (inv[fish.id] || 0) + 1;
    this.toast(`钓到 ${fish.name}！（${fish.sellPrice} g）`);
    saveGame(this.state);
  }

  updateFishing(delta) {
    const f = this.fishing;
    const dt = Math.min(delta, 50) / 1000;

    if (f.phase === 'charging') {
      f.power = Math.min(1, f.power + FISHING.chargeRate * dt);
      return;
    }

    if (f.phase === 'waiting' || f.phase === 'bite') {
      f.timer -= dt;
      if (f.timer > 0) return;

      if (f.phase === 'waiting') {
        // 咬钩了！给玩家一个反应窗口
        f.phase = 'bite';
        f.timer = FISHING.hookWindow;
        const b = f.bobber;
        f.mark = this.add
          .text(b.x, b.y - 20, '!', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '20px',
            color: '#ffe66b',
          })
          .setOrigin(0.5)
          .setDepth(9001);
        this.tweens.add({
          targets: f.mark,
          y: b.y - 26,
          duration: 220,
          yoyo: true,
          repeat: -1,
        });
      } else {
        this.toast('鱼跑了…');
        this.clearFishing();
      }
    }
  }

  // ============================================================
  // 物件
  // ============================================================

  spawnObject(o) {
    const tw = o.tw || 1;
    const th = o.th || 1;
    const cx = (o.tx + tw / 2) * TILE;
    const bottom = (o.ty + th) * TILE;

    // 视觉：锚点在底部中心，深度 = 底部 y（y 排序）
    this.add.image(cx, bottom, o.type).setOrigin(0.5, 1).setDepth(bottom);

    // 碰撞：独立透明矩形，和贴图完全解耦
    const spec = OBJECT_SPECS[o.type].body;
    const bw = spec.w === 'full' ? tw * TILE : spec.w;
    const bh = spec.h === 'full' ? th * TILE : spec.h;
    this.solids.add(this.add.rectangle(cx + spec.dx, bottom - bh / 2 + spec.dy, bw, bh, 0x000000, 0));
  }

  // ============================================================
  // 农田视觉刷新
  // ============================================================

  refreshTile(tx, ty) {
    const k = `${tx},${ty}`;
    const t = this.state.farm.get(tx, ty);
    let vis = this.tileVisuals.get(k);

    // 没状态了（理论上不会发生，除非清档）→ 全部拆掉
    if (!t || !t.tilled) {
      if (vis) {
        if (vis.soil) vis.soil.destroy();
        if (vis.crop) vis.crop.destroy();
        this.tileVisuals.delete(k);
      }
      return;
    }

    if (!vis) {
      vis = {
        cx: tx * TILE + TILE / 2,
        cy: ty * TILE + TILE / 2,
        bottom: (ty + 1) * TILE,
        soil: null,
        crop: null,
      };
      this.tileVisuals.set(k, vis);
    }

    // 土壤
    const soilKey = t.watered ? 'soil-watered' : 'soil-tilled';
    if (!vis.soil) {
      vis.soil = this.add.image(vis.cx, vis.cy, soilKey).setDepth(-900);
    } else if (vis.soil.texture.key !== soilKey) {
      vis.soil.setTexture(soilKey);
    }

    // 作物
    const cropKey = t.crop ? cropTextureKey(t.crop) : null;
    if (!cropKey) {
      if (vis.crop) {
        vis.crop.destroy();
        vis.crop = null;
      }
    } else if (!vis.crop) {
      // 深度比格子底部小 1，保证玩家能盖在作物上面
      vis.crop = this.add.image(vis.cx, vis.bottom, cropKey).setOrigin(0.5, 1).setDepth(vis.bottom - 1);
    } else if (vis.crop.texture.key !== cropKey) {
      vis.crop.setTexture(cropKey);
    }
  }

  refreshAllTiles() {
    const keys = new Set([...this.tileVisuals.keys(), ...this.state.farm.tiles.keys()]);
    for (const k of keys) {
      const [tx, ty] = k.split(',').map(Number);
      this.refreshTile(tx, ty);
    }
  }

  // ============================================================
  // 输入 / 工具
  // ============================================================

  selectTool(i) {
    if (i < 0 || i >= TOOLS.length) return;
    this.toolIndex = i;
  }

  ownedSeeds() {
    const seeds = this.state.inventory.seeds;
    return Object.keys(seeds).filter((id) => seeds[id] > 0);
  }

  currentSeedId() {
    const owned = this.ownedSeeds();
    if (!owned.length) return null;
    return owned[this.seedIndex % owned.length];
  }

  cycleSeed() {
    const owned = this.ownedSeeds();

    // ★ 一定要给反馈。原来只有一种种子时直接 return，玩家会以为 Q 键坏了。
    if (owned.length === 0) {
      return this.toast('没有种子了，去商店买');
    }
    if (owned.length === 1) {
      return this.toast(`只有 ${CROPS[owned[0]].name} 一种种子，去商店买更多品种`);
    }

    this.seedIndex = (this.seedIndex + 1) % owned.length;
    const id = this.currentSeedId();
    this.toast(`种子：${CROPS[id].name} ×${this.state.inventory.seeds[id]}`);
  }

  doAction() {
    const { tx, ty } = this.player.getFacingTile();

    // 1) 特殊交互优先
    if (tx === LANDMARKS.bed.tx && ty === LANDMARKS.bed.ty) return this.sleep();
    if (tx === LANDMARKS.bin.tx && ty === LANDMARKS.bin.ty) return this.shipAll();
    if (tx === LANDMARKS.shop.tx && ty === LANDMARKS.shop.ty) return this.openMenu('shop');

    // 2) 工具
    const tool = TOOLS[this.toolIndex];
    const cost = ENERGY_COST[tool.id] || 0;
    if (this.state.energy < cost) return this.toast('体力不够了，回去睡觉吧');

    if (tool.id === 'hoe') return this.useHoe(tx, ty, cost);
    if (tool.id === 'can') return this.useCan(tx, ty, cost);
    if (tool.id === 'seed') return this.useSeed(tx, ty, cost);
    if (tool.id === 'hand') return this.useHand(tx, ty, cost);
  }

  canTill(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    if (this.blocked.has(`${tx},${ty}`)) return false;
    return TILLABLE.has(this.groundGrid[ty][tx]);
  }

  useHoe(tx, ty, cost) {
    if (!this.canTill(tx, ty)) return this.toast('这里锄不动');
    const t = this.state.farm.get(tx, ty);
    if (t && t.tilled) return this.toast('这块地已经锄过了');
    this.state.farm.till(tx, ty);
    this.spend(cost);
    this.refreshTile(tx, ty);
    this.flashTile(tx, ty, 0xb08a5a);
    this.swing();
  }

  useCan(tx, ty, cost) {
    const t = this.state.farm.get(tx, ty);
    if (!t || !t.tilled) return this.toast('要先锄地');
    if (t.watered) return this.toast('已经浇过水了');
    this.state.farm.water(tx, ty);
    this.spend(cost);
    this.refreshTile(tx, ty);
    this.flashTile(tx, ty, 0x74b4dd);
    this.swing();
  }

  useSeed(tx, ty, cost) {
    const t = this.state.farm.get(tx, ty);
    if (!t || !t.tilled) return this.toast('要先锄地');
    if (t.crop) return this.toast('这里已经种了东西');

    const seedId = this.currentSeedId();
    if (!seedId) return this.toast('没有种子了');

    this.state.inventory.seeds[seedId] -= 1;
    this.state.farm.plant(tx, ty, seedId);
    this.spend(cost);
    this.refreshTile(tx, ty);
    this.flashTile(tx, ty, 0x9fe1cb);
    this.swing();
    this.toast(`种下了 ${CROPS[seedId].name}`);
  }

  useHand(tx, ty, cost) {
    const t = this.state.farm.get(tx, ty);
    if (!t || !t.crop) return this.toast('这里没有作物');

    if (!this.state.farm.isMature(tx, ty)) {
      const def = CROPS[t.crop.id];
      return this.toast(`${def.name}还没熟（浇水 ${t.crop.days}/${def.growthDays} 天）`);
    }

    const id = this.state.farm.harvest(tx, ty);
    const inv = this.state.inventory.items;
    inv[id] = (inv[id] || 0) + 1;

    this.spend(cost);
    this.refreshTile(tx, ty);
    this.flashTile(tx, ty, 0xf0cf72);
    this.swing();
    this.toast(`收获 ${CROPS[id].name} ×1`);
  }

  spend(n) {
    this.state.energy = Math.max(0, this.state.energy - n);
  }

  // ============================================================
  // 睡觉 / 出货
  // ============================================================

  sleep() {
    const s = this.state;
    s.farm.advanceDay(); // 浇过水的作物 +1 天，浇水标记清空
    nextDay(s.time);
    s.time.minute = DAY_START;
    s.energy = ENERGY_MAX;
    s.stats.daysPlayed += 1;
    this.warnedLate = false;

    // 回到床边
    this.player.setPosition(
      LANDMARKS.spawn.tx * TILE + TILE / 2,
      (LANDMARKS.spawn.ty + 1) * TILE
    );
    this.player.facing = 'down';
    this.player.setTexture('player-down-0');

    this.refreshAllTiles();
    saveGame(s);

    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.cameras.main.fadeIn(320, 0, 0, 0));

    this.toast(`第 ${s.time.day} 天`);
  }

  shipAll() {
    const { count, total } = sellAll(this.state);
    if (count === 0) return this.toast('没有可以卖的作物');

    this.flashTile(LANDMARKS.bin.tx, LANDMARKS.bin.ty, 0xf0cf72);
    this.toast(`卖出 ${count} 件作物，+${total} g`);
    saveGame(this.state);
  }

  resetGame() {
    clearSave();
    this.clearFishing();
    this.state = createNewState();

    for (const vis of this.tileVisuals.values()) {
      if (vis.soil) vis.soil.destroy();
      if (vis.crop) vis.crop.destroy();
    }
    this.tileVisuals.clear();

    this.player.setPosition(
      LANDMARKS.spawn.tx * TILE + TILE / 2,
      (LANDMARKS.spawn.ty + 1) * TILE
    );
    this.player.facing = 'down';
    this.player.setTexture('player-down-0');
    this.toolIndex = 0;
    this.seedIndex = 0;

    this.refreshAllTiles();
    this.toast('已清空存档，重新开始');
  }

  // ============================================================
  // 反馈
  // ============================================================

  flashTile(tx, ty, color) {
    const c = this.add
      .circle(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 5, color, 0.85)
      .setDepth(5000);
    this.tweens.add({
      targets: c,
      scale: 2.6,
      alpha: 0,
      duration: 260,
      onComplete: () => c.destroy(),
    });
  }

  // 挥动反馈用旋转，不用缩放（缩放会带动物理刚体）
  swing() {
    this.tweens.add({ targets: this.player, angle: { from: -6, to: 0 }, duration: 140 });
  }

  toast(msg) {
    this.toastMsg = msg;
    this.toastUntil = this.time.now + 1800;
  }

  // ============================================================
  // 每帧
  // ============================================================

  updatePrompt() {
    const f = this.fishing;
    if (f.phase === 'bite') {
      this.prompt = '空格  提竿！';
      return;
    }
    if (f.phase === 'charging') {
      this.prompt = '松开 空格 抛竿';
      return;
    }
    if (f.phase === 'waiting') {
      this.prompt = '等鱼咬钩…（空格 收竿）';
      return;
    }

    const { tx, ty } = this.player.getFacingTile();
    let p = null;

    if (tx === LANDMARKS.bed.tx && ty === LANDMARKS.bed.ty) {
      p = '空格  睡觉（进入下一天）';
    } else if (tx === LANDMARKS.bin.tx && ty === LANDMARKS.bin.ty) {
      p = '空格  卖出全部作物';
    } else if (tx === LANDMARKS.shop.tx && ty === LANDMARKS.shop.ty) {
      p = '空格  打开种子商店';
    } else if (this.state.farm.isMature(tx, ty)) {
      p = '空格  收获';
    } else if (TOOLS[this.toolIndex].id === 'rod' && this.isWater(tx, ty)) {
      p = '按住 空格 蓄力抛竿';
    }
    this.prompt = p;
  }

  update(time, delta) {
    this.player.update();

    const s = this.state;

    // 把玩家状态同步回存档对象
    s.player.x = this.player.x;
    s.player.y = this.player.y;
    s.player.facing = this.player.facing;

    // 时间推进。advanceClock 内部会把 delta 夹住上限 ——
    // 切到别的标签页再回来时浏览器会给一个巨大的 delta，不夹住就会凭空跳几个小时。
    if (advanceClock(s.time, delta, MINUTES_PER_REAL_SECOND)) {
      s.time.minute = DAY_END;
      this.sleep();
      this.toast('太晚了，你昏倒了');
    } else if (!this.warnedLate && s.time.minute >= 25 * 60) {
      // 一天只有几分钟现实时间，快到 02:00 时提醒一下
      this.warnedLate = true;
      this.toast('凌晨 1 点了，再不睡觉就要昏倒了');
    }

    this.updatePrompt();
    this.updateFishing(delta);
    this.autosave(delta);

    if (this.toastMsg && time > this.toastUntil) this.toastMsg = null;
  }

  // 定时存档。防止刷新页面（比如改代码触发热重载）丢掉没存过的进度。
  autosave(delta) {
    this.autosaveTimer += delta;
    if (this.autosaveTimer < AUTOSAVE_INTERVAL_MS) return;
    this.autosaveTimer = 0;
    saveGame(this.state);
  }
}
