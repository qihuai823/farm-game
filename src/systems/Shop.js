import { CROPS, ITEMS } from '../data/gameData.js';

// ============================================================
// 商店经济 —— 纯函数，不碰 Phaser，所以能直接被 Node 测试覆盖
// ============================================================

// 买种子。金币不够就少买几个（返回实际买到的数量）
export function buySeed(state, cropId, count) {
  const def = CROPS[cropId];
  if (!def || count <= 0) return 0;

  let bought = 0;
  for (let i = 0; i < count; i++) {
    if (state.gold < def.seedCost) break;
    state.gold -= def.seedCost;
    state.inventory.seeds[cropId] = (state.inventory.seeds[cropId] || 0) + 1;
    bought += 1;
  }
  return bought;
}

// 一堆东西的总价值。查的是 ITEMS（作物 + 鱼 合并表），所以鱼也能卖。
export function sellValue(items) {
  let total = 0;
  for (const [id, n] of Object.entries(items)) {
    total += (ITEMS[id] ? ITEMS[id].sellPrice : 0) * n;
  }
  return total;
}

export function itemCount(items) {
  return Object.values(items).reduce((a, b) => a + b, 0);
}

// 卖光背包里所有作物。返回 { count, total }
export function sellAll(state) {
  const count = itemCount(state.inventory.items);
  if (count === 0) return { count: 0, total: 0 };

  const total = sellValue(state.inventory.items);
  state.inventory.items = {};
  state.gold += total;
  state.stats.totalEarned += total;
  return { count, total };
}

// 单株作物的经济性。
// 注意 perDay 只算"首次成熟"，多年生作物要看 steadyPerDay（进入复收稳态后的日均）。
// 草莓就是典型：首次回本很慢，但稳态收益最高 —— 这是设计意图，不是数值 bug。
export function cropEconomics(crop) {
  const profit = crop.sellPrice - crop.seedCost;
  const perDay = profit / crop.growthDays;
  const steadyPerDay = crop.regrowDays > 0 ? crop.sellPrice / crop.regrowDays : perDay;
  return { profit, perDay, steadyPerDay };
}
