import { TILE, COLORS } from './config.js';
import { CROP_LIST, FISH_LIST, hexToInt } from './data/gameData.js';

// ============================================================
// 贴图层 —— 全工程唯一需要"换掉"的文件
// ============================================================
//
// 现在用纯色块画占位图，好处是：不用等美术，逻辑先跑通。
//
// ★ 贴图 key 就是接口。整个工程只会通过下面这些 key 引用图片：
//
//     'tiles'                地面图集，一行排开，每格 TILE x TILE
//                            索引 0=草地 1=草地(深) 2=泥土 3=水 4=碎石
//     'tree'                 32 x 96（2x6 格），锚点在底部中心
//     'fence'                16 x 16，锚点在底部中心
//     'bin'                  32 x 32（2x2 格），锚点在底部中心
//     'house'                144 x 144（9x9 格），锚点在底部中心
//     'player-<dir>-<n>'     dir = down|up|left|right, n = 0|1
//                            16 x 32，锚点在底部中心
//     'soil-tilled' / 'soil-watered'   16 x 16，耕地
//     'crop-0' .. 'crop-3'   16 x 16，通用幼苗生长阶段，锚点在底部中心
//     'crop-mature-<id>'     16 x 16，每种作物的成熟形态（id 来自 crops.json）
//     'fish-<id>'            16 x 16，鱼图标（id 来自 fish.json）
//     'bobber'               8 x 8，钓竿浮标
//
// 阶段 2 接星露谷素材（或任何正式素材包）时，只需要：
//   1. 把 buildTextures 换成 scene.load.image / load.spritesheet
//   2. 保证 key 和尺寸对得上（或者改 config.js 里的 TILE）
//   3. 其他所有文件 —— 一行都不用动。
//
// ============================================================

function gfx(scene) {
  const g = scene.make.graphics({ x: 0, y: 0, add: false });

  // ★ 占位图不许覆盖已有贴图。
  //   这样"素材模式"下，映射表里切好的 key 用真素材，
  //   还没切到的 key 才回退成色块 —— 逐个 key 回退，而不是全有全无。
  //   否则映射表缺一个 key，整个游戏就全变回色块，看不到进展。
  const orig = g.generateTexture.bind(g);
  g.generateTexture = (key, w, h) => {
    if (scene.textures && scene.textures.exists && scene.textures.exists(key)) return g;
    orig(key, w, h);
    return g;
  };

  return g;
}

export function buildTextures(scene) {
  buildGroundTileset(scene);
  buildTree(scene);
  buildFence(scene);
  buildHouse(scene);
  buildBin(scene);
  buildShop(scene);
  buildSoil(scene);
  buildCrops(scene);
  buildFish(scene);
  buildBobber(scene);
  buildPlayer(scene);
}

// ---- 鱼图标（小游戏里的鱼 + 背包里显示）----
function buildFish(scene) {
  for (const fish of FISH_LIST) {
    const g = gfx(scene);
    const c = hexToInt(fish.color);
    // 身体
    g.fillStyle(c, 1).fillEllipse(6, 8, 11, 7);
    // 尾巴
    g.fillStyle(c, 1).fillTriangle(10, 8, 16, 3, 16, 13);
    // 眼睛
    g.fillStyle(COLORS.fishEye, 1).fillCircle(3, 7, 1);
    g.generateTexture(`fish-${fish.id}`, 16, 16);
    g.destroy();
  }
}

// ---- 浮标 ----
function buildBobber(scene) {
  const g = gfx(scene);
  g.fillStyle(COLORS.bobber, 1).fillCircle(4, 4, 4);
  g.fillStyle(COLORS.bobberTop, 1).fillCircle(4, 2.5, 3);
  g.generateTexture('bobber', 8, 8);
  g.destroy();
}

// ---- 地面图集：5 个图块横排 ----
function buildGroundTileset(scene) {
  const g = gfx(scene);
  const at = (i) => i * TILE;

  // 0 草地
  g.fillStyle(COLORS.grass, 1).fillRect(at(0), 0, TILE, TILE);
  g.fillStyle(COLORS.grassAlt, 1)
    .fillRect(at(0) + 3, 4, 2, 1)
    .fillRect(at(0) + 9, 10, 2, 1)
    .fillRect(at(0) + 5, 13, 1, 1);

  // 1 草地（深浅交错，避免大片纯色看起来很假）
  g.fillStyle(COLORS.grassAlt, 1).fillRect(at(1), 0, TILE, TILE);
  g.fillStyle(COLORS.grass, 1).fillRect(at(1) + 2, 3, 3, 1).fillRect(at(1) + 8, 9, 3, 1);

  // 2 泥土（农田）
  g.fillStyle(COLORS.dirt, 1).fillRect(at(2), 0, TILE, TILE);
  g.fillStyle(COLORS.dirtLine, 1)
    .fillRect(at(2), 3, TILE, 1)
    .fillRect(at(2), 8, TILE, 1)
    .fillRect(at(2), 13, TILE, 1);

  // 3 水
  g.fillStyle(COLORS.water, 1).fillRect(at(3), 0, TILE, TILE);
  g.fillStyle(COLORS.waterHi, 1).fillRect(at(3) + 2, 4, 6, 1).fillRect(at(3) + 8, 10, 5, 1);

  // 4 碎石地
  g.fillStyle(COLORS.stone, 1).fillRect(at(4), 0, TILE, TILE);
  g.fillStyle(COLORS.stoneHi, 1).fillRect(at(4) + 3, 3, 3, 2).fillRect(at(4) + 9, 9, 3, 2);

  g.generateTexture('tiles', 5 * TILE, TILE);
  g.destroy();
}

// ---- 树：32x96（2x6 格）—— 对齐星露谷的原生尺寸 ----
function buildTree(scene) {
  const W = 2 * TILE; // 32
  const H = 6 * TILE; // 96
  const g = gfx(scene);

  // 树干（碰撞盒只占这一块）
  g.fillStyle(COLORS.trunk, 1).fillRect(W / 2 - 4, H - 24, 8, 24);

  // 树冠
  g.fillStyle(COLORS.treeCanopy, 1)
    .fillCircle(W / 2, H - 46, 15)
    .fillCircle(W / 2 - 10, H - 58, 11)
    .fillCircle(W / 2 + 10, H - 58, 11);
  g.fillStyle(COLORS.treeLight, 1).fillCircle(W / 2 - 6, H - 62, 7);

  g.generateTexture('tree', W, H);
  g.destroy();
}

// ---- 围栏 ----
function buildFence(scene) {
  const g = gfx(scene);
  g.fillStyle(COLORS.grass, 1).fillRect(0, 0, TILE, TILE);
  g.fillStyle(COLORS.fence, 1).fillRect(2, 5, 12, 2).fillRect(2, 9, 12, 2).fillRect(6, 2, 4, 12);
  g.generateTexture('fence', 16, 16);
  g.destroy();
}

// ---- 房子：9x9 格（144x144）—— 对齐星露谷农舍的原生尺寸 ----
function buildHouse(scene) {
  const W = 9 * TILE;
  const H = 9 * TILE;
  const g = gfx(scene);

  g.fillStyle(COLORS.wall, 1).fillRect(0, 56, W, H - 56);
  g.fillStyle(COLORS.roof, 1).fillRect(0, 52, W, 10);
  g.fillStyle(COLORS.roof, 1).fillTriangle(0, 62, W, 62, W / 2, 0);
  g.fillStyle(COLORS.door, 1).fillRect(W / 2 - 10, H - 34, 20, 34);
  g.fillStyle(COLORS.window, 1).fillRect(20, 84, 24, 22).fillRect(W - 44, 84, 24, 22);

  g.generateTexture('house', W, H);
  g.destroy();
}

// ---- 出货箱：32x32（2x2 格）—— 对齐星露谷的原生尺寸 ----
function buildBin(scene) {
  const W = 2 * TILE;
  const H = 2 * TILE;
  const g = gfx(scene);

  g.fillStyle(COLORS.bin, 1).fillRect(2, 8, W - 4, H - 8);
  g.fillStyle(COLORS.binLid, 1).fillRect(0, 4, W, 8);
  g.fillStyle(0x5c4626, 1).fillRect(W / 2 - 2, 8, 4, H - 8);

  g.generateTexture('bin', W, H);
  g.destroy();
}

// ---- 种子商店摊位：3x2 格 ----
function buildShop(scene) {
  const W = 3 * TILE;
  const H = 2 * TILE;
  const g = gfx(scene);

  // 木台
  g.fillStyle(COLORS.shopWood, 1).fillRect(0, 10, W, H - 10);
  g.fillStyle(COLORS.shopWoodDark, 1).fillRect(0, 10, W, 2);

  // 遮阳篷（红白条纹）
  for (let i = 0; i < 6; i++) {
    g.fillStyle(i % 2 === 0 ? COLORS.shopStripeA : COLORS.shopStripeB, 1);
    g.fillRect(i * 8, 0, 8, 10);
  }

  // 台面
  g.fillStyle(COLORS.shopCounter, 1).fillRect(0, 20, W, 6);

  g.generateTexture('shop', W, H);
  g.destroy();
}

// ---- 耕地（锄过的土 / 浇过水的土）----
function buildSoil(scene) {
  for (const [key, base] of [
    ['soil-tilled', COLORS.soilTilled],
    ['soil-watered', COLORS.soilWatered],
  ]) {
    const g = gfx(scene);
    g.fillStyle(base, 1).fillRect(0, 0, TILE, TILE);
    g.fillStyle(0x000000, 0.16)
      .fillRect(0, 3, TILE, 1)
      .fillRect(0, 7, TILE, 1)
      .fillRect(0, 11, TILE, 1);
    g.generateTexture(key, 16, 16);
    g.destroy();
  }
}

// ---- 作物 ----
function buildCrops(scene) {
  // 通用幼苗阶段 0-3（越长越大）
  const stages = [
    (g) => {
      g.fillRect(7, 12, 2, 4);
    },
    (g) => {
      g.fillRect(7, 10, 2, 6);
      g.fillRect(4, 11, 3, 2);
      g.fillRect(9, 10, 3, 2);
    },
    (g) => {
      g.fillRect(7, 8, 2, 8);
      g.fillRect(3, 9, 4, 2);
      g.fillRect(9, 8, 4, 2);
      g.fillRect(5, 12, 6, 2);
    },
    (g) => {
      g.fillRect(7, 6, 2, 10);
      g.fillRect(2, 8, 5, 2);
      g.fillRect(9, 7, 5, 2);
      g.fillRect(4, 11, 8, 2);
      g.fillRect(3, 13, 10, 2);
    },
  ];

  stages.forEach((draw, i) => {
    const g = gfx(scene);
    g.fillStyle(COLORS.cropStem, 1);
    draw(g);
    g.generateTexture(`crop-${i}`, 16, 16);
    g.destroy();
  });

  // 成熟形态：每种作物一张，果实用自己的颜色 —— 一眼就能分清种的是什么
  for (const crop of CROP_LIST) {
    const g = gfx(scene);
    g.fillStyle(COLORS.cropStem, 1);
    stages[3](g);
    g.fillStyle(hexToInt(crop.color), 1).fillCircle(8, 5, 4);
    g.fillStyle(0xffffff, 0.35).fillCircle(6, 4, 1);
    g.generateTexture(`crop-mature-${crop.id}`, 16, 16);
    g.destroy();
  }
}

// ---- 角色：4 朝向 x 2 帧 ----
// 尺寸是 16x32 —— 和星露谷的角色帧完全一致，换素材时原样直拷，不用缩放。
// （缩放像素画会糊边，所以宁可改代码适配素材，也不缩素材。）
function buildPlayer(scene) {
  for (const dir of ['down', 'up', 'left', 'right']) {
    for (let frame = 0; frame < 2; frame++) {
      const g = gfx(scene);
      const step = frame === 1 ? 1 : 0;

      // 腿（两帧错开 1px 就是"走路"）
      g.fillStyle(COLORS.pants, 1).fillRect(3 + step, 26, 4, 6).fillRect(9 - step, 26, 4, 6);

      // 身体
      g.fillStyle(COLORS.shirt, 1).fillRect(3, 17, 10, 9);

      // 头
      g.fillStyle(COLORS.skin, 1).fillRect(3, 11, 10, 7);

      if (dir === 'up') {
        // 背面：整块头发盖住脸
        g.fillStyle(COLORS.hair, 1).fillRect(3, 9, 10, 10);
      } else {
        g.fillStyle(COLORS.hair, 1).fillRect(3, 9, 10, 4);
        g.fillStyle(COLORS.eye, 1);
        if (dir === 'down') g.fillRect(5, 14, 2, 2).fillRect(9, 14, 2, 2);
        if (dir === 'left') g.fillRect(4, 14, 2, 2);
        if (dir === 'right') g.fillRect(10, 14, 2, 2);
      }

      g.generateTexture(`player-${dir}-${frame}`, 16, 32);
      g.destroy();
    }
  }
}
