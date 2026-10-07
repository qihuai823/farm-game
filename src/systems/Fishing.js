import { FISH_LIST } from '../data/gameData.js';

// ============================================================
// 钓鱼 —— 纯逻辑，不碰 Phaser
// ============================================================
// 分成两段：
//   抛竿前：掷骰子决定钓到哪条鱼、等多久咬钩
//   拉竿时：一个"绿条追鱼"的小游戏（星露谷那套）
//
// 全部用归一化坐标：0 = 底部，1 = 顶部。
// 因为不依赖任何渲染，所以 `npm test` 能模拟"完美玩家"验证每条鱼都钓得上来。
// ============================================================

// 手感参数 —— 觉得太难或太简单就调这里
// 调完务必跑 `npm test`：里面会模拟"完美玩家"验证每条鱼都钓得上来（成功率应接近 100%）
export const MINIGAME = {
  lift: 3.4, // 按住：向上加速度
  gravity: 2.4, // 松开：向下加速度
  damping: 5.0, // 速度阻尼（越大越"黏"，越好控制）
  gain: 0.34, // 绿条罩住鱼时，每秒涨多少进度
  loss: 0.26, // 没罩住时，每秒掉多少进度
  start: 0.4, // 初始进度
};

// 可复现的伪随机（测试要固定种子）
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

// ---------- 抛竿前 ----------

// 按 weight 加权随机挑一条鱼
export function pickFish(list, rng) {
  const total = list.reduce((a, f) => a + (f.weight || 1), 0);
  let r = rng() * total;
  for (const f of list) {
    r -= f.weight || 1;
    if (r <= 0) return f;
  }
  return list[list.length - 1];
}

// 蓄力 0..1 -> 抛几格（1~4 格）
export function castDistance(power) {
  const p = Math.max(0, Math.min(1, power));
  return 1 + Math.round(p * 3);
}

// 咬钩等待时间（秒）
export function rollBiteDelay(rng) {
  return 0.8 + rng() * 2.6;
}

// ---------- 拉竿小游戏 ----------

// 鱼越难，绿条越短
export function barHeightFor(fish) {
  return 0.34 - fish.difficulty / 650;
}

// 鱼越难，游得越快
export function fishSpeedFor(fish) {
  return 0.3 + fish.difficulty / 300;
}

// 鱼越难，换向越频繁。下限 0.55 是防止高难度鱼"抽搐"到无法跟住
export function fishCalmFor(fish) {
  return Math.max(0.55, 1 - fish.difficulty / 260);
}

export function createMinigame(fish) {
  return {
    fishY: 0.5,
    fishTarget: 0.5,
    fishTimer: 0,
    barY: 0.5,
    barVel: 0,
    barH: barHeightFor(fish),
    progress: MINIGAME.start,
    elapsed: 0,
    done: false,
    success: false,
  };
}

// 推进一帧。dt 单位是秒，holding = 玩家是否按住空格
export function stepMinigame(m, fish, dt, holding, rng) {
  if (m.done) return m;
  m.elapsed += dt;

  // ---- 绿条（玩家控制）----
  const half = m.barH / 2;
  m.barVel += (holding ? MINIGAME.lift : -MINIGAME.gravity) * dt;
  m.barVel -= m.barVel * MINIGAME.damping * dt;
  m.barY += m.barVel * dt;
  if (m.barY < half) {
    m.barY = half;
    m.barVel = 0;
  }
  if (m.barY > 1 - half) {
    m.barY = 1 - half;
    m.barVel = 0;
  }

  // ---- 鱼（随机游走）----
  m.fishTimer -= dt;
  if (m.fishTimer <= 0) {
    m.fishTarget = rng();
    m.fishTimer = (0.45 + rng() * 0.95) * fishCalmFor(fish);
  }
  const speed = fishSpeedFor(fish);
  const diff = m.fishTarget - m.fishY;
  if (Math.abs(diff) > 0.01) m.fishY += Math.sign(diff) * speed * dt;
  m.fishY = Math.max(0, Math.min(1, m.fishY));

  // ---- 进度 ----
  const overlap = Math.abs(m.fishY - m.barY) <= half;
  m.progress += (overlap ? MINIGAME.gain : -MINIGAME.loss) * dt;
  m.progress = Math.max(0, Math.min(1, m.progress));

  if (m.progress >= 1) {
    m.done = true;
    m.success = true;
  } else if (m.progress <= 0) {
    m.done = true;
    m.success = false;
  }

  return m;
}

// 模拟一整局。strategy(m, fish) 返回是否按住 —— 测试用
export function simulate(fish, strategy, rng, dt = 1 / 60, maxSeconds = 90) {
  const m = createMinigame(fish);
  let t = 0;
  while (!m.done && t < maxSeconds) {
    stepMinigame(m, fish, dt, strategy(m, fish), rng);
    t += dt;
  }
  return { success: m.success, time: t, progress: m.progress };
}

// 内置策略：完美玩家（永远朝鱼的方向移动）
export function perfectStrategy(m) {
  const diff = m.fishY - m.barY;
  if (Math.abs(diff) < 0.015) return false; // 已经在中间就别乱动
  return diff > 0;
}

export { FISH_LIST };
