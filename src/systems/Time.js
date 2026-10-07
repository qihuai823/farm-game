import { DAY_END, MAX_FRAME_MS } from '../config.js';

// ============================================================
// 时间
// ============================================================
// minute 是"从 00:00 起算的分钟数"，范围 360(06:00) ~ 1560(次日 02:00)。
// 所以 24:00 之后 minute 会 > 1440，格式化时要取模。
//
// 没有季节系统 —— 天数无限累加。
// ============================================================

// 推进时钟。返回 true 表示到点了，该睡觉了。
//
// ★ deltaMs 必须夹住上限。
//   浏览器在标签页被切走时会暂停渲染，切回来的那一帧会给出一个巨大的 delta
//   （等于你离开的全部时长）。不夹住的话，你去看一眼聊天再回来，
//   游戏时间就凭空跳了几个小时，很可能一步跨过凌晨 2 点触发强制过夜 ——
//   玩家的体感就是"作物自己长熟了"。
export function advanceClock(time, deltaMs, minutesPerSecond) {
  const dt = Math.min(deltaMs, MAX_FRAME_MS) / 1000;
  time.minute += dt * minutesPerSecond;
  return time.minute >= DAY_END;
}

export function formatClock(minute) {
  const m = Math.floor(minute) % 1440;
  const h = Math.floor(m / 60);
  const mm = Math.floor(m % 60);
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// 昼夜遮罩透明度：0 = 全亮，越大越暗
export function nightAlpha(minute) {
  const h = minute / 60;
  const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));

  if (h >= 8 && h < 17) return 0; // 白天全亮
  if (h >= 6 && h < 8) return lerp(0.42, 0, (h - 6) / 2); // 清晨渐亮
  if (h >= 17 && h < 20) return lerp(0, 0.34, (h - 17) / 3); // 黄昏渐暗
  if (h >= 20 && h < 24) return lerp(0.34, 0.5, (h - 20) / 4); // 入夜
  return lerp(0.5, 0.58, Math.min(1, (h - 24) / 2)); // 深夜 00:00-02:00
}

// 推进一天
export function nextDay(time) {
  time.day += 1;
}
