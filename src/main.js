import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { FarmScene } from './scenes/FarmScene.js';
import { UIScene } from './scenes/UIScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { FishingScene } from './scenes/FishingScene.js';

// 渲染器：默认 AUTO（优先 WebGL）。
// 加 ?canvas=1 强制走 Canvas 渲染 —— 显卡驱动有问题时的逃生舱。
const params = new URLSearchParams(location.search);
const RENDERER = params.get('canvas') === '1' ? Phaser.CANVAS : Phaser.AUTO;

// 等容器真的有尺寸再创建游戏。
//
// ★ 为什么必须等：
//   如果预览面板是折叠的、或者标签页在后台，容器的 clientWidth/Height 会是 0。
//   这时候创建 Phaser，它会建出一个 0x0 的画布和帧缓冲，
//   直接抛 "Framebuffer status: Incomplete Attachment" 起不来（真踩过）。
//
//   兜底：等 5 秒还没尺寸就硬着头皮用 640x480 起。
//   不能等太久 —— 在嵌入的预览面板里，容器可能永远拿不到尺寸，
//   等 30 秒的表现就是"这页面打不开"。
//
//   注意用 setTimeout 而不是 requestAnimationFrame：
//   rAF 在后台标签页里根本不触发，如果页面是在后台打开的，用 rAF 会永远等下去。
function whenContainerSized(cb) {
  const el = document.getElementById('game');
  let tries = 0;

  const attempt = () => {
    const w = el ? el.clientWidth : window.innerWidth;
    const h = el ? el.clientHeight : window.innerHeight;
    if (w > 0 && h > 0) return cb(w, h);
    if (++tries > 20) return cb(640, 480);
    setTimeout(attempt, 250);
  };

  attempt();
}

whenContainerSized((width, height) => {
  const game = new Phaser.Game({
    type: RENDERER,
    parent: 'game',
    backgroundColor: '#16211a',

    // 像素游戏必须开这两个，不然画面会糊
    pixelArt: true,
    roundPixels: true,

    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width,
      height,
      // 尺寸下限。容器被压到 0 的时候，画布会被夹到 320x240 而不是变成 0x0。
      minWidth: 320,
      minHeight: 240,
    },

    physics: {
      default: 'arcade',
      arcade: { gravity: { y: 0 }, debug: false },
    },

    scene: [BootScene, FarmScene, UIScene, MenuScene, FishingScene],
  });

  // 第一帧渲染出来后收起"加载中…"。
  // 如果它一直停在那儿，说明 Phaser 压根没起来 —— 那就是渲染器/WebGL 层面的问题。
  game.events.once('ready', () => {
    const boot = document.getElementById('boot');
    if (boot) boot.remove();

    // 之前可能用的是兜底尺寸，起来之后按真实尺寸再校一次
    const el = document.getElementById('game');
    if (el && el.clientWidth > 0 && el.clientHeight > 0) {
      game.scale.resize(el.clientWidth, el.clientHeight);
    }
  });

  // WebGL 上下文丢失（显卡驱动抽风、标签页被挂起太久、WebGL 上下文数量超限）。
  // 默认表现是画面静止不动、什么都不报，非常难排查 —— 所以显式抓出来给个指引。
  game.canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (window.__showFatal) {
      window.__showFatal(
        'WebGL 上下文丢失',
        '画面会停住。通常刷新页面就能恢复。\n如果反复出现，用 http://127.0.0.1:5173/?canvas=1 强制走 Canvas 渲染。'
      );
    }
  });
});
