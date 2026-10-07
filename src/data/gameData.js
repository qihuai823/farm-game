// 注意：必须带 `with { type: 'json' }`，这是标准写法，
// 浏览器打包（Vite）和 Node 测试脚本都能直接跑。
import cropsData from './crops.json' with { type: 'json' };
import fishData from './fish.json' with { type: 'json' };

// 把 JSON 表转成按 id 索引的对象，方便代码里 O(1) 取用。
// 想加作物/鱼：只改对应的 json，这里不用动。

export const CROP_LIST = cropsData.crops;
export const CROPS = Object.fromEntries(CROP_LIST.map((c) => [c.id, c]));

export const FISH_LIST = fishData.fish;
export const FISH = Object.fromEntries(FISH_LIST.map((f) => [f.id, f]));

// 所有"能卖的东西"的合并索引（作物 + 鱼）。
// 商店、背包、出货箱统一查这张表 —— 以后加新类别（比如矿物、木料）也只需要在这里合并。
export const ITEMS = { ...CROPS, ...FISH };

// '#rrggbb' -> 0xrrggbb（Phaser 要的是数字）
export function hexToInt(hex) {
  return parseInt(String(hex).replace('#', ''), 16);
}
