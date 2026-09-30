// 从面板里切出 20 格数字，做字形分割与归一化，供模板匹配。
//
// 数字是「白色填充 + 黑色描边」，格子底纹（斜纹/渐变）灰度大多在 80~190，
// 所以直接取 灰度<78 的暗像素当字形轮廓 —— 比泛洪填充稳得多
// （底纹太花，泛洪会漏出去，整格都变成"字形"）。
import fs from "node:fs";
import { readPng, gray } from "./png.mjs";

export const PANEL = { x: 950, y: 330 };
export const TILE = { left: 32, top: 32, w: 143, h: 140, pitchX: 177.5, pitchY: 147.7 };
export const COLS = 5, ROWS = 4;
const WIN = { dx0: -70, dx1: -4, dy0: -56, dy1: -6 };
export const GW = 20, GH = 28;

export function cellWindow(row, col) {
  const right = PANEL.x + TILE.left + col * TILE.pitchX + TILE.w;
  const bottom = PANEL.y + TILE.top + row * TILE.pitchY + TILE.h;
  return {
    x0: Math.round(right + WIN.dx0), x1: Math.round(right + WIN.dx1),
    y0: Math.round(bottom + WIN.dy0), y1: Math.round(bottom + WIN.dy1),
  };
}

function darkMask(img, w) {
  const width = w.x1 - w.x0 + 1, height = w.y1 - w.y0 + 1;
  const m = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      m[y * width + x] = gray(img, w.x0 + x, w.y0 + y) < 78 ? 1 : 0;
  return { m, width, height };
}

function components(mask, width, height) {
  const label = new Int32Array(width * height).fill(-1);
  const out = [];
  const stack = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || label[i] >= 0) continue;
    const id = out.length;
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, n = 0;
    stack.length = 0; stack.push(i); label[i] = id;
    while (stack.length) {
      const p = stack.pop();
      const x = p % width, y = (p - x) / width;
      n++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x > 0 && mask[p-1] && label[p-1] < 0) { label[p-1] = id; stack.push(p-1); }
      if (x < width-1 && mask[p+1] && label[p+1] < 0) { label[p+1] = id; stack.push(p+1); }
      if (y > 0 && mask[p-width] && label[p-width] < 0) { label[p-width] = id; stack.push(p-width); }
      if (y < height-1 && mask[p+width] && label[p+width] < 0) { label[p+width] = id; stack.push(p+width); }
    }
    out.push({ id, minX, maxX, minY, maxY, w: maxX-minX+1, h: maxY-minY+1, n });
  }
  return out;
}

/** 在一格的窗口里找出「数字」那一组字形 */
export function extractCell(img, row, col) {
  const w = cellWindow(row, col);
  const { m, width, height } = darkMask(img, w);
  const all = components(m, width, height).filter((c) => c.h >= 13 && c.h <= 44 && c.n >= 12);
  if (!all.length) return { chars: [], bbox: null, window: w, comps: 0 };

  // 数字高度是一致的，底纹杂点不是 —— 用高度众数筛掉杂点
  const hist = new Map();
  for (const c of all) hist.set(c.h, (hist.get(c.h) ?? 0) + 1);
  let modeH = 0, modeN = -1;
  for (const [h, n] of hist) if (n > modeN || (n === modeN && h > modeH)) { modeN = n; modeH = h; }
  // 以「出现最多的高度」为中心，且该高度必须够高才像数字
  const comps = all.filter((c) => Math.abs(c.h - modeH) <= 4);
  if (!comps.length) return { chars: [], bbox: null, window: w, comps: all.length };

  // 数字是紧凑的一横排：按 x 排序，把间隔 <=6px 的连成组，取「分量最多、其次总宽最大」的组
  comps.sort((a, b) => a.minX - b.minX);
  const groups = [];
  for (const c of comps) {
    const g = groups[groups.length - 1];
    if (g && c.minX - g.maxX <= 6) { g.items.push(c); g.maxX = Math.max(g.maxX, c.maxX); g.minX = Math.min(g.minX, c.minX); }
    else groups.push({ items: [c], minX: c.minX, maxX: c.maxX });
  }
  groups.forEach((g) => {
    g.minY = Math.min(...g.items.map((c) => c.minY));
    g.maxY = Math.max(...g.items.map((c) => c.maxY));
    g.width = g.maxX - g.minX + 1;
  });
  groups.sort((a, b) => b.items.length - a.items.length || b.width - a.width);
  const best = groups[0];
  // 用「高度一致」这一组的众数高度重新校准上下边界，避免某个字略高把框撑大
  const midY = (Math.min(...best.items.map((c) => c.minY)) + Math.max(...best.items.map((c) => c.maxY))) / 2;
  const minY = Math.round(midY - modeH / 2), maxY = minY + modeH - 1;
  const minX = best.minX, maxX = best.maxX;
  const bw = maxX - minX + 1, bh = maxY - minY + 1;

  // 用暗掩膜当描边，再泛洪把「被描边围住的内部」补上 —— 得到实心字形。
  // 泛洪从外接框边框出发、只能走「非描边」像素；描边是闭合的环，所以内部进不去。
  const stroke = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) stroke[y * bw + x] = m[(minY + y) * width + (minX + x)];
  // 1px 膨胀：描边在抗锯齿处可能有 1px 缺口，不堵住泛洪就会漏出去把整格填满
  const wall = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    if (!stroke[y * bw + x]) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < bw && ny < bh) wall[ny * bw + nx] = 1;
    }
  }
  const outside = new Uint8Array(bw * bh);
  const flood = [];
  for (let x = 0; x < bw; x++) { if (!wall[x]) flood.push(x); if (!wall[(bh - 1) * bw + x]) flood.push((bh - 1) * bw + x); }
  for (let y = 0; y < bh; y++) { if (!wall[y * bw]) flood.push(y * bw); if (!wall[y * bw + bw - 1]) flood.push(y * bw + bw - 1); }
  while (flood.length) {
    const p = flood.pop();
    if (outside[p] || wall[p]) continue;
    outside[p] = 1;
    const x = p % bw, y = (p - x) / bw;
    if (x > 0) flood.push(p - 1);
    if (x < bw - 1) flood.push(p + 1);
    if (y > 0) flood.push(p - bw);
    if (y < bh - 1) flood.push(p + bw);
  }
  const inside = new Uint8Array(bw * bh);
  for (let i = 0; i < bw * bh; i++) inside[i] = outside[i] ? 0 : 1;

  // 按列投影切分单个数字：先取连续段，再合并间隔 ≤2px 的段
  const colHas = new Uint8Array(bw);
  for (let x = 0; x < bw; x++) for (let y = 0; y < bh; y++) if (inside[y * bw + x]) { colHas[x] = 1; break; }
  const runs = [];
  let s = -1;
  for (let x = 0; x < bw; x++) {
    if (colHas[x] && s < 0) s = x;
    if (!colHas[x] && s >= 0) { runs.push([s, x - 1]); s = -1; }
  }
  if (s >= 0) runs.push([s, bw - 1]);
  const segs = [];
  for (const r of runs) {
    const last = segs[segs.length - 1];
    if (last && r[0] - last[1] <= 2) last[1] = r[1];
    else segs.push([...r]);
  }
  const chars = segs.map(([sx, ex]) => {
    let sy = 1e9, ey = -1;
    for (let y = 0; y < bh; y++) for (let x = sx; x <= ex; x++) if (inside[y * bw + x]) { if (y < sy) sy = y; if (y > ey) ey = y; }
    const cw = ex - sx + 1, ch = ey - sy + 1;
    const bits = new Uint8Array(GW * GH);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const sxx = sx + Math.min(cw - 1, Math.floor(((x + 0.5) * cw) / GW));
      const syy = sy + Math.min(ch - 1, Math.floor(((y + 0.5) * ch) / GH));
      bits[y * GW + x] = inside[syy * bw + sxx] ? 1 : 0;
    }
    return { bits, w: GW, h: GH, rawW: cw, rawH: ch };
  });
  return { chars, bbox: { minX, minY, maxX, maxY, bw, bh }, window: w, comps: comps.length, groups: groups.length };
}

export function renderChar(bits, w = GW, h = GH) {
  const lines = [];
  for (let y = 0; y < h; y++) {
    let s = "";
    for (let x = 0; x < w; x++) s += bits[y * w + x] ? "#" : ".";
    lines.push(s);
  }
  return lines;
}

if (process.argv[1] && process.argv[1].endsWith("ocr.mjs")) {
  const img = readPng(process.argv[2] ?? "device/minglun-shots/p00.png");
  const all = [];
  for (let r = 0; r < ROWS; r++) {
    const rowOut = [];
    for (let c = 0; c < COLS; c++) {
      const res = extractCell(img, r, c);
      rowOut.push(`${res.chars.length}字(${res.chars.map((x) => x.rawW + "x" + x.rawH).join(",")})`);
      all.push(...res.chars.map((ch) => ({ r, c, ch })));
    }
    console.log(`行${r}: ${rowOut.join("  ")}`);
  }
  console.log(`\n共 ${all.length} 个字。前 3 格的字形：`);
  for (const [r, c] of [[0,0],[0,1],[1,0]]) {
    const res = extractCell(img, r, c);
    console.log(`\n=== 行${r} 列${c}  bbox=${JSON.stringify(res.bbox)} ===`);
    res.chars.forEach((ch, i) => { console.log(`--- 第${i}字 (原始 ${ch.rawW}x${ch.rawH}) ---`); console.log(renderChar(ch.bits).join("\n")); });
  }
}
