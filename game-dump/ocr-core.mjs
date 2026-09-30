// 命轮数量网格 —— OCR 核心（纯函数，不依赖 Node，浏览器/App 里可直接用）
//
// 输入：面板区域的灰度图 { width, height, gray: Uint8Array }（0-255）
// 输出：20 格各自的数字字符串
//
// 原理：数字是「白色填充 + 黑色描边」，格子底纹是斜纹+渐变（灰度 80~190）。
// 所以取灰度 < 78 的暗像素当**描边掩膜**，连通域就是单个数字的轮廓 ——
// 不做泛洪填充（底纹太花，填充会漏；描边本身已经足够有区分度）。
// 多位数不用「列投影切分」，直接用连通域：每个数字的描边本来就是独立的一坨。

export const COLS = 5;
export const ROWS = 4;

// 面板内几何（在 1260×2800 / 560dpi 的机器上实测；Java 侧会换算成整屏坐标）
export const PANEL = { x: 950, y: 330, w: 907, h: 640 };
export const TILE = { left: 32, top: 32, w: 143, h: 140, pitchX: 177.5, pitchY: 147.7 };

// 数字窗口：贴着格子右下角；数字**右边缘对齐**在 tileRight-26
const WIN = { dx0: -96, dx1: -16, dy0: -54, dy1: -4 };
export const GLYPH_W = 18;
export const GLYPH_H = 26;

export function cellWindow(row, col) {
  const right = TILE.left + col * TILE.pitchX + TILE.w;
  const bottom = TILE.top + row * TILE.pitchY + TILE.h;
  return {
    x0: Math.round(right + WIN.dx0), x1: Math.round(right + WIN.dx1),
    y0: Math.round(bottom + WIN.dy0), y1: Math.round(bottom + WIN.dy1),
  };
}

// 阈值取 50 而不是 78：78 会把格子底纹的斜纹也吃进来（描边和底纹连成一坨，
// 连通域高度涨到 43 直接超范围）；50 只留数字的纯黑描边，底纹最暗也就 ~70。
const DARK = 50;

function components(mask, width, height, minPixels) {
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
      if (x > 0 && mask[p - 1] && label[p - 1] < 0) { label[p - 1] = id; stack.push(p - 1); }
      if (x < width - 1 && mask[p + 1] && label[p + 1] < 0) { label[p + 1] = id; stack.push(p + 1); }
      if (y > 0 && mask[p - width] && label[p - width] < 0) { label[p - width] = id; stack.push(p - width); }
      if (y < height - 1 && mask[p + width] && label[p + width] < 0) { label[p + width] = id; stack.push(p + width); }
    }
    if (n >= minPixels) out.push({ id, minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1, n });
  }
  return out;
}

// 数字槽位：数字在格子右下角**右对齐**，所以不用切分 —— 直接按固定槽位取。
// 实测：最右数字的右边缘 ≈ tileRight-28，数字步进 ≈ 21px，数字底边 ≈ tileBottom-15，高约 28px。
export const SLOT = {
  rightOffset: 28,   // 最右数字右边缘距格子右边缘
  pitch: 21,         // 相邻数字的步进
  digitWidth: 19,    // 单个数字宽度
  baselineOffset: 15,// 数字底边距格子底边
  digitHeight: 28,
  slack: 1,          // 两侧各留 1px：槽位总宽 = 19 + 2 = 21 = 步进，正好不重叠
};
const SLOT_COUNT = 3; // 最多三位数（实测最大 221）

/**
 * 逐行求网格相位。列表滚动后每行的位置都要重新对齐。
 *
 * 做法：只看「个位槽位」那 5 条 x 带（x 不随滚动变化），统计每 y 的暗像素数。
 * 4 行数字会各自形成一条高值带；用带的底边反推该行的 dy。
 * （试过全局相位搜索和「十位槽位打分」，都会被格子底纹骗到 40~85px 的错相位。）
 */
export function detectRowDys(panel) {
  const bands = [];
  for (let c = 0; c < COLS; c++) bands.push(slotRectWithDy(0, c, 0, 0));
  const prof = new Int32Array(panel.height);
  for (let y = 0; y < panel.height; y++) {
    let n = 0;
    const base = y * panel.width;
    for (const b of bands) {
      for (let x = b.x0; x <= b.x1; x++) {
        if (x < 0 || x >= panel.width) continue;
        if (panel.gray[base + x] < DARK) n++;
      }
    }
    prof[y] = n;
  }
  const runs = [];
  let s = -1;
  const th = 10;
  for (let y = 0; y <= panel.height; y++) {
    const on = y < panel.height && prof[y] >= th;
    if (on && s < 0) s = y;
    if (!on && s >= 0) { if (y - s >= 12) runs.push({ top: s, bottom: y - 1 }); s = -1; }
  }
  const dys = new Array(ROWS).fill(0);
  const used = new Array(ROWS).fill(false);
  const expectBottom = (r) => TILE.top + r * TILE.pitchY + TILE.h - SLOT.baselineOffset;
  for (const run of runs) {
    let bestR = -1, bestDiff = Infinity;
    for (let r = 0; r < ROWS; r++) {
      if (used[r]) continue;
      const diff = Math.abs(run.bottom - expectBottom(r));
      if (diff < bestDiff) { bestDiff = diff; bestR = r; }
    }
    if (bestR >= 0 && bestDiff < TILE.pitchY * 0.45) {
      dys[bestR] = run.bottom - expectBottom(bestR);
      used[bestR] = true;
    }
  }
  return dys;
}

/**
 * 直接从面板里找出所有「数字」，不依赖任何格子几何。
 *
 * 数字是唯一的纯黑描边（灰度 <50），底纹最暗也就 ~70。
 * 把横向相邻的描边连通域并成一个「数字组」，每组就是一个数值。
 * 之后按 x/y 聚类成 5 列 × 4 行 —— **网格是由数字自己定出来的**，
 * 所以列表滚动到哪一页都不影响。
 */
export function detectNumbers(panel) {
  const W = panel.width, H = panel.height;
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) mask[i] = panel.gray[i] < DARK ? 1 : 0;
  const comps = components(mask, W, H, 25).filter((c) => c.h >= 18 && c.h <= 40 && c.w >= 3 && c.w <= 32);

  const groups = [];
  for (const c of comps.sort((a, b) => a.minX - b.minX)) {
    let best = null;
    for (const g of groups) {
      const vOverlap = Math.min(g.maxY, c.maxY) - Math.max(g.minY, c.minY);
      if (vOverlap > Math.min(g.h, c.h) * 0.55 && c.minX - g.maxX <= 8 && c.minX - g.maxX >= -2) { best = g; break; }
    }
    if (best) {
      best.items.push(c);
      best.minX = Math.min(best.minX, c.minX);
      best.maxX = Math.max(best.maxX, c.maxX);
      best.minY = Math.min(best.minY, c.minY);
      best.maxY = Math.max(best.maxY, c.maxY);
    } else {
      groups.push({ items: [c], minX: c.minX, maxX: c.maxX, minY: c.minY, maxY: c.maxY, h: c.h });
    }
  }

  return groups
    .map((g) => {
      const w = g.maxX - g.minX + 1, h = g.maxY - g.minY + 1;
      return { ...g, w, h, cx: (g.minX + g.maxX) / 2, cy: (g.minY + g.maxY) / 2 };
    })
    .filter((g) => g.h >= 20 && g.h <= 36 && g.w <= 72 && g.w >= g.h * 0.35);
}

/** 把一个数字组切成单个字形并归一化（按列投影的极小值） */
export function groupToGlyphs(panel, group) {
  const W = panel.width;
  const bw = group.w, bh = group.h;
  const colSum = new Int32Array(bw);
  for (let x = 0; x < bw; x++) {
    let s = 0;
    for (let y = 0; y < bh; y++) {
      const i = (group.minY + y) * W + (group.minX + x);
      if (panel.gray[i] < DARK) s++;
    }
    colSum[x] = s;
  }
  const count = Math.max(1, Math.min(3, Math.round(bw / SLOT.pitch)));
  const cuts = [0];
  for (let k = 1; k < count; k++) {
    const ideal = Math.round((k * bw) / count);
    const span = Math.max(2, Math.round(bw / count / 3));
    let bestX = ideal, bestV = Infinity;
    for (let x = Math.max(cuts[k - 1] + 4, ideal - span); x <= Math.min(bw - 5, ideal + span); x++) {
      if (colSum[x] < bestV) { bestV = colSum[x]; bestX = x; }
    }
    cuts.push(bestX);
  }
  cuts.push(bw);

  const glyphs = [];
  for (let k = 0; k < count; k++) {
    const sx = cuts[k], ex = cuts[k + 1] - 1;
    if (ex - sx < 2) return null;
    let sy = 1e9, ey = -1;
    for (let y = 0; y < bh; y++) for (let x = sx; x <= ex; x++) {
      if (panel.gray[(group.minY + y) * W + group.minX + x] < DARK) { if (y < sy) sy = y; if (y > ey) ey = y; }
    }
    if (ey < 0 || ey - sy < 12) return null;
    const cw = ex - sx + 1, ch = ey - sy + 1;
    const bits = new Uint8Array(GLYPH_W * GLYPH_H);
    for (let y = 0; y < GLYPH_H; y++) for (let x = 0; x < GLYPH_W; x++) {
      const px = group.minX + sx + Math.min(cw - 1, Math.floor(((x + 0.5) * cw) / GLYPH_W));
      const py = group.minY + sy + Math.min(ch - 1, Math.floor(((y + 0.5) * ch) / GLYPH_H));
      bits[y * GLYPH_W + x] = panel.gray[py * W + px] < DARK ? 1 : 0;
    }
    glyphs.push({ bits, rawW: cw, rawH: ch });
  }
  return glyphs;
}

/** 把找到的数字按 5 列 × 4 行排列，返回 { grid, detail }（grid 是文字矩阵，缺格为 null） */
export function layoutNumbers(panel, groups) {
  if (groups.length < 4) return { grid: [], detail: [] };
  // 按 y 聚成 4 行
  const sorted = [...groups].sort((a, b) => a.cy - b.cy);
  const rowGroups = [];
  for (const g of sorted) {
    const last = rowGroups[rowGroups.length - 1];
    if (last && Math.abs(g.cy - last.cy) < TILE.pitchY * 0.45) { last.items.push(g); last.cy = last.items.reduce((s, i) => s + i.cy, 0) / last.items.length; }
    else rowGroups.push({ cy: g.cy, items: [g] });
  }
  const grid = [];
  for (const rg of rowGroups) {
    const row = rg.items.sort((a, b) => a.cx - b.cx);
    grid.push(row);
  }
  return { rows: grid };
}

/** 旧的全局相位接口（保留兼容，不再用于识别） */
let GRID_DY = 0;
export function setGridDy(dy) { GRID_DY = dy; }
export function getGridDy() { return GRID_DY; }

function tileOrigin(row, col, dy = GRID_DY) {
  return {
    right: TILE.left + col * TILE.pitchX + TILE.w,
    bottom: TILE.top + row * TILE.pitchY + TILE.h + dy,
  };
}

function slotRectWithDy(row, col, slot, dy) {
  const { right, bottom } = tileOrigin(row, col, dy);
  const r = right - SLOT.rightOffset;
  const x1 = r - slot * SLOT.pitch + SLOT.slack;
  const x0 = x1 - SLOT.digitWidth - SLOT.slack * 2;
  const y1 = bottom - SLOT.baselineOffset + SLOT.slack;
  const y0 = y1 - SLOT.digitHeight - SLOT.slack * 2;
  return { x0: Math.round(x0), x1: Math.round(x1), y0: Math.round(y0), y1: Math.round(y1) };
}

/**
 * 找网格的竖直相位：格子里是有彩色底纹的，格子之间的缝是灰的。
 * 在 [0, 行距) 里搜一个 dy，让「格子内部」彩色度高、「格缝」彩色度低。
 */
export function findGridDy(panel) {
  if (!panel.rgb) return 0;
  const prof = new Float32Array(panel.height);
  for (let y = 0; y < panel.height; y++) {
    let n = 0;
    for (let x = 0; x < panel.width; x += 2) {
      const i = (y * panel.width + x) * 3;
      const r = panel.rgb[i], g = panel.rgb[i + 1], b = panel.rgb[i + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) > 40) n++;
    }
    prof[y] = n;
  }
  const pitch = TILE.pitchY, h = TILE.h;
  let bestDy = 0, bestScore = -Infinity;
  for (let dy = -pitch + 1; dy < pitch; dy += 1) {
    let score = 0;
    for (let r = 0; r < ROWS; r++) {
      const top = TILE.top + r * pitch + dy;
      for (let y = Math.round(top + 12); y < Math.round(top + h - 12); y++) if (prof[y] !== undefined) score += prof[y];
      for (let y = Math.round(top + h + 1); y < Math.round(top + pitch + 5); y++) if (prof[y] !== undefined) score -= prof[y] * 3;
    }
    if (score > bestScore) { bestScore = score; bestDy = dy; }
  }
  return bestDy;
}

/** 某个槽位在面板坐标下的矩形（从右往左数，slot 0 = 个位） */
export function slotRect(row, col, slot, dy = GRID_DY) {
  return slotRectWithDy(row, col, slot, dy);
}

/**
 * 取一格的数字字形（从左到右）。数字右对齐，所以从个位往左逐个槽位取；
 * **一旦某个槽位是空的就停** —— 右对齐意味着不会出现「个位空、十位有」。
 * 这条约束同时干掉了「图标里的暗块被误当成百位」那类错误。
 */
export function extractCell(panel, row, col, opts = {}) {
  const minDark = opts.minDark ?? 22;
  const dy = opts.dy ?? GRID_DY;
  const digits = [];
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const rect = slotRect(row, col, slot, dy);
    const width = rect.x1 - rect.x0 + 1, height = rect.y1 - rect.y0 + 1;
    const mask = new Uint8Array(width * height);
    let dark = 0;
    for (let y = 0; y < height; y++) {
      const gy = rect.y0 + y;
      for (let x = 0; x < width; x++) {
        const gx = rect.x0 + x;
        if (gx < 0 || gy < 0 || gx >= panel.width || gy >= panel.height) continue;
        if (panel.gray[gy * panel.width + gx] < DARK) { mask[y * width + x] = 1; dark++; }
      }
    }
    if (dark < minDark) break;
    const comps = components(mask, width, height, 10).filter((c) => c.h >= 14 && c.w >= 3);
    if (!comps.length) break;
    // 同一槽位里可能有多块（比如 "4" 的斜笔和竖笔），取外接框并起来
    const minX = Math.min(...comps.map((c) => c.minX));
    const maxX = Math.max(...comps.map((c) => c.maxX));
    const minY = Math.min(...comps.map((c) => c.minY));
    const maxY = Math.max(...comps.map((c) => c.maxY));
    const cw = maxX - minX + 1, ch = maxY - minY + 1;
    if (ch < 16) break;
    const bits = new Uint8Array(GLYPH_W * GLYPH_H);
    for (let y = 0; y < GLYPH_H; y++) for (let x = 0; x < GLYPH_W; x++) {
      const px = minX + Math.min(cw - 1, Math.floor(((x + 0.5) * cw) / GLYPH_W));
      const py = minY + Math.min(ch - 1, Math.floor(((y + 0.5) * ch) / GLYPH_H));
      bits[y * GLYPH_W + x] = mask[py * width + px];
    }
    digits.push({ bits, rawW: cw, rawH: ch, slot, dark });
  }
  digits.reverse();
  return { glyphs: digits };
}

/** 两个归一化字形的差异（0 = 完全一样） */
function distance(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

/** 用一批「已知数值」的格子建模板。known = [["7","4",...], ...] 每行 5 个，自上而下 */
export function buildTemplates(panel, known) {
  const runs = detectDigitRuns(panel);
  const templates = new Map(); // 字符 -> [bits...]
  const rows = Math.min(runs.length, known.length);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < COLS; c++) {
      const expect = String(known[r][c]);
      const glyphs = extractNumber(panel, runs[r], c);
      if (!glyphs || glyphs.length !== expect.length) continue; // 位数对不上就跳过，别污染模板
      for (let i = 0; i < glyphs.length; i++) {
        const ch = expect[i];
        if (!templates.has(ch)) templates.set(ch, []);
        templates.get(ch).push(glyphs[i].bits);
      }
    }
  }
  return templates;
}

/** 识别一个字形的字符 */
export function matchGlyph(bits, templates) {
  let best = "?", bestD = Infinity, second = Infinity;
  for (const [ch, list] of templates) {
    for (const t of list) {
      const d = distance(bits, t);
      if (d < bestD) { second = bestD; bestD = d; best = ch; }
      else if (d < second) second = d;
    }
  }
  return { ch: best, d: bestD, margin: second - bestD };
}

/** 识别整页 20 格 */
export function recognizePanel(panel, templates, dys = null) {
  const rowDys = dys ?? detectRowDys(panel);
  const grid = [];
  const detail = [];
  for (let r = 0; r < ROWS; r++) {
    const rowText = [], rowDetail = [];
    for (let c = 0; c < COLS; c++) {
      const { glyphs } = extractCell(panel, r, c, { dy: rowDys[r] });
      if (!glyphs.length) { rowText.push(null); rowDetail.push({ r, c, text: null }); continue; }
      const parts = glyphs.map((g) => matchGlyph(g.bits, templates));
      const text = parts.map((p) => p.ch).join("");
      const minMargin = Math.min(...parts.map((p) => p.margin));
      rowText.push(text);
      rowDetail.push({ r, c, text, minMargin, glyphCount: glyphs.length });
    }
    grid.push(rowText);
    detail.push(rowDetail);
  }
  return { grid, detail, rowDys };
}

/** ASCII 渲染字形（调试用） */
export function renderGlyph(bits, w = GLYPH_W, h = GLYPH_H) {
  const lines = [];
  for (let y = 0; y < h; y++) {
    let s = "";
    for (let x = 0; x < w; x++) s += bits[y * w + x] ? "#" : ".";
    lines.push(s);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------- 按「行带」读（推荐）
//
// 只按从上到下的顺序读，**不把行带分配给"第几行格子"** ——
// 滚动整整一行时，按绝对位置就近分配会整体错位一行。

/**
 * 找出面板里所有**完整的数字行带**（从上到下）。
 * 只看「个位槽位」那 5 条 x 带（x 不随滚动变化），统计每 y 的暗像素数；
 * 数字行各自形成一条高值带。贴面板上下边缘的（被裁掉的半行）丢掉。
 */
export function detectDigitRuns(panel) {
  const bands = [];
  for (let c = 0; c < COLS; c++) bands.push(slotRectWithDy(0, c, 0, 0));
  const prof = new Int32Array(panel.height);
  for (let y = 0; y < panel.height; y++) {
    let n = 0;
    const base = y * panel.width;
    for (const b of bands) {
      for (let x = b.x0; x <= b.x1; x++) {
        if (x < 0 || x >= panel.width) continue;
        if (panel.gray[base + x] < DARK) n++;
      }
    }
    prof[y] = n;
  }
  const runs = [];
  let s = -1;
  const th = 10;
  for (let y = 0; y <= panel.height; y++) {
    const on = y < panel.height && prof[y] >= th;
    if (on && s < 0) s = y;
    if (!on && s >= 0) { runs.push({ top: s, bottom: y - 1 }); s = -1; }
  }
  return runs
    .map((r) => ({ ...r, h: r.bottom - r.top + 1 }))
    .filter((r) => r.h >= 22 && r.h <= 36 && r.top > 8 && r.bottom < panel.height - 8);
}

/** 把一条行带对到「格子行 0」的相位 */
export function runDy(run) {
  return run.bottom - (TILE.top + TILE.h - SLOT.baselineOffset);
}

/**
 * 从一条行带里取某列的数字字形（从左到右）。
 *
 * 做法：在「该行带的 y 范围 × 该格子的 x 范围」里取灰度 <50 的黑描边
 * （底纹最暗约 70，所以这个阈值只留数字），**从区域四边泛洪**；
 * 泛洪走不到的地方就是「描边 + 被描边围住的白色内部」= 数字实体。
 * 然后按连通域自然分成单个数字。
 *
 * 为什么这么做：
 *  · 用固定槽位硬切 → 数字右对齐得很紧，相邻数字的描边会渗进下一个槽位（`171` 的 7 渗了 5px）；
 *  · 只用黑描边做模板 → 0/6/8/9 区分度不够；
 *  · 只按紧外接框泛洪 → 外接框贴着描边，泛洪进不去，整格会被判成"字形"。
 *    区域给足（整个格子宽），泛洪才走得通。
 */
export function extractNumber(panel, run, col) {
  const W = panel.width;
  const x0 = Math.round(TILE.left + col * TILE.pitchX + 5);
  const x1 = Math.round(TILE.left + col * TILE.pitchX + TILE.w - 5);
  const y0 = Math.max(0, run.top - 6);
  const y1 = Math.min(panel.height - 1, run.bottom + 6);
  const rw = x1 - x0 + 1, rh = y1 - y0 + 1;
  if (rw <= 3 || rh <= 3) return null;

  const stroke = new Uint8Array(rw * rh);
  for (let y = 0; y < rh; y++) {
    const base = (y0 + y) * W;
    for (let x = 0; x < rw; x++) stroke[y * rw + x] = panel.gray[base + x0 + x] < DARK ? 1 : 0;
  }
  // 1px 膨胀堵住抗锯齿造成的 1px 缺口
  const wall = new Uint8Array(rw * rh);
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    if (!stroke[y * rw + x]) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < rw && ny < rh) wall[ny * rw + nx] = 1;
    }
  }
  const outside = new Uint8Array(rw * rh);
  const flood = [];
  for (let x = 0; x < rw; x++) { flood.push(x); flood.push((rh - 1) * rw + x); }
  for (let y = 0; y < rh; y++) { flood.push(y * rw); flood.push(y * rw + rw - 1); }
  while (flood.length) {
    const p = flood.pop();
    if (outside[p] || wall[p]) continue;
    outside[p] = 1;
    const x = p % rw, y = (p - x) / rw;
    if (x > 0) flood.push(p - 1);
    if (x < rw - 1) flood.push(p + 1);
    if (y > 0) flood.push(p - rw);
    if (y < rh - 1) flood.push(p + rw);
  }
  const solid = new Uint8Array(rw * rh);
  for (let i = 0; i < rw * rh; i++) solid[i] = outside[i] ? 0 : 1;

  // 按连通域分出单个数字（数字之间不会相连）
  const comps = components(solid, rw, rh, 60).filter((c) => c.h >= 16 && c.w >= 3 && c.w <= 34);
  if (!comps.length) return null;
  comps.sort((a, b) => a.minX - b.minX);

  const glyphs = comps.map((c) => {
    const cw = c.w, ch = c.h;
    const bits = new Uint8Array(GLYPH_W * GLYPH_H);
    for (let y = 0; y < GLYPH_H; y++) for (let x = 0; x < GLYPH_W; x++) {
      const px = c.minX + Math.min(cw - 1, Math.floor(((x + 0.5) * cw) / GLYPH_W));
      const py = c.minY + Math.min(ch - 1, Math.floor(((y + 0.5) * ch) / GLYPH_H));
      bits[y * GLYPH_W + x] = solid[py * rw + px];
    }
    return { bits, rawW: cw, rawH: ch };
  });
  return glyphs;
}

/** 读一条行带 → 5 个数字字符串（从左到右，读不出为 null） */
export function readRun(panel, run, templates) {
  const out = [];
  for (let c = 0; c < COLS; c++) {
    const glyphs = extractNumber(panel, run, c);
    if (!glyphs) { out.push(null); continue; }
    out.push(glyphs.map((g) => matchGlyph(g.bits, templates).ch).join(""));
  }
  return out;
}

/** 把一整页读成若干行（每行 5 个），从上到下 */
export function readPanelRows(panel, templates) {
  return detectDigitRuns(panel).map((run) => readRun(panel, run, templates));
}
