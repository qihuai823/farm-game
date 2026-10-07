import { CROPS } from '../data/gameData.js';

// ============================================================
// 农田状态：谁被锄过、谁浇过水、谁种了什么、长了几天
// ============================================================
// 只存"有状态的格子"（稀疏 Map），不是整张地图的二维数组。
// 好处：存档小，遍历快，以后农田扩到几百格也不心疼。
//
// 生长规则（和星露谷一致）：
//   只有【当天浇过水】的作物，在过夜时才会 +1 天。
//   忘记浇水 = 那天白过。这是整个游戏最重要的压力来源。
// ============================================================

export class FarmGrid {
  constructor() {
    this.tiles = new Map(); // "tx,ty" -> { tilled, watered, crop }
  }

  static key(tx, ty) {
    return `${tx},${ty}`;
  }

  get(tx, ty) {
    return this.tiles.get(FarmGrid.key(tx, ty)) || null;
  }

  // 取格子状态，没有就创建一个空的
  touch(tx, ty) {
    const k = FarmGrid.key(tx, ty);
    let t = this.tiles.get(k);
    if (!t) {
      t = { tilled: false, watered: false, crop: null };
      this.tiles.set(k, t);
    }
    return t;
  }

  till(tx, ty) {
    this.touch(tx, ty).tilled = true;
  }

  water(tx, ty) {
    this.touch(tx, ty).watered = true;
  }

  plant(tx, ty, cropId) {
    this.touch(tx, ty).crop = { id: cropId, days: 0 };
  }

  isMature(tx, ty) {
    const t = this.get(tx, ty);
    if (!t || !t.crop) return false;
    const def = CROPS[t.crop.id];
    return !!def && t.crop.days >= def.growthDays;
  }

  // 收获。返回作物 id，没得收返回 null
  harvest(tx, ty) {
    if (!this.isMature(tx, ty)) return null;
    const t = this.get(tx, ty);
    const def = CROPS[t.crop.id];
    const id = t.crop.id;

    if (def.regrowDays > 0) {
      // 多年生：退回一定天数，过几天又能收
      t.crop.days = Math.max(0, def.growthDays - def.regrowDays);
    } else {
      t.crop = null;
    }
    return id;
  }

  // 过夜：浇过水的长一天，然后所有浇水标记清空
  advanceDay() {
    for (const t of this.tiles.values()) {
      if (t.crop && t.watered) {
        const def = CROPS[t.crop.id];
        if (def && t.crop.days < def.growthDays) t.crop.days++;
      }
      t.watered = false;
    }
  }

  toJSON() {
    return Array.from(this.tiles.entries());
  }

  static fromJSON(entries) {
    const grid = new FarmGrid();
    for (const [k, v] of entries || []) grid.tiles.set(k, v);
    return grid;
  }
}
