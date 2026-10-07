// 检查 public/*.html 里内联的 <script> 有没有语法错误。
//
// 为什么需要：
//   内联脚本不经过 Vite 的打包流程，语法错了构建期完全看不出来 ——
//   要等用户在浏览器里打开那个页面才知道。
//   （baker.html 这种纯工具页面最容易中招，而且它一挂就没法切图了。）
//
// 做法：把每个内联 script 抽出来写成临时 .mjs，用 node --check 解析一遍。
// 只检查语法，不执行 —— 所以 document / canvas 这些不存在也没关系。

import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// 找所有 html：public/ 下的，以及根目录的
const htmlFiles = [];
for (const dir of ['public', '.']) {
  const full = join(ROOT, dir);
  let names = [];
  try {
    names = readdirSync(full);
  } catch {
    continue;
  }
  for (const n of names) {
    if (n.endsWith('.html')) htmlFiles.push(join(full, n));
  }
}

const problems = [];
const tmp = mkdtempSync(join(tmpdir(), 'htmlcheck-'));

try {
  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf8');
    const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');

    // 只取没有 src 属性的 <script>（内联的）
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    let i = 0;

    while ((m = re.exec(html))) {
      const code = m[1];
      if (!code.trim()) continue;

      // 定位行号：script 内容起始处在整个 html 的第几行
      const startLine = html.slice(0, m.index).split('\n').length;

      const tmpFile = join(tmp, `${rel.replace(/[\\/.]/g, '_')}_${i}.mjs`);
      writeFileSync(tmpFile, code);

      try {
        execFileSync(process.execPath, ['--check', tmpFile], { stdio: 'pipe' });
      } catch (e) {
        const out = String(e.stderr || e.stdout || e.message);
        // node --check 的报错里带行号（相对于临时文件），换算成 html 里的行号
        const lineMatch = out.match(/:(\d+)\b/);
        const inHtml = lineMatch ? startLine + Number(lineMatch[1]) - 1 : startLine;
        const firstLine = out.split('\n').find((l) => l.includes('Error')) || '语法错误';
        problems.push(`${rel}:${inHtml}  ${firstLine.trim()}`);
      }
      i++;
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log('\n[内联脚本语法] public/*.html 与 index.html');

if (problems.length === 0) {
  console.log(`  PASS  检查了 ${htmlFiles.length} 个 html，内联脚本语法都正常`);
} else {
  for (const p of problems) console.log(`  FAIL  ${p}`);
}

console.log(`\n结果：${problems.length === 0 ? 1 : 0} 通过 / ${problems.length} 失败\n`);
process.exit(problems.length === 0 ? 0 : 1);
