import { FarmGrid } from './FarmGrid.js';

// ============================================================
// 存档：localStorage，单存档位
// ============================================================
// 什么时候存：过夜时、手动按 F5 时。
// 什么时候读：进入游戏时（有存档就直接续上）。
//
// 注意：存档只存"状态"，不存贴图和地图 —— 地图是代码生成的，
// 换素材、改地图都不会让老存档失效。
// ============================================================

const KEY = 'farm-game-save-v1';
// 存档结构版本。改动 state 结构时 +1，老存档会被丢弃（而不是读出一堆 undefined）
// v1 -> v2：去掉季节系统，作物表从 10 种改为 3 种
const VERSION = 2;

export function saveGame(state) {
  try {
    const data = {
      version: VERSION,
      time: state.time,
      gold: state.gold,
      energy: state.energy,
      inventory: state.inventory,
      farm: state.farm.toJSON(),
      player: state.player,
      stats: state.stats,
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('[存档] 写入失败', e);
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d.version !== VERSION) return null;
    return {
      time: d.time,
      gold: d.gold,
      energy: d.energy,
      inventory: d.inventory,
      farm: FarmGrid.fromJSON(d.farm),
      player: d.player,
      stats: d.stats,
    };
  } catch (e) {
    console.warn('[存档] 读取失败', e);
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {
    /* 忽略 */
  }
}
