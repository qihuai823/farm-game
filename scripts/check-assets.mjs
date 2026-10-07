// 贴图契约校验。
//
// 干四件事：
//   1. 用假的 graphics 对象跑一遍真实的 buildTextures()，拿到代码实际会生成哪些贴图
//      —— 不需要 Phaser，因为 textures.js 只用到了 graphics 的几个画图方法
//   2. 把契约里的模式展开，和代码生成的清单双向对比（防止代码和契约跑偏）
//   3. 如果 src/data/pack.map.json 有内容，校验它是否完整、尺寸对不对
//   4. 生成 public/pack.keys.json（给切图工具用）

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const contract = read('public/assets.contract.json');
const packMap = read('src/data/pack.map.json');
const crops = read('src/data/crops.json').crops;
const fishes = read('src/data/fish.json').fish;

const { expandContract, validatePackMap, describeProblems } = await import('../src/systems/PackMap.js');

let problems = 0;
const fail = (msg) => {
  console.log(`  FAIL  ${msg}`);
  problems++;
};

// ---------- 1. 跑真实代码，记录它生成了什么 ----------

const generated = [];

function stubGraphics() {
  let stub;
  stub = new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === 'generateTexture') {
          return (key, w, h) => {
            generated.push({ key, w, h });
            return stub;
          };
        }
        if (prop === 'destroy') return () => {};
        return () => stub;
      },
    }
  );
  return stub;
}

const { buildTextures } = await import('../src/textures.js');
buildTextures({
  make: { graphics: () => stubGraphics() },
  textures: { exists: () => false }, // 让占位图全部生成出来，才能和契约完整比对
});

const actual = new Map(generated.map((g) => [g.key, [g.w, g.h]]));

// ---------- 2. 契约 vs 代码（双向） ----------

console.log('\n[贴图契约] 代码生成的占位图 vs public/assets.contract.json');

let contractExpected;
try {
  contractExpected = expandContract(contract);
} catch (e) {
  fail(`契约展开失败：${e.message}`);
  contractExpected = new Map();
}

for (const [key, size] of contractExpected) {
  const got = actual.get(key);
  if (!got) {
    fail(`契约里有 ${key}，但代码没生成`);
    continue;
  }
  if (got[0] !== size[0] || got[1] !== size[1]) {
    fail(`${key} 尺寸不符：契约 ${size[0]}x${size[1]}，代码 ${got[0]}x${got[1]}`);
  }
}
for (const [key, [gw, gh]] of actual) {
  if (!contractExpected.has(key)) fail(`代码生成了 ${key} (${gw}x${gh})，但契约里没有登记`);
}

// ---------- 3. 映射表（按当前素材包的尺寸校验） ----------

// ★ 素材包可以用 sizes 覆盖默认尺寸。
//   契约里的尺寸是【默认素材包】的；不同素材包的物件尺寸天生不一样
//   （星露谷房子 144x144，CC0 的只有 48x80），所以校验要按当前包来。
const overrides = packMap.sizes || {};
const packExpected = new Map();
const changed = [];
for (const [key, size] of contractExpected) {
  let out = size;
  for (const [cat, catSize] of Object.entries(overrides)) {
    if (key === cat || key.startsWith(cat + '-')) {
      out = catSize;
      if (size[0] !== catSize[0] || size[1] !== catSize[1]) changed.push(`${key}→${catSize[0]}x${catSize[1]}`);
      break;
    }
  }
  packExpected.set(key, out);
}

const cutCount = Object.keys(packMap.cuts || {}).length;
const sheetCount = Object.keys(packMap.sheets || {}).length;

console.log('\n[素材映射表] src/data/pack.map.json');
if (changed.length) console.log(`  当前素材包覆盖了 ${changed.length} 个尺寸：${changed.slice(0, 4).join(' ')}${changed.length > 4 ? ' …' : ''}`);

if (cutCount + sheetCount === 0) {
  console.log('  跳过 —— 空表（全部走占位图）');
} else {
  const issues = validatePackMap(packMap, packExpected);
  if (issues.length === 0) {
    console.log(`  PASS  已切 ${cutCount + sheetCount} 个 key，全部对得上`);
  } else {
    for (const line of describeProblems(issues).slice(0, 40)) fail(line);
    if (issues.length > 40) console.log(`  …还有 ${issues.length - 40} 处`);
  }
}

// ---------- 4. 给切图工具生成清单 ----------

const metaByKey = new Map();
for (const entry of contract.entries) {
  const k = entry.key;
  const meta = { kind: entry.kind || 'cut', desc: entry.desc || '', packHint: entry.packHint || '', entryKey: entry.key };
  const push = (kk) => metaByKey.set(kk, meta);
  if (k.includes('{dir}') || k.includes('{frame}')) {
    for (const d of entry.dirs) for (const f of entry.frames) push(k.replace('{dir}', d).replace('{frame}', String(f)));
  } else if (k.includes('{crop}')) {
    for (const c of crops) push(k.replace('{crop}', c.id));
  } else if (k.includes('{fish}')) {
    for (const f of fishes) push(k.replace('{fish}', f.id));
  } else {
    push(k);
  }
}

writeFileSync(
  join(ROOT, 'public/pack.keys.json'),
  JSON.stringify(
    {
      _note: '由 scripts/check-assets.mjs 自动生成，别手改。public/baker.html 读它来列清单。',
      keys: [...packExpected.entries()].map(([key, size]) => ({
        key,
        size,
        ...(metaByKey.get(key) || { kind: 'cut', desc: '', packHint: '', entryKey: key }),
      })),
    },
    null,
    2
  ) + '\n'
);

// ---------- 5. 采购清单 ----------

const byEntry = new Map();
for (const entry of contract.entries) {
  const n = entry.key.includes('{')
    ? [...packExpected.keys()].filter((k) => k.startsWith(entry.key.split('{')[0])).length
    : 1;
  byEntry.set(entry.key, { entry, count: n });
}

console.log('\n  当前素材包需要提供的贴图：');
for (const [id, v] of byEntry) {
  const cat = Object.keys(overrides).find((c) => id === c || id.startsWith(c + '-') || id.startsWith(c + '{'));
  const [w, h] = cat ? overrides[cat] : v.entry.size;
  const n = v.count > 1 ? ` ×${v.count}` : '';
  const mark = cat ? ' ★' : '';
  console.log(`    ${id.padEnd(22)}${String(w).padStart(3)}x${String(h).padEnd(3)}${n}${mark}`);
}
console.log(`    共 ${packExpected.size} 张（★ = 尺寸被当前素材包覆盖）`);

console.log(`\n结果：${problems === 0 ? 1 : 0} 通过 / ${problems} 失败\n`);
process.exit(problems === 0 ? 0 : 1);
