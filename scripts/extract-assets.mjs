// 从正版星露谷里解包素材 PNG。
//
// ★ 只读游戏目录，不改动它。输出到 public/assets/。
//   想撤销：删掉 public/assets/ 里的 png 就行，游戏本体完全不受影响。
//
// 用法:
//   node scripts/extract-assets.mjs                  # 自动找游戏目录
//   node scripts/extract-assets.mjs "D:/某个路径"     # 手动指定
//
// 原理：星露谷的素材是 .xnb（编译过的压缩二进制，用 LZX 算法），
// 不能直接当图片用。这里用纯 JS 的 xnb 库解压成 PNG。

import { unpackToFiles } from 'xnb';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// ★ 输出到 personal/ 而不是 public/assets/ ——
//   Vite 只复制 public/，所以放在这里的素材【不可能】混进干净版构建产物。
//   这是版权防线，不是随手选的路径。
const OUT = join(ROOT, 'personal');

// 要解包的素材：游戏内路径 -> 输出文件名
const ASSETS = [
  ['Maps/spring_outdoorsTileSheet', 'outdoors.png', '户外地形图集（草地/水/路/树/栅栏）'],
  ['TileSheets/crops', 'crops.png', '作物生长阶段'],
  ['TerrainFeatures/tree1_spring', 'tree.png', '树（春季）'],
  ['TerrainFeatures/hoeDirt', 'hoedirt.png', '耕地（锄过的土）'],
  ['LooseSprites/Cursors', 'cursors.png', '杂物大杂烩（工具/物品/UI）'],
  ['TileSheets/bobbers', 'bobbers.png', '钓鱼浮标'],
  ['Buildings/houses', 'houses.png', '农舍'],
  ['Buildings/Shipping Bin', 'shippingbin.png', '出货箱'],
  ['Characters/Abigail', 'character.png', '角色行走图（4 方向 x 14 行，一帧 16x32）'],
];

const GAME_CANDIDATES = [
  'D:/Steam/steamapps/common/Stardew Valley',
  'C:/Program Files (x86)/Steam/steamapps/common/Stardew Valley',
  'C:/Program Files/Steam/steamapps/common/Stardew Valley',
  'C:/GOG Games/Stardew Valley',
  'C:/Program Files (x86)/GOG Galaxy/Games/Stardew Valley',
];

function findGame(argPath) {
  const candidates = argPath ? [argPath, ...GAME_CANDIDATES] : GAME_CANDIDATES;
  for (const p of candidates) {
    if (existsSync(join(p, 'Content')) && existsSync(join(p, 'Stardew Valley.exe'))) return p;
  }
  return null;
}

const game = findGame(process.argv[2]);
if (!game) {
  console.error('找不到星露谷游戏目录。请手动指定，例如：');
  console.error('  node scripts/extract-assets.mjs "D:/Steam/steamapps/common/Stardew Valley"');
  process.exit(1);
}

console.log(`游戏目录: ${game}`);
console.log(`输出到:   ${OUT}\n`);

await mkdir(OUT, { recursive: true });

// PNG 尺寸（IHDR 在第 16 字节起，宽高各 4 字节大端）
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

let ok = 0;
let failed = 0;

for (const [src, outName, desc] of ASSETS) {
  const full = join(game, 'Content', src + '.xnb');
  if (!existsSync(full)) {
    console.log(`  跳过  ${src}  （文件不存在）`);
    failed++;
    continue;
  }

  try {
    const buf = await readFile(full);
    const outputs = await unpackToFiles(buf, { fileName: basename(src) + '.xnb' });

    const png = outputs.find((o) => o.extension === 'png');
    if (!png) {
      console.log(`  失败  ${src}  （没解出 png）`);
      failed++;
      continue;
    }

    // data 是 Blob（浏览器兼容 API），Node 里也能用
    const bytes = Buffer.from(await png.data.arrayBuffer());
    await writeFile(join(OUT, outName), bytes);

    const s = pngSize(bytes);
    console.log(
      `  完成  ${outName.padEnd(18)} ${String(bytes.length).padStart(8)} 字节  ${s ? s[0] + 'x' + s[1] : ''}  ${desc}`
    );
    ok++;
  } catch (e) {
    console.log(`  失败  ${src}  ${e.message}`);
    failed++;
  }
}

console.log(`\n解出 ${ok} 个，失败/跳过 ${failed} 个。`);
console.log('素材只放本地自用，别提交到任何公开仓库。');
process.exit(failed > 0 ? 1 : 0);
