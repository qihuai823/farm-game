// ============================================================
// 素材适配层 —— 从大图集里抠图，产出工程需要的所有贴图 key
// ============================================================
// 这是"换素材"这件事的全部工作量所在。
// 工程其他文件只认贴图 key（'tree' / 'player-down-0' / ...），
// 不关心图是从哪抠出来的 —— 所以换素材只动这个文件 + 映射表。
//
// 用的是 Phaser 的 CanvasTexture：
//   textures.createCanvas(key, w, h) 建一张空画布贴图
//   canvasTexture.getContext()       拿到 2d context
//   ctx.drawImage(源图, 源矩形, 目标矩形)  把源图的某块画进去
//   canvasTexture.refresh()          告诉 Phaser 重新上传纹理
//
// ★ 两个必须注意的点：
//   1. createCanvas 在 key 已存在时会返回 null —— 必须先 remove
//   2. imageSmoothingEnabled 必须关掉，否则像素画边缘会被插值糊掉

const sourceKey = (id) => `__pack_${id}`;

// 把映射表里登记的图源加进加载队列（在 preload 里调用）
export function loadPackSources(scene, map) {
  for (const [id, file] of Object.entries(map.sources || {})) {
    scene.load.image(sourceKey(id), file);
  }
}

// 真正切图（在 create 里调用，此时图源已加载完）
// 返回问题列表，空数组 = 全部成功
export function cutPackTextures(scene, map) {
  const tm = scene.textures;
  const problems = [];

  const srcImage = (id) => {
    const k = sourceKey(id);
    if (!tm.exists(k)) {
      problems.push(`图源 "${id}" 没加载上（路径：${(map.sources || {})[id] || '未登记'}）`);
      return null;
    }
    return tm.get(k).getSourceImage();
  };

  const makeCanvas = (key, w, h) => {
    if (!(w > 0) || !(h > 0)) {
      problems.push(`${key}：算出来的尺寸是 ${w}x${h}，非法`);
      return null;
    }
    if (tm.exists(key)) tm.remove(key); // 不先删掉的话 createCanvas 会返回 null
    const tex = tm.createCanvas(key, w, h);
    if (!tex) {
      problems.push(`${key}：创建画布失败`);
      return null;
    }
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false; // 像素画不能插值
    return { tex, ctx };
  };

  // ---- 单块裁切 ----
  for (const [key, cut] of Object.entries(map.cuts || {})) {
    const src = srcImage(cut.source);
    if (!src) continue;
    if (!Array.isArray(cut.rect) || cut.rect.length !== 4) {
      problems.push(`${key}：rect 必须是 [x, y, w, h]`);
      continue;
    }
    const [sx, sy, sw, sh] = cut.rect;
    const [ow, oh] = cut.out || [sw, sh];
    const c = makeCanvas(key, ow, oh);
    if (!c) continue;
    c.ctx.drawImage(src, sx, sy, sw, sh, 0, 0, ow, oh);
    c.tex.refresh();
  }

  // ---- 多格拼成一条横向图集（tilemap 需要一整张图）----
  for (const [key, sheet] of Object.entries(map.sheets || {})) {
    const src = srcImage(sheet.source);
    if (!src) continue;
    const cells = sheet.cells || [];
    if (cells.length === 0) {
      problems.push(`${key}：图集里一个格子都没有`);
      continue;
    }
    const h = cells[0][3];
    if (cells.some((c) => c.length !== 4 || c[3] !== h)) {
      problems.push(`${key}：格子必须是 [x,y,w,h] 且高度一致，否则 tilemap 用不了`);
      continue;
    }
    const w = cells.reduce((a, c) => a + c[2], 0);
    const c = makeCanvas(key, w, h);
    if (!c) continue;

    let dx = 0;
    for (const [x, y, cw, ch] of cells) {
      c.ctx.drawImage(src, x, y, cw, ch, dx, 0, cw, ch);
      dx += cw;
    }
    c.tex.refresh();
  }

  return problems;
}

// 检查所有需要的 key 是不是都真的存在了（切完图之后调用）
export function missingTextureKeys(scene, expectedKeys) {
  return expectedKeys.filter((k) => !scene.textures.exists(k));
}
