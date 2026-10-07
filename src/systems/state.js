import { DAY_START, ENERGY_MAX, START_GOLD, START_SEEDS, TILE } from '../config.js';
import { LANDMARKS } from '../mapData.js';
import { FarmGrid } from './FarmGrid.js';

// 游戏的完整状态。所有系统读写的都是这一个对象。
export function createNewState() {
  return {
    time: { day: 1, minute: DAY_START },
    gold: START_GOLD,
    energy: ENERGY_MAX,
    inventory: {
      seeds: { ...START_SEEDS }, // { cropId: 数量 }
      items: {}, // { cropId: 数量 }
    },
    farm: new FarmGrid(),
    player: {
      x: LANDMARKS.spawn.tx * TILE + TILE / 2,
      y: (LANDMARKS.spawn.ty + 1) * TILE,
      facing: 'down',
    },
    stats: { daysPlayed: 1, totalEarned: 0 },
  };
}
