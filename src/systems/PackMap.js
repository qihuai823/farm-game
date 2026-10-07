import { CROP_LIST, FISH_LIST } from '../data/gameData.js';

// ============================================================
// 素材映射表：展开 + 校验
// ============================================================
// 契约（public/assets.contract.json）里用的是模式（{crop} / {dir} / ...），
// 映射表（src/data/pack.map.json）里用的是具体 key。
// 这里负责把前者展开成一份"必须提供哪些 key、各多大"的清单，
// 再拿映射表去对 —— 两边跑偏立刻能发现。
//
// 纯函数，不碰 Phaser，所以 Node 测试和浏览器运行时都能用同一份逻辑。

// 展开契约里的模式
export function expandContract(contract) {
  const out = new Map();

  const add = (key, size) => {
    if (out.has(key)) throw new Error(`契约里 ${key} 重复定义`);
    out.set(key, size);
  };

  for (const entry of contract.entries) {
    const key = entry.key;

    if (key.includes('{dir}') || key.includes('{frame}')) {
      for (const dir of entry.dirs) {
        for (const frame of entry.frames) {
          add(key.replace('{dir}', dir).replace('{frame}', String(frame)), entry.size);
        }
      }
    } else if (key.includes('{crop}')) {
      for (const c of CROP_LIST) add(key.replace('{crop}', c.id), entry.size);
    } else if (key.includes('{fish}')) {
      for (const f of FISH_LIST) add(key.replace('{fish}', f.id), entry.size);
    } else {
      add(key, entry.size);
    }
  }

  return out;
}

// 映射表里某个 key 最终会产出多大的贴图
export function cutSize(entry) {
  if (!entry) return null;
  if (entry.out) return [entry.out[0], entry.out[1]];
  if (entry.rect) return [entry.rect[2], entry.rect[3]];
  if (entry.cells && entry.cells.length) {
    return [entry.cells.reduce((a, c) => a + c[2], 0), entry.cells[0][3]];
  }
  return null;
}

// 校验映射表。返回问题列表；空数组 = 没问题。
export function validatePackMap(map, expected) {
  const problems = [];
  const cuts = map.cuts || {};
  const sheets = map.sheets || {};
  const sources = map.sources || {};

  const provided = new Set([...Object.keys(cuts), ...Object.keys(sheets)]);

  // 1. 有没有漏
  for (const [key, want] of expected) {
    if (!provided.has(key)) {
      problems.push({ key, kind: 'missing', want });
      continue;
    }

    const entry = cuts[key] || sheets[key];

    // 2. 图源有没有登记
    if (!sources[entry.source]) {
      problems.push({ key, kind: 'unknown-source', source: entry.source });
    }

    // 3. 尺寸对不对
    const got = cutSize(entry);
    if (!got) {
      problems.push({ key, kind: 'bad-entry' });
    } else if (got[0] !== want[0] || got[1] !== want[1]) {
      problems.push({ key, kind: 'size', got, want });
    }
  }

  // 4. 图集里的格子必须等高，否则 tilemap 用不了
  for (const [key, sheet] of Object.entries(sheets)) {
    const cells = sheet.cells || [];
    if (cells.length === 0) {
      problems.push({ key, kind: 'empty-sheet' });
      continue;
    }
    const h0 = cells[0][3];
    if (cells.some((c) => c[3] !== h0)) {
      problems.push({ key, kind: 'ragged-sheet', detail: '格子高度不一致' });
    }
    if (cells.some((c) => c.length !== 4)) {
      problems.push({ key, kind: 'ragged-sheet', detail: '格子必须是 [x,y,w,h]' });
    }
  }

  // 5. 映射表里有没有多余的（可能是打错字）
  for (const key of provided) {
    if (!expected.has(key)) problems.push({ key, kind: 'unknown-key' });
  }

  return problems;
}

// 把问题列表变成人能看懂的一行行文字
export function describeProblems(problems) {
  return problems.map((p) => {
    if (p.kind === 'missing') return `${p.key}：映射表里没有，需要 ${p.want[0]}x${p.want[1]}`;
    if (p.kind === 'size') return `${p.key}：尺寸不对，映射表产出 ${p.got[0]}x${p.got[1]}，应该是 ${p.want[0]}x${p.want[1]}`;
    if (p.kind === 'unknown-source') return `${p.key}：引用了没登记的图源 "${p.source}"`;
    if (p.kind === 'unknown-key') return `${p.key}：契约里没有这个 key（拼错了？）`;
    if (p.kind === 'empty-sheet') return `${p.key}：图集里一个格子都没有`;
    if (p.kind === 'ragged-sheet') return `${p.key}：${p.detail}`;
    return `${p.key}：条目格式不对`;
  });
}
