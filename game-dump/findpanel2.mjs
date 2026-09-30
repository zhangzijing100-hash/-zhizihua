// 自动定位游戏「物品详情」面板的位置。
//
// 为什么需要：面板位置和尺寸跟分辨率/UI 缩放有关。
// 手机上实测是 1260×2800 下 x=950 y=330 907×640；
// 模拟器 1920×1080 下位置和大小都不一样 —— 写死常量换台机器就废了。
//
// 面板的特征：一块**大面积、亮、低饱和**的圆角矩形，压在暗色的游戏背景上。
// 做法：先按亮+低饱和取掩膜，再找最大的连通块（降采样后再找，快很多）。
import { readPng } from "./png.mjs";

function isPanelPixel(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx >= 150 && (mx - mn) <= 26;
}

/** 降采样 k 倍后找最大连通块，再映射回原图坐标 */
export function findPanel(img, k = 4) {
  const w = Math.floor(img.width / k), h = Math.floor(img.height / k);
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 取 k×k 块里的一点代表（再抽 3×3 求多数，抗噪）
      let votes = 0;
      for (let dy = 0; dy < k; dy += 2) {
        for (let dx = 0; dx < k; dx += 2) {
          const sx = x * k + dx, sy = y * k + dy;
          if (sx >= img.width || sy >= img.height) continue;
          const i = (sy * img.width + sx) * 4;
          if (isPanelPixel(img.data[i], img.data[i + 1], img.data[i + 2])) votes++;
        }
      }
      mask[y * w + x] = votes >= 2 ? 1 : 0;
    }
  }

  // 连通块（只做 4 邻域，够用）
  const label = new Int32Array(w * h).fill(-1);
  let best = null;
  const stack = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || label[i] >= 0) continue;
    const id = i;
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, n = 0;
    stack.length = 0; stack.push(i); label[i] = id;
    while (stack.length) {
      const p = stack.pop();
      const x = p % w, y = (p - x) / w;
      n++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x > 0 && mask[p - 1] && label[p - 1] < 0) { label[p - 1] = id; stack.push(p - 1); }
      if (x < w - 1 && mask[p + 1] && label[p + 1] < 0) { label[p + 1] = id; stack.push(p + 1); }
      if (y > 0 && mask[p - w] && label[p - w] < 0) { label[p - w] = id; stack.push(p - w); }
      if (y < h - 1 && mask[p + w] && label[p + w] < 0) { label[p + w] = id; stack.push(p + w); }
    }
    if (!best || n > best.n) best = { n, minX, minY, maxX, maxY };
  }
  if (!best) return null;
  const rect = {
    x: best.minX * k, y: best.minY * k,
    w: (best.maxX - best.minX + 1) * k, h: (best.maxY - best.minY + 1) * k,
    area: best.n * k * k,
  };
  // 面板应该是一大块；太小说明找歪了
  if (rect.w < img.width * 0.2 || rect.h < img.height * 0.2) return null;
  return rect;
}

/** 在面板内按比例推算格子几何（与设备分辨率无关） */
export function panelTileGeometry(rect, refPanel, refTile) {
  const sx = rect.w / refPanel.w, sy = rect.h / refPanel.h;
  return {
    left: refTile.left * sx, top: refTile.top * sy,
    w: refTile.w * sx, h: refTile.h * sy,
    pitchX: refTile.pitchX * sx, pitchY: refTile.pitchY * sy,
  };
}
