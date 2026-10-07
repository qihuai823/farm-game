import { MAP_W, MAP_H } from './config.js';
import { tilesOf } from './systems/PackSizes.js';

// ============================================================
// 地图数据
// ============================================================
// 现在是代码生成的，好处是改起来直观（就是一堆 rect）。
//
// 分两层：
//   ground  地面（草地/泥土/水/碎石），走 tilemap，水是唯一有碰撞的地面
//   objects 物件（树/围栏/房子），走独立精灵 + 不可见碰撞盒
//           —— 这样才做得出"人物能走到树后面"的深度排序
//
// ★ 所有尺寸和地标都是从【当前素材包】推出来的（见 systems/PackSizes.js）。
//   换素材包时房子可能从 9x9 变成 5x4，地标会自动跟着走，不用手改坐标。
// ============================================================

export const GROUND = { GRASS: 0, GRASS_ALT: 1, DIRT: 2, WATER: 3, STONE: 4 };
export const SOLID_GROUND = [GROUND.WATER];

// ---- 布局（全部由尺寸推导）----
const HOUSE_SIZE = tilesOf('house');
const HOUSE = { x0: 10, y0: 10, tw: HOUSE_SIZE[0], th: HOUSE_SIZE[1] };

// 房子正门 = 底部中央那一格
const BED = { tx: HOUSE.x0 + Math.floor(HOUSE.tw / 2), ty: HOUSE.y0 + HOUSE.th - 1 };

// 小路和围栏门跟正门对齐
const GATE_X = BED.tx;
const SPAWN = { tx: BED.tx, ty: BED.ty + 1 };

// 出货箱在房子右边，底边和房子底边平齐（记左上角，地标用左下角）
const BIN_SIZE = tilesOf('bin');
const BIN = { tx: HOUSE.x0 + HOUSE.tw + 1, ty: HOUSE.y0 + HOUSE.th - BIN_SIZE[1] };

// 商店再往右，垂直居中于房子（记左上角，地标用底部中央）
const SHOP_SIZE = tilesOf('shop');
const SHOP = { tx: HOUSE.x0 + HOUSE.tw + 2, ty: HOUSE.y0 + Math.floor(HOUSE.th / 2) - 2 };

const FARM = { x0: 9, y0: 22, x1: 23, y1: 34 };
const FENCE = { x0: 8, y0: 21, x1: 24, y1: 35 };

// 玩家面朝这些格子按空格会触发特殊行为
export const LANDMARKS = {
  bed: BED,
  bin: { tx: BIN.tx, ty: BIN.ty + BIN_SIZE[1] - 1 },
  shop: { tx: SHOP.tx + Math.floor(SHOP_SIZE[0] / 2), ty: SHOP.ty + SHOP_SIZE[1] - 1 },
  spawn: SPAWN,
};

function hash(x, y) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

export function buildMap() {
  const ground = [];
  for (let y = 0; y < MAP_H; y++) {
    const row = [];
    for (let x = 0; x < MAP_W; x++) {
      row.push(hash(x, y) % 6 === 0 ? GROUND.GRASS_ALT : GROUND.GRASS);
    }
    ground.push(row);
  }

  const set = (x, y, v) => {
    if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) ground[y][x] = v;
  };
  const rect = (x0, y0, x1, y1, v) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, v);
  };

  // ---- 地形 ----

  // 池塘
  rect(40, 6, 52, 14, GROUND.WATER);
  rect(41, 5, 51, 5, GROUND.WATER);
  rect(41, 15, 51, 15, GROUND.WATER);
  [[40, 6], [40, 14], [52, 6], [52, 14]].forEach(([x, y]) => set(x, y, GROUND.GRASS));

  // 碎石地（阶段 3 这里放矿洞入口）
  rect(30, 30, 36, 36, GROUND.STONE);

  // 农田：泥土
  rect(FARM.x0, FARM.y0, FARM.x1, FARM.y1, GROUND.DIRT);

  // 小路：房门口 -> 穿过农田 -> 往东出图
  rect(GATE_X, HOUSE.y0 + HOUSE.th, GATE_X, FENCE.y0, GROUND.DIRT);
  set(GATE_X, FENCE.y0, GROUND.DIRT); // 上门口
  set(GATE_X, FENCE.y1, GROUND.DIRT); // 下门口
  rect(GATE_X, FENCE.y1 + 1, GATE_X, 41, GROUND.DIRT);
  rect(GATE_X, 41, 55, 41, GROUND.DIRT);

  // ---- 物件 ----

  const objects = [];
  const occupied = new Set();
  const key = (x, y) => `${x},${y}`;
  const reserve = (x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) occupied.add(key(x, y));
  };

  // 房子
  objects.push({ type: 'house', tx: HOUSE.x0, ty: HOUSE.y0, tw: HOUSE.tw, th: HOUSE.th });
  reserve(HOUSE.x0 - 1, HOUSE.y0 - 1, HOUSE.x0 + HOUSE.tw, HOUSE.y0 + HOUSE.th);

  // 出货箱（卖掉所有作物的地方）
  objects.push({ type: 'bin', tx: BIN.tx, ty: BIN.ty, tw: BIN_SIZE[0], th: BIN_SIZE[1] });
  reserve(BIN.tx - 1, BIN.ty - 1, BIN.tx + BIN_SIZE[0], BIN.ty + BIN_SIZE[1]);

  // 种子商店
  objects.push({ type: 'shop', tx: SHOP.tx, ty: SHOP.ty, tw: SHOP_SIZE[0], th: SHOP_SIZE[1] });
  reserve(SHOP.tx - 1, SHOP.ty - 1, SHOP.tx + SHOP_SIZE[0], SHOP.ty + SHOP_SIZE[1]);

  // 农田围栏（上下各留一个门）
  for (let x = FENCE.x0; x <= FENCE.x1; x++) {
    if (x === GATE_X) continue;
    objects.push({ type: 'fence', tx: x, ty: FENCE.y0 });
    objects.push({ type: 'fence', tx: x, ty: FENCE.y1 });
  }
  for (let y = FENCE.y0 + 1; y <= FENCE.y1 - 1; y++) {
    objects.push({ type: 'fence', tx: FENCE.x0, ty: y });
    objects.push({ type: 'fence', tx: FENCE.x1, ty: y });
  }
  reserve(FENCE.x0 - 1, FENCE.y0 - 1, FENCE.x1 + 1, FENCE.y1 + 1);

  // 小路和池塘周围留空，别让树把路堵了
  reserve(GATE_X - 1, 0, GATE_X + 1, MAP_H - 1);
  reserve(0, 40, MAP_W - 1, 42);
  reserve(39, 4, 53, 16);

  // 地图四周两格厚的树林，当天然边界
  for (let x = 0; x < MAP_W; x++) {
    for (const y of [0, 1, MAP_H - 2, MAP_H - 1]) objects.push({ type: 'tree', tx: x, ty: y });
  }
  for (let y = 2; y < MAP_H - 2; y++) {
    for (const x of [0, 1, MAP_W - 2, MAP_W - 1]) objects.push({ type: 'tree', tx: x, ty: y });
  }

  // 随机散落的树
  let placed = 0;
  for (let i = 0; i < 4000 && placed < 90; i++) {
    const x = 3 + (hash(i, 17) % (MAP_W - 6));
    const y = 3 + (hash(29, i) % (MAP_H - 6));
    if (occupied.has(key(x, y))) continue;
    const g = ground[y][x];
    if (g !== GROUND.GRASS && g !== GROUND.GRASS_ALT) continue;
    occupied.add(key(x, y));
    reserve(x - 1, y - 1, x + 1, y + 1); // 树之间留间距，不然会糊成一片
    objects.push({ type: 'tree', tx: x, ty: y });
    placed++;
  }

  return { ground, objects };
}
