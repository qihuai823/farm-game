import { TILE } from '../config.js';
import packMap from '../data/pack.map.json' with { type: 'json' };

// ============================================================
// 当前生效的物件尺寸
// ============================================================
// 为什么尺寸要跟着素材包走：
//
//   不同素材包的物件尺寸天生不一样。星露谷的房子是 144x144、树是 32x96；
//   CC0 的 Ninja Adventure 房子只有 80x64、树 32x48。
//
//   靠缩放素材去适配是行不通的 —— 像素画非整数缩放会糊，整数缩放又往往凑不上。
//   所以正确做法是让【几何跟着素材包走】：换包就换尺寸。
//
// 素材包在 src/data/pack.map.json 里用 sizes 覆盖，没写的用默认值。

// 默认尺寸（= 代码生成的占位图，也是星露谷那套）
export const DEFAULT_SIZES = {
  player: [16, 32],
  tree: [32, 96],
  house: [144, 144],
  bin: [32, 32],
  shop: [48, 32],
};

export const SIZES = { ...DEFAULT_SIZES, ...(packMap.sizes || {}) };

// 尺寸换算成格数
export function tilesOf(key) {
  const s = SIZES[key] || DEFAULT_SIZES[key];
  return [Math.round(s[0] / TILE), Math.round(s[1] / TILE)];
}

// 物件贴图相对"底部中心"的碰撞盒（按贴图尺寸的比例算，换尺寸不用改代码）
export function bodyOf(key) {
  const [w, h] = SIZES[key] || DEFAULT_SIZES[key];
  if (key === 'tree') {
    // 只有树干挡路 —— 树冠可以走过去
    const bw = Math.max(10, Math.round(w * 0.375));
    const bh = Math.max(10, Math.round(h * 0.125));
    return { w: bw, h: bh, dx: 0, dy: 0 };
  }
  if (key === 'bin') {
    return { w: Math.round(w * 0.94), h: Math.round(h * 0.81), dx: 0, dy: -Math.round(h * 0.09) };
  }
  return { w: 'full', h: 'full', dx: 0, dy: 0 };
}

// 玩家碰撞盒（只占脚部）
export function playerBody() {
  const [w, h] = SIZES.player;
  const bw = Math.min(12, w);
  const bh = 8;
  return { w: bw, h: bh, ox: Math.round((w - bw) / 2), oy: h - bh };
}
