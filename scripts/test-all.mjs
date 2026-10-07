// 跑完所有检查，不管前面有没有失败。
//
// 为什么需要：原来 package.json 里是用 && 串起来的，
// 素材校验一旦失败（比如映射表还没填完），后面的逻辑测试就根本不会跑 ——
// 一次只看到一个失败，排查效率极低。
//
// 这个 runner 让四个检查都跑完，最后汇总。

import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const CHECKS = [
  ['静态引用检查', 'check-imports.mjs'],
  ['内联脚本语法', 'check-html.mjs'],
  ['贴图契约 + 素材映射表', 'check-assets.mjs'],
  ['逻辑断言', 'logic-test.mjs'],
];

const failed = [];

for (const [name, file] of CHECKS) {
  const r = spawnSync(process.execPath, [join(HERE, file)], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(name);
}

console.log('\n' + '='.repeat(52));
if (failed.length === 0) {
  console.log(`全部 ${CHECKS.length} 项检查通过`);
} else {
  console.log(`${CHECKS.length} 项里有 ${failed.length} 项没通过：`);
  for (const n of failed) console.log(`  ✗ ${n}`);
}
console.log('='.repeat(52) + '\n');

process.exit(failed.length ? 1 : 0);
