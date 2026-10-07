// ============================================================
// 所有可调参数集中在这里。想改手感、改节奏，只改这个文件。
// ============================================================

// ---- 画面 ----
export const TILE = 16; // 单格像素尺寸（换 32x32 美术包时改这里）
export const ZOOM = 3; // 摄像机放大倍数（改大 = 看得更近）
export const MAP_W = 60; // 地图宽（格）
export const MAP_H = 45; // 地图高（格）
export const PLAYER_SPEED = 110; // 移动速度（像素/秒）

// ---- 时间 ----
// 现实 1 秒 = 游戏多少分钟。星露谷大约 1.4。
// 5 表示一天（06:00→次日02:00，共 1200 游戏分钟）约 4 分钟现实时间。
export const MINUTES_PER_REAL_SECOND = 5;
export const DAY_START = 6 * 60; // 06:00 起床
export const DAY_END = 26 * 60; // 次日 02:00 强制昏倒
// 注意：已经去掉季节系统，天数无限累加

// 单帧最多推进多少毫秒。
// ★ 这个值很关键：切到别的标签页再切回来时，浏览器会给一个巨大的 delta，
//   不夹住的话游戏时间会凭空跳几个小时，直接跳到凌晨 2 点自动过夜。
export const MAX_FRAME_MS = 100;

// ---- 自动存档 ----
// 每隔这么久存一次。防止刷新页面（比如改代码触发热重载）丢掉没存过的进度。
export const AUTOSAVE_INTERVAL_MS = 20000;

// ---- 素材 ----
// 默认【开启】素材模式 —— 因为 CC0 素材（public/cc0/）已经随仓库提供，
// 开箱就是能看的画面，而且零版权风险。
//
// 想强制看纯占位图：VITE_USE_PACK_ASSETS=0
//
// 两套素材包用 npm run pack:cc0 / pack:stardew 切换：
//   cc0      → CC0 展示版，素材在 public/cc0/，可公开部署
//   stardew  → 星露谷个人版，素材在 personal/（public 之外），只能本地自用
//
// 注意 import.meta.env 只在 Vite 里存在，Node 测试脚本里是 undefined ——
// 所以要用 ?. 兜住，否则 npm test 会崩。
export const USE_PACK_TEXTURES = import.meta.env?.VITE_USE_PACK_ASSETS !== '0';

// ---- 体力 ----
export const ENERGY_MAX = 270;
export const ENERGY_COST = { hoe: 2, can: 1, seed: 1, hand: 1, rod: 2 };

// ---- 钓鱼 ----
export const FISHING = {
  chargeRate: 1.1, // 蓄力速度（每秒涨多少）
  maxCastTiles: 4, // 满蓄力能抛几格
  hookWindow: 1.1, // 咬钩后多少秒内必须提竿
};

// ---- 开局 ----
export const START_GOLD = 500;
export const START_SEEDS = { parsnip: 15 };

// ---- 工具 ----
export const TOOLS = [
  { id: 'hoe', name: '锄头' },
  { id: 'can', name: '水壶' },
  { id: 'seed', name: '种子' },
  { id: 'hand', name: '手' },
  { id: 'rod', name: '钓竿' },
];

// 色块占位调色板。阶段 2 换成正式素材后这个对象就可以删了。
export const COLORS = {
  grass: 0x6fae52,
  grassAlt: 0x639e48,
  dirt: 0xb08a5a,
  dirtLine: 0x9a7550,
  water: 0x4a90c4,
  waterHi: 0x74b4dd,
  stone: 0x8d8d8d,
  stoneHi: 0x767676,
  treeCanopy: 0x2f6b32,
  treeLight: 0x3f8442,
  trunk: 0x6b4a2b,
  fence: 0xa8814f,
  wall: 0xe0c9a6,
  roof: 0x9c3f2e,
  door: 0x6b4326,
  window: 0x9fd8e8,
  skin: 0xf0c9a0,
  hair: 0x7a4a2a,
  shirt: 0x3f7fc4,
  pants: 0x3a4a6b,
  eye: 0x2b2b2b,
  soilTilled: 0x8a6642,
  soilWatered: 0x6b4d33,
  cropStem: 0x3f8442,
  bin: 0x8a6a3a,
  binLid: 0xa8825a,
  shopWood: 0x8a6a3a,
  shopWoodDark: 0x6b4f2a,
  shopStripeA: 0xc4453a,
  shopStripeB: 0xf0e6d2,
  shopCounter: 0xa8825a,
  bobber: 0xd9534f,
  bobberTop: 0xf5f5f5,
  fishEye: 0x1f2a1c,
};

// ---- 交互点 ----
// 地标（床/出货箱/商店/出生点）已经搬到 src/mapData.js ——
// 因为它们是【从素材包的尺寸推导】出来的（房子多大，门就在哪），
// 放在这里会和 mapData 形成循环依赖。
//
// 需要用的话：import { LANDMARKS } from './mapData.js'
