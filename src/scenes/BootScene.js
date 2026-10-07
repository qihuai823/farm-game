import Phaser from 'phaser';
import { buildTextures } from '../textures.js';
import { loadPackSources, cutPackTextures } from '../textures.pack.js';
import { USE_PACK_TEXTURES } from '../config.js';
import packMap from '../data/pack.map.json' with { type: 'json' };

// 启动场景：准备贴图 -> 注册动画 -> 进农场
//
// 两种贴图来源：
//   占位模式（USE_PACK_TEXTURES = false）：代码画色块，开发期用
//   素材模式（true）：从 src/data/pack.map.json 描述的图集里抠图
//
// 注意：映射表的"完整性"（有没有漏 key）由 npm test 在校验，不在这里查 ——
// 那属于开发期该发现的问题，不该等到玩家打开游戏才报。

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    if (!USE_PACK_TEXTURES) return;
    loadPackSources(this, packMap);
  }

  create() {
    if (USE_PACK_TEXTURES) {
      const problems = cutPackTextures(this, packMap);

      // 切完再用占位图补缺口。
      // textures.js 里的 gfx() 会跳过已存在的 key，所以已经切好的真素材不会被覆盖 ——
      // 结果就是"逐个 key 回退"：有素材的用素材，没有的用色块，游戏始终能跑。
      buildTextures(this);

      if (problems.length > 0) {
        if (window.__showFatal) {
          window.__showFatal(
            `素材映射表有问题（${problems.length} 处），这些 key 已回退到色块`,
            problems.slice(0, 30).join('\n') +
              (problems.length > 30 ? `\n…还有 ${problems.length - 30} 处` : '')
          );
        }
        console.warn('[素材] 映射表问题：', problems);
      }
    } else {
      buildTextures(this);
    }

    this.createAnims();
    this.scene.start('Farm');
  }

  createAnims() {
    for (const dir of ['down', 'up', 'left', 'right']) {
      this.anims.create({
        key: `walk-${dir}`,
        frames: [{ key: `player-${dir}-0` }, { key: `player-${dir}-1` }],
        frameRate: 7,
        repeat: -1,
      });
    }
  }
}
