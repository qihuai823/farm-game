// 检查构建产物里有没有版权素材 —— 【只报告，不删除】
//
// 为什么改成只检查：
//   素材已经挪到 personal/（public/ 之外），Vite 只复制 public/，
//   所以干净版构建【结构上】就不可能带上版权素材。删除操作已经不需要了。
//   这个脚本现在的作用变成"验证这条防线还成立"，而不是"事后补救"。
//
// 用法: npm run assets:strip      （其实是 check，名字沿用原来的）

import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const n of names) {
    const p = join(dir, n);
    try {
      if (statSync(p).isDirectory()) walk(p, out);
      else out.push(p);
    } catch {
      /* 忽略 */
    }
  }
  return out;
}

const targets = [join(ROOT, 'dist'), join(ROOT, 'dist-showcase')];
console.log('\n[版权防线检查] 构建产物里有没有 personal/ 的素材');

let anyBad = false;
let anyChecked = false;

for (const t of targets) {
  const name = t.slice(ROOT.length).replace(/^\//, '').replace(/\\/g, '/');
  const files = walk(t);
  if (!files.length) {
    console.log(`  ${name.padEnd(16)} （不存在，跳过）`);
    continue;
  }
  anyChecked = true;

  const bad = files
    .map((f) => f.slice(ROOT.length).replace(/^\//, '').replace(/\\/g, '/'))
    .filter((rel) => rel.includes('/personal/') || rel.startsWith('personal/'));

  if (bad.length === 0) {
    console.log(`  ${name.padEnd(16)} ✓ 干净（${files.length} 个文件）—— 可以公开部署`);
  } else {
    anyBad = true;
    console.log(`  ${name.padEnd(16)} ✗ 有 ${bad.length} 个版权素材 —— 不能公开`);
    for (const b of bad.slice(0, 5)) console.log(`      - ${b}`);
    if (bad.length > 5) console.log(`      …还有 ${bad.length - 5} 个`);
  }
}

if (!anyChecked) {
  console.log('\n  （没有任何构建产物 —— 先跑 npm run build）');
} else if (anyBad) {
  console.log('\n  带 ✗ 的那个是 build:personal 的产物，只能本地自用。');
  console.log('  要公开的话：用 npm run build（默认干净版），或者删掉那个目录重建。');
} else {
  console.log('\n  全部干净，可以安全公开部署。');
}

process.exit(anyBad ? 1 : 0);
