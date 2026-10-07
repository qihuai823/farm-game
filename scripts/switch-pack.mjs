// 切换素材包：把对应的映射表复制成 src/data/pack.map.json
//
// 用法:
//   node scripts/switch-pack.mjs cc0       # CC0 展示版（可以公开）
//   node scripts/switch-pack.mjs stardew   # 星露谷个人版（只能本地自用）
//
// 注意：切到 stardew 之后，要用 npm run dev:personal / build:personal 才能加载素材
// （因为星露谷的素材在 personal/ 里，不在 public/ 下）。

import { copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'src/data/pack.map.json');

const SOURCES = {
  cc0: {
    file: join(ROOT, 'src/data/pack.map.cc0.json'),
    desc: 'CC0 展示版（Ninja Adventure，公共领域，可公开）',
    run: 'npm run dev / build',
  },
  stardew: {
    file: join(ROOT, 'personal/pack.map.stardew.json'),
    desc: '星露谷个人版（版权素材，只能本地自用）',
    run: 'npm run dev:personal / build:personal',
  },
};

const name = (process.argv[2] || '').toLowerCase();
const pick = SOURCES[name];

if (!pick) {
  console.log('用法: node scripts/switch-pack.mjs <cc0|stardew>\n');
  for (const [k, v] of Object.entries(SOURCES)) console.log(`  ${k.padEnd(8)} ${v.desc}`);
  process.exit(1);
}

if (!existsSync(pick.file)) {
  console.error(`找不到映射表：${pick.file}`);
  if (name === 'stardew') {
    console.error('（星露谷素材还没解包？先跑 npm run assets:extract，再用 baker.html 生成映射表）');
  }
  process.exit(1);
}

copyFileSync(pick.file, TARGET);

console.log(`已切到：${pick.desc}`);
console.log(`接下来用：${pick.run}`);
if (name === 'stardew') {
  console.log('\n★ 提醒：星露谷素材是版权资产，产物只能本地自用，不要部署或分享。');
}
