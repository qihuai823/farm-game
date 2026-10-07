// 核心逻辑测试。跑 `npm test`。
// 覆盖：生长数学 / 浇水规则 / 多年生回退 / 存档往返 / 时间换算 / 地图地标 / 商店经济 / 内容表合法性
//
// 手法说明：用动态 import 加载真实源码，不复制逻辑。
// localStorage 用 stub 顶掉，所以能在 Node 里直接测存档。

globalThis.localStorage = {
  _d: {},
  getItem(k) {
    return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null;
  },
  setItem(k, v) {
    this._d[k] = String(v);
  },
  removeItem(k) {
    delete this._d[k];
  },
};

const { CROPS, CROP_LIST, FISH, FISH_LIST, ITEMS } = await import('../src/data/gameData.js');
const { FarmGrid } = await import('../src/systems/FarmGrid.js');
const { createNewState } = await import('../src/systems/state.js');
const { saveGame, loadGame, clearSave } = await import('../src/systems/Save.js');
const { formatClock, nightAlpha, nextDay, advanceClock } = await import('../src/systems/Time.js');
const { buySeed, sellValue, itemCount, sellAll, cropEconomics } = await import('../src/systems/Shop.js');
const {
  makeRng,
  pickFish,
  castDistance,
  rollBiteDelay,
  simulate,
  perfectStrategy,
  createMinigame,
  stepMinigame,
  barHeightFor,
} = await import('../src/systems/Fishing.js');
const { buildMap, LANDMARKS } = await import('../src/mapData.js');
const { ENERGY_MAX, START_GOLD, DAY_START, DAY_END, START_SEEDS, FISHING, MAX_FRAME_MS, MINUTES_PER_REAL_SECOND } = await import(
  '../src/config.js'
);

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
};

console.log('\n[1] 初始状态');
const s = createNewState();
ok('金币 = 500', s.gold === START_GOLD);
ok('体力满', s.energy === ENERGY_MAX);
ok('开局有 15 个防风草种子', s.inventory.seeds.parsnip === START_SEEDS.parsnip);
ok('时间从 06:00 开始', s.time.minute === DAY_START);
ok('没有季节字段', s.time.season === undefined);
ok('农田为空', s.farm.tiles.size === 0);

console.log('\n[2] 防风草生长（需要浇水 4 天）');
const def = CROPS.parsnip;
ok('growthDays = 4', def.growthDays === 4);
s.farm.till(10, 30);
s.farm.plant(10, 30, 'parsnip');
ok('锄地后 tilled', s.farm.get(10, 30).tilled === true);
ok('播种后 days = 0', s.farm.get(10, 30).crop.days === 0);
ok('刚种下不成熟', s.farm.isMature(10, 30) === false);
ok('未成熟时收获返回 null', s.farm.harvest(10, 30) === null);

s.farm.advanceDay();
ok('没浇水 → 不生长', s.farm.get(10, 30).crop.days === 0);

for (let i = 1; i <= 4; i++) {
  s.farm.water(10, 30);
  s.farm.advanceDay();
  const d = s.farm.get(10, 30).crop.days;
  ok(`浇水第 ${i} 天 → days = ${i}`, d === i, `实际 ${d}`);
}
ok('过夜后浇水标记被清空', s.farm.get(10, 30).watered === false);
ok('第 4 天成熟', s.farm.isMature(10, 30) === true);

console.log('\n[3] 收获一次性作物');
ok('收获返回 parsnip', s.farm.harvest(10, 30) === 'parsnip');
ok('收获后作物消失', s.farm.get(10, 30).crop === null);
ok('收获后土地仍是耕地', s.farm.get(10, 30).tilled === true);

console.log('\n[4] 多年生作物回退（草莓 8 天成熟 / 4 天复收）');
const straw = CROPS.strawberry;
s.farm.till(11, 30);
s.farm.plant(11, 30, 'strawberry');
for (let i = 0; i < straw.growthDays; i++) {
  s.farm.water(11, 30);
  s.farm.advanceDay();
}
ok('草莓成熟', s.farm.isMature(11, 30) === true);
s.farm.harvest(11, 30);
const after = s.farm.get(11, 30).crop;
ok('复收后作物还在', after !== null);
ok(
  `回退到 ${straw.growthDays - straw.regrowDays} 天`,
  after.days === straw.growthDays - straw.regrowDays,
  `实际 ${after.days}`
);
ok('回退后不再成熟', s.farm.isMature(11, 30) === false);

console.log('\n[5] 存档往返');
s.gold = 1234;
s.energy = 77;
s.time.day = 9;
s.inventory.items.parsnip = 3;
saveGame(s);
const s2 = loadGame();
ok('读档成功', s2 !== null);
ok('金币还原', s2.gold === 1234);
ok('体力还原', s2.energy === 77);
ok('日期还原', s2.time.day === 9);
ok('物品还原', s2.inventory.items.parsnip === 3);
ok('农田格数还原', s2.farm.tiles.size === s.farm.tiles.size, `${s2.farm.tiles.size} vs ${s.farm.tiles.size}`);
ok('农田内容还原', s2.farm.get(11, 30).crop.id === 'strawberry');
ok('玩家位置还原', typeof s2.player.x === 'number' && s2.player.x > 0);
clearSave();
ok('清档后读不到', loadGame() === null);

console.log('\n[6] 时间换算');
ok('360 -> 06:00', formatClock(360) === '06:00', formatClock(360));
ok('720 -> 12:00', formatClock(720) === '12:00', formatClock(720));
ok('1439 -> 23:59', formatClock(1439) === '23:59', formatClock(1439));
ok('1500 -> 01:00 (跨日取模)', formatClock(1500) === '01:00', formatClock(1500));
ok('中午全亮', nightAlpha(720) === 0);
ok('清晨 06:00 最暗', Math.abs(nightAlpha(360) - 0.42) < 1e-9, String(nightAlpha(360)));
ok('02:00 最暗', Math.abs(nightAlpha(DAY_END) - 0.58) < 1e-9, String(nightAlpha(DAY_END)));
ok('白天比夜里亮', nightAlpha(720) < nightAlpha(1400));

const t = { day: 28, minute: DAY_START };
nextDay(t);
ok('天数无上限累加', t.day === 29, String(t.day));
ok('不会凭空创建季节字段', t.season === undefined);

console.log('\n[6b] 时钟推进必须夹住 delta（切标签页回来不能跳时间）');
{
  const clock = { day: 1, minute: DAY_START };
  const before = clock.minute;
  const slept = advanceClock(clock, 16, MINUTES_PER_REAL_SECOND);
  const expected = (16 / 1000) * MINUTES_PER_REAL_SECOND;
  ok('正常一帧（16ms）按比例推进', Math.abs(clock.minute - before - expected) < 1e-9, String(clock.minute - before));
  ok('没到点返回 false', slept === false);
}
{
  // 这是真踩过的 bug：切到别的标签页 30 秒再回来，delta = 30000ms
  const clock = { day: 1, minute: DAY_START };
  const jumped = advanceClock(clock, 30000, MINUTES_PER_REAL_SECOND);
  const advanced = clock.minute - DAY_START;
  const maxAllowed = (MAX_FRAME_MS / 1000) * MINUTES_PER_REAL_SECOND;
  ok(`30 秒的 delta 只推进 ${maxAllowed} 分钟`, Math.abs(advanced - maxAllowed) < 1e-9, `实际推进 ${advanced}`);
  ok('不会因此触发过夜', jumped === false);
}
{
  // 哪怕离开一小时也一样
  const clock = { day: 1, minute: DAY_START };
  advanceClock(clock, 3600000, MINUTES_PER_REAL_SECOND);
  const advanced = clock.minute - DAY_START;
  ok('离开一小时的 delta 也只推进一帧的量', advanced <= (MAX_FRAME_MS / 1000) * MINUTES_PER_REAL_SECOND + 1e-9, String(advanced));
}
{
  // 留 0.05 分钟，一帧（16ms ≈ 0.08 分钟）刚好能推过去
  const clock = { day: 1, minute: DAY_END - 0.05 };
  ok('走到 02:00 时返回 true', advanceClock(clock, 16, MINUTES_PER_REAL_SECOND) === true);
  const clock2 = { day: 1, minute: DAY_END - 1 };
  ok('还差 1 分钟时返回 false', advanceClock(clock2, 16, MINUTES_PER_REAL_SECOND) === false);
}
{
  const clock = { day: 1, minute: DAY_START };
  let frames = 0;
  while (!advanceClock(clock, 16, MINUTES_PER_REAL_SECOND) && frames < 100000) frames++;
  const realSeconds = (frames * 16) / 1000;
  ok(
    '一整天耗时在 3~5 分钟现实时间（放慢一倍后）',
    realSeconds > 180 && realSeconds < 300,
    `实际 ${realSeconds.toFixed(0)} 秒`
  );
}

console.log('\n[7] 内容表合法性（改 crops.json 后靠这段兜住）');
ok('作物数量 = 3', CROP_LIST.length === 3, `实际 ${CROP_LIST.length}`);
const ids = CROP_LIST.map((c) => c.id);
ok('id 不重复', new Set(ids).size === ids.length);
for (const c of CROP_LIST) {
  ok(`${c.name}: 有颜色`, typeof c.color === 'string' && c.color.startsWith('#'));
  ok(`${c.name}: growthDays > 0`, Number.isInteger(c.growthDays) && c.growthDays > 0);
  ok(`${c.name}: 卖价 > 种子价（否则种了亏钱）`, c.sellPrice > c.seedCost, `${c.seedCost} -> ${c.sellPrice}`);
  ok(`${c.name}: regrowDays >= 0`, Number.isInteger(c.regrowDays) && c.regrowDays >= 0);
  if (c.regrowDays > 0) {
    ok(`${c.name}: 复收间隔 < 首次成熟天数`, c.regrowDays < c.growthDays, `${c.regrowDays} vs ${c.growthDays}`);
  }
}
// 经济曲线。注意：不是简单的"越贵越赚"——
// 一次性作物应该日均递增；多年生作物是"慢回本 + 高稳态"，这是设计意图。
const econ = CROP_LIST.map((c) => ({ ...c, ...cropEconomics(c) }));
const oneShot = econ.filter((e) => e.regrowDays === 0).sort((a, b) => a.perDay - b.perDay);
ok(
  '一次性作物日均收益递增：防风草 < 土豆',
  oneShot.length === 2 && oneShot[0].id === 'parsnip' && oneShot[1].id === 'potato',
  oneShot.map((e) => `${e.name} ${e.perDay.toFixed(1)}`).join(' / ')
);

const berry = econ.find((e) => e.id === 'strawberry');
const potato = econ.find((e) => e.id === 'potato');
ok(
  '草莓首次回本慢于土豆（长期投资，不是数值 bug）',
  berry.perDay < potato.perDay,
  `草莓 ${berry.perDay.toFixed(1)} vs 土豆 ${potato.perDay.toFixed(1)}`
);
ok(
  '草莓进入复收稳态后收益最高',
  berry.steadyPerDay > potato.steadyPerDay,
  `草莓 ${berry.steadyPerDay.toFixed(1)} vs 土豆 ${potato.steadyPerDay.toFixed(1)}`
);

console.log('\n[8] 商店经济');
const shopState = { gold: 100, inventory: { seeds: {}, items: {} }, stats: { totalEarned: 0 } };
ok('买 3 个防风草种子（20/个）花 60', buySeed(shopState, 'parsnip', 3) === 3 && shopState.gold === 40);
ok('种子进背包', shopState.inventory.seeds.parsnip === 3);
ok('钱不够时只买得起的数量（40 只够 2 个）', buySeed(shopState, 'parsnip', 5) === 2 && shopState.gold === 0);
ok('一分钱没有时买 0 个', buySeed(shopState, 'parsnip', 1) === 0);
ok('买不存在的作物返回 0', buySeed(shopState, 'nope', 1) === 0);

ok('sellValue 空背包 = 0', sellValue({}) === 0);
ok('sellValue 防风草 ×2 = 70', sellValue({ parsnip: 2 }) === 70, String(sellValue({ parsnip: 2 })));
ok('sellValue 混合计算', sellValue({ parsnip: 1, potato: 1, strawberry: 1 }) === 35 + 80 + 120);
ok('itemCount 求和', itemCount({ parsnip: 2, potato: 3 }) === 5);
ok('未知作物不计价', sellValue({ ghost: 5 }) === 0);

const sellState = {
  gold: 100,
  inventory: { seeds: {}, items: { parsnip: 2, potato: 1 } },
  stats: { totalEarned: 0 },
};
const sold = sellAll(sellState);
ok('卖出件数正确', sold.count === 3);
ok('卖出总额正确', sold.total === 35 * 2 + 80, String(sold.total));
ok('金币增加', sellState.gold === 100 + 150);
ok('背包被清空', itemCount(sellState.inventory.items) === 0);
ok('累计收入记账', sellState.stats.totalEarned === 150);
const soldEmpty = sellAll(sellState);
ok('空背包再卖返回 0', soldEmpty.count === 0 && soldEmpty.total === 0 && sellState.gold === 250);

console.log('\n[9] 地图与交互点');
const { ground, objects } = buildMap();
const blocked = new Set();
for (const o of objects) {
  const tw = o.tw || 1;
  const th = o.th || 1;
  for (let y = o.ty; y < o.ty + th; y++) {
    for (let x = o.tx; x < o.tx + tw; x++) blocked.add(`${x},${y}`);
  }
}
const sp = LANDMARKS.spawn;
ok('出生点没被物件挡住', !blocked.has(`${sp.tx},${sp.ty}`));
ok('出生点不是水', ground[sp.ty][sp.tx] !== 3);
ok('出生点可以锄地', [0, 1, 2].includes(ground[sp.ty][sp.tx]));

for (const [name, lm] of Object.entries(LANDMARKS)) {
  if (name === 'spawn') continue;
  ok(`${name} 是实体（能被面朝触发）`, blocked.has(`${lm.tx},${lm.ty}`), `${lm.tx},${lm.ty} 没被挡住`);
  const below = `${lm.tx},${lm.ty + 1}`;
  ok(`${name} 正下方能站人`, !blocked.has(below), below);
}
// 商店的占位从 LANDMARKS 推出来，不要硬编码坐标 ——
// 之前硬编码过一次，挪了商店位置测试就失效了。
const shopLm = LANDMARKS.shop;
const shopTx = shopLm.tx - 1;
const shopTy = shopLm.ty - 1;
ok(
  '商店占 3x2 格',
  [0, 1, 2].every((dx) => [0, 1].every((dy) => blocked.has(`${shopTx + dx},${shopTy + dy}`))),
  `柜台 ${shopLm.tx},${shopLm.ty} -> 占位 ${shopTx},${shopTy} 起 3x2`
);
ok('商店没压到农田', !blocked.has(`${shopTx},28`));

console.log('\n[10] 鱼类表合法性');
ok('鱼数量 = 4', FISH_LIST.length === 4, `实际 ${FISH_LIST.length}`);
const fishIds = FISH_LIST.map((f) => f.id);
ok('鱼 id 不重复', new Set(fishIds).size === fishIds.length);
ok('鱼和作物 id 不冲突', fishIds.every((id) => !CROPS[id]));
for (const f of FISH_LIST) {
  ok(`${f.name}: difficulty 在 0-100`, f.difficulty >= 0 && f.difficulty <= 100);
  ok(`${f.name}: sellPrice > 0`, f.sellPrice > 0);
  ok(`${f.name}: weight > 0`, f.weight > 0);
  ok(`${f.name}: 有颜色`, typeof f.color === 'string' && f.color.startsWith('#'));
}
// 越难钓越值钱
const byDiff = [...FISH_LIST].sort((a, b) => a.difficulty - b.difficulty);
ok(
  '难度越高越值钱',
  byDiff.every((f, i) => i === 0 || f.sellPrice > byDiff[i - 1].sellPrice),
  byDiff.map((f) => `${f.name} ${f.difficulty}/${f.sellPrice}`).join(' ')
);
// 越难钓越罕见（按难度升序看，权重应该严格递减）
const byWeight = [...FISH_LIST].sort((a, b) => a.difficulty - b.difficulty);
ok(
  '难度越高越罕见',
  byWeight.every((f, i) => i === 0 || f.weight < byWeight[i - 1].weight),
  byWeight.map((f) => `${f.name} d${f.difficulty}/w${f.weight}`).join(' ')
);
ok('ITEMS 合并了作物和鱼', Object.keys(ITEMS).length === CROP_LIST.length + FISH_LIST.length);
ok('鱼能卖钱', sellValue({ carp: 2 }) === 60, String(sellValue({ carp: 2 })));
ok('作物和鱼混着卖', sellValue({ parsnip: 1, carp: 1 }) === 35 + 30);

console.log('\n[11] 钓鱼小游戏可玩性（模拟 200 局）');
const N = 200;
const never = () => false;
const perfectRates = [];
const times = [];
for (const f of FISH_LIST) {
  let win = 0;
  let tsum = 0;
  for (let s = 1; s <= N; s++) {
    const r = simulate(f, perfectStrategy, makeRng(s * 7919));
    if (r.success) {
      win++;
      tsum += r.time;
    }
  }
  let lazy = 0;
  for (let s = 1; s <= N; s++) {
    if (simulate(f, never, makeRng(s * 7919)).success) lazy++;
  }
  const rate = win / N;
  const lazyRate = lazy / N;
  perfectRates.push(rate);
  times.push(win ? tsum / win : 0);

  ok(`${f.name}: 完美玩家能钓上来（>=90%）`, rate >= 0.9, `实际 ${(rate * 100).toFixed(0)}%`);
  ok(`${f.name}: 摆烂钓不上来（<=20%）`, lazyRate <= 0.2, `实际 ${(lazyRate * 100).toFixed(0)}%`);
}
ok(
  '难度越高，完美玩家耗时越长',
  times.every((t, i) => i === 0 || t >= times[i - 1] - 0.05),
  times.map((t, i) => `${FISH_LIST[i].name} ${t.toFixed(1)}s`).join(' / ')
);
ok('绿条长度随难度递减', barHeightFor(FISH_LIST[0]) > barHeightFor(FISH_LIST[3]));

// 边界：进度和绿条都不能越界
{
  const m = createMinigame(FISH_LIST[3]);
  const rng = makeRng(12345);
  let okRange = true;
  for (let i = 0; i < 6000 && !m.done; i++) {
    stepMinigame(m, FISH_LIST[3], 1 / 60, i % 2 === 0, rng);
    if (m.progress < 0 || m.progress > 1) okRange = false;
    if (m.barY < 0 || m.barY > 1) okRange = false;
    if (m.fishY < 0 || m.fishY > 1) okRange = false;
  }
  ok('进度 / 绿条 / 鱼 都不越界', okRange);
  ok('结束后 done 标记为 true', m.done === true);
}

console.log('\n[12] 抛竿与咬钩');
ok('蓄力 0 抛 1 格', castDistance(0) === 1);
ok('蓄力 1 抛 4 格', castDistance(1) === 4, String(castDistance(1)));
ok('蓄力越界会被夹住', castDistance(-5) === 1 && castDistance(99) === 4);
ok('蓄力递增不越界', [0, 0.25, 0.5, 0.75, 1].every((p) => castDistance(p) >= 1 && castDistance(p) <= FISHING.maxCastTiles));

{
  const rng = makeRng(42);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < 5000; i++) {
    const d = rollBiteDelay(rng);
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  ok('咬钩等待在 0.8~3.4 秒之间', lo >= 0.8 && hi <= 3.4, `${lo.toFixed(2)}~${hi.toFixed(2)}`);
}

// 加权随机：权重高的鱼应该明显更常出现
{
  const rng = makeRng(2024);
  const counts = {};
  for (let i = 0; i < 20000; i++) {
    const f = pickFish(FISH_LIST, rng);
    counts[f.id] = (counts[f.id] || 0) + 1;
  }
  ok('鲤鱼比鲟鱼常见得多', counts.carp > counts.sturgeon * 3, `鲤鱼 ${counts.carp} vs 鲟鱼 ${counts.sturgeon}`);
  ok('每条鱼都可能被抽到', FISH_LIST.every((f) => counts[f.id] > 0));
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
