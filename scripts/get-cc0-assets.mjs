// 下载 CC0 素材（Ninja Adventure）到 public/cc0/。
//
// ★ 和星露谷素材的关键区别：这些是 CC0（公共领域），
//   可以安全地提交、部署、公开分享。所以放在 public/ 里，跟着构建走。
//
// 来源：https://github.com/pixel-boy/NinjaAdventure
// 授权：CC0-1.0（可商用，无需署名）
//
// 用法: node scripts/get-cc0-assets.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/cc0');
const BASE = 'https://raw.githubusercontent.com/pixel-boy/NinjaAdventure/main';

const FILES = [
  ['content/map/tileset_village_abandoned.png', 'village.png', '村庄地形（草地/泥土/树/房子/围栏）'],
  ['content/map/tileset_floor.png', 'floor.png', '地面自动拼图（草/土/水/雪）'],
  ['content/character/samurai_blue/sprite.png', 'character.png', '角色（4 方向 × 7 帧走路/攻击）'],
  ['content/destroyable/crate.png', 'crate.png', '木箱（当出货箱）'],
];

mkdirSync(OUT, { recursive: true });

console.log('来源: Ninja Adventure (Pixel-Boy + AAA)');
console.log('授权: CC0-1.0 —— 公共领域，可商用，无需署名，可安全公开\n');

let ok = 0;
for (const [src, name, desc] of FILES) {
  try {
    const r = await fetch(`${BASE}/${src}`);
    if (!r.ok) {
      console.log(`  失败  ${name.padEnd(16)} HTTP ${r.status}`);
      continue;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    writeFileSync(join(OUT, name), buf);
    console.log(`  完成  ${name.padEnd(16)} ${String(buf.length).padStart(7)} 字节  ${desc}`);
    ok++;
  } catch (e) {
    console.log(`  失败  ${name.padEnd(16)} ${e.message}`);
  }
}

console.log(`\n解出 ${ok}/${FILES.length} 个到 public/cc0/`);
console.log('这些是 CC0 素材，可以直接提交和公开部署。');
