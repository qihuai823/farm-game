import { defineConfig } from 'vite';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================
// 两套构建：干净版（默认） / 个人版（--mode personal）
// ============================================================
//
// 星露谷的素材是版权资产，只能本地自用。所以它们的存放位置被刻意安排在
// public/ 之外（在 personal/ 目录里）：
//
//   Vite 只会把 public/ 复制进构建产物，
//   所以【干净版构建根本不可能带上版权素材】—— 不需要任何删除操作。
//
//   干净版（默认）：  npm run build          → dist/ 里没有版权素材
//   个人版：          npm run build:personal → 额外把 personal/ 复制成 dist/personal/
//
// 开发时（vite dev）会直接服务项目根目录，所以 /personal/xxx.png 天然可访问。

function copyPersonalAssets(isPersonal) {
  return {
    name: 'copy-personal-assets',
    apply: 'build',
    closeBundle() {
      if (!isPersonal) return;

      const src = join(process.cwd(), 'personal');
      if (!existsSync(src)) {
        console.log('\n[个人版] personal/ 目录不存在 —— 先跑 npm run assets:extract');
        return;
      }

      const dest = join(process.cwd(), 'dist/personal');
      mkdirSync(dest, { recursive: true });
      cpSync(src, dest, { recursive: true });
      console.log('\n[个人版] 已把 personal/ 里的素材复制到 dist/personal/');
      console.log('  ★ 这些是版权素材，产物只能本地自用，不要部署或分享。');
    },
  };
}

export default defineConfig(({ mode }) => {
  const isPersonal = mode === 'personal';
  return {
    // 用相对路径打包，以后丢到任何静态托管都能直接跑
    base: './',
    plugins: [copyPersonalAssets(isPersonal)],
    server: {
      host: '127.0.0.1',
      port: 5173,
      open: false,
    },
  };
});
