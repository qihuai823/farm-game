// 静态检查：有没有"用了某个名字，但没 import"。
//
// 为什么需要它：
//   逻辑测试（logic-test.mjs）只能跑不依赖 Phaser 的模块。
//   Player.js 和所有 scenes/*.js 都继承 Phaser 的类，Node 里跑不了，
//   所以它们里面漏 import 是测试的盲区 —— 而这类错误会在渲染循环里每帧抛异常，
//   直接把游戏卡死成黑屏（真踩过：Player.js 用了 TILE 但没 import）。
//
// 这个脚本不依赖任何库：扒出各文件导出的名字，再逐文件扫正文里出现的裸标识符。

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

// 把注释和字符串抹成空格，但保留换行 —— 这样行号不会错位
function strip(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, (m) => "'" + ' '.repeat(Math.max(0, m.length - 2)) + "'")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, (m) => '"' + ' '.repeat(Math.max(0, m.length - 2)) + '"')
    .replace(/`(?:[^`\\]|\\.)*`/g, (m) => '`' + ' '.repeat(Math.max(0, m.length - 2)) + '`');
}

const files = walk(SRC);
const info = new Map();

for (const f of files) {
  const code = strip(readFileSync(f, 'utf8'));
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  const imports = new Set();
  const decls = new Set();
  let m;

  const impRe = /import\s+([\s\S]*?)\s+from\s*['"][^'"]+['"]/g;
  while ((m = impRe.exec(code))) {
    const clause = m[1];
    const braces = clause.match(/\{([\s\S]*?)\}/);
    if (braces) {
      for (const part of braces[1].split(',')) {
        const t = part.trim();
        if (!t) continue;
        const parts = t.split(/\s+as\s+/);
        imports.add(parts[parts.length - 1].trim());
      }
    }
    const def = clause.replace(/\{[\s\S]*?\}/, '').replace(/,/g, '').trim();
    if (def && !def.startsWith('*')) imports.add(def);
  }

  // 扫正文时要把 import 语句本身抹掉。
  // 否则 `import { sellAll as sellAllItems }` 里的 sellAll 会被当成"用了但没导入"。
  const body = code
    .replace(/import\s+[\s\S]*?\s+from\s*['"][^'"]+['"]\s*;?/g, (s) => s.replace(/[^\n]/g, ' '))
    .replace(/^\s*import\s*['"][^'"]+['"]\s*;?/gm, (s) => s.replace(/[^\n]/g, ' '));

  const declRe = /\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = declRe.exec(code))) decls.add(m[1]);

  const destrRe = /\b(?:const|let|var)\s*\{([^}]*)\}/g;
  while ((m = destrRe.exec(code))) {
    for (const p of m[1].split(',')) {
      const t = p.split(':').pop().split('=')[0].trim();
      if (t) decls.add(t);
    }
  }

  info.set(f, { imports, decls, code, body, rel });
}

// 收集所有跨文件导出的名字 -> 谁导出的
const exportOwners = new Map();
const addOwner = (name, rel) => {
  if (!exportOwners.has(name)) exportOwners.set(name, new Set());
  exportOwners.get(name).add(rel);
};
for (const v of info.values()) {
  let m;
  const re1 = /export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = re1.exec(v.code))) addOwner(m[1], v.rel);
  const re2 = /export\s*\{([^}]*)\}/g;
  while ((m = re2.exec(v.code))) {
    for (const p of m[1].split(',')) {
      const t = p.trim().split(/\s+as\s+/).pop().trim();
      if (t) addOwner(t, v.rel);
    }
  }
}

const problems = [];
for (const v of info.values()) {
  for (const [name, owners] of exportOwners) {
    if (v.imports.has(name) || v.decls.has(name) || owners.has(v.rel)) continue;

    const useRe = new RegExp('(?<![\\w$.])' + name + '(?![\\w$])', 'g');
    let mm;
    while ((mm = useRe.exec(v.body))) {
      // 后面跟冒号的当成对象 key，跳过
      if (/^\s*:/.test(v.body.slice(mm.index + name.length))) continue;
      const line = v.body.slice(0, mm.index).split('\n').length;
      problems.push({ rel: v.rel, line, name, owners: [...owners].join(', ') });
      break;
    }
  }
}

console.log('\n[静态检查] 跨模块引用是否都 import 了');
if (problems.length === 0) {
  console.log(`  PASS  扫了 ${info.size} 个文件，没有漏 import`);
} else {
  for (const p of problems) {
    console.log(`  FAIL  ${p.rel}:${p.line}  用了 ${p.name}，但没 import（它由 ${p.owners} 导出）`);
  }
}

console.log(`\n结果：${problems.length === 0 ? 1 : 0} 通过 / ${problems.length} 失败\n`);
process.exit(problems.length === 0 ? 0 : 1);
