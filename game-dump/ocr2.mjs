// 命轮数量网格 —— OCR（灰度模板匹配版）
//
// 思路：**完全不做二值化、不做连通域、不做切分**。
// 数字是固定字体、固定位置右对齐渲染的，所以同一个数字每次的像素几乎一样。
// 直接按固定槽位取一小块**灰度**，跟模板做「归一化互相关」(NCC)：
//   · NCC 对亮度/对比度不敏感 → 底纹变亮变暗都不影响
//   · 不需要选阈值、不需要泛洪、不需要切分 → 没有那些环节的坑
// 数字位数（1~3 位）靠「百位/十位槽位是否为空」判断 —— 模板里含一个"空槽位"。
//
// 注意：这个文件有中文注释，**不要用 PowerShell 的 Set-Content 改它**（会加 BOM / 变乱码）。

export const COLS = 5;
export const ROWS = 4;

// 面板与格子在设备上的几何（1260×2800 / 560dpi 实测）
export const PANEL = { x: 950, y: 330, w: 907, h: 640 };
export const TILE = { left: 32, top: 32, w: 143, h: 140, pitchX: 177.5, pitchY: 147.7 };

export const PATCH = { w: 24, h: 34, pitch: 21, rightOffset: 16, topOffset: -3 };
export const EMPTY = "__EMPTY__";

/** 竖直偏移搜索范围：不同页面/不同抗锯齿会让数字整体上下差 1~2px */
const DY_RANGE = [-2, -1, 0, 1, 2];

function tileRight(col) { return TILE.left + col * TILE.pitchX + TILE.w; }

/**
 * 取某格某槽位的灰度小块（run 提供该行的竖直位置；dy 是额外竖直微调）。
 *
 * 试过做高通滤波想「去掉底纹、只留数字边缘」让模板通用，实测反而更差（40%）——
 * 数字的白填充与黑描边之间的对比本身就是最强的特征，高通把它压掉了。
 * 所以老老实实保留原始灰度，靠**多采几种底纹的模板**来覆盖（亮底/暗底/过渡行）。
 */
export function slotPatch(panel, run, col, slot, dy = 0) {
  const right = tileRight(col) - PATCH.rightOffset;
  const x1 = Math.round(right - slot * PATCH.pitch);
  const x0 = x1 - PATCH.w + 1;
  const y0 = Math.round(run.top + PATCH.topOffset) + dy;
  const out = new Float64Array(PATCH.w * PATCH.h);
  let sum = 0, n = 0;
  for (let y = 0; y < PATCH.h; y++) {
    const gy = y0 + y;
    for (let x = 0; x < PATCH.w; x++) {
      const gx = x0 + x;
      let v = 255;
      if (gx >= 0 && gy >= 0 && gx < panel.width && gy < panel.height) v = panel.gray[gy * panel.width + gx];
      out[y * PATCH.w + x] = v;
      sum += v; n++;
    }
  }
  const mean = sum / n;
  let norm = 0;
  for (let i = 0; i < out.length; i++) { out[i] -= mean; norm += out[i] * out[i]; }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

/** NCC: 两个已去均值并归一化的小块，点积即相关系数（1 = 完全相同） */
export function correlation(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * 找数字行带：数字是面板里唯一的**极暗**（<50）笔画，底纹最暗约 70。
 * 只看「个位槽位」那 5 条 x 带统计每 y 的暗像素数，数字行各自形成一条高值带。
 * 贴面板上下边缘的半行丢掉。
 */
export function detectDigitRuns(panel) {
  const bands = [];
  for (let c = 0; c < COLS; c++) {
    const x1 = Math.round(tileRight(c) - PATCH.rightOffset);
    bands.push([x1 - 22, x1]);
  }
  const prof = new Int32Array(panel.height);
  for (let y = 0; y < panel.height; y++) {
    let n = 0;
    const base = y * panel.width;
    for (const [a, b] of bands) {
      for (let x = a; x <= b; x++) {
        if (x < 0 || x >= panel.width) continue;
        if (panel.gray[base + x] < 50) n++;
      }
    }
    prof[y] = n;
  }
  const runs = [];
  let s = -1;
  const th = 3;
  for (let y = 0; y <= panel.height; y++) {
    const on = y < panel.height && prof[y] >= th;
    if (on && s < 0) s = y;
    if (!on && s >= 0) { runs.push({ top: s, bottom: y - 1 }); s = -1; }
  }
  return runs
    .map((r) => ({ ...r, h: r.bottom - r.top + 1 }))
    .filter((r) => r.h >= 18 && r.h <= 42 && r.top > 8 && r.bottom < panel.height - 8);
}

/**
 * 建模板。knownPages = [{ panel, rows }]，每页给一份「自上而下每行的 5 个已知值」。
 *
 * **必须给多张不同底纹的页面**：亮底（金/彩，UR/SSR）和暗底（紫/蓝，SR/R）
 * 的格子背景灰度差很多，只从亮底页建模板，到了暗底页 NCC 会整体对不上。
 * 同时从「超出位数的槽位」里采"空槽位"模板。
 */
export function buildTemplates(knownPages) {
  const tpl = new Map();
  const add = (ch, patch) => {
    if (!tpl.has(ch)) tpl.set(ch, []);
    tpl.get(ch).push(patch);
  };
  for (const { panel, rows } of knownPages) {
    const runs = detectDigitRuns(panel);
    const n = Math.min(runs.length, rows.length);
    for (let r = 0; r < n; r++) {
      // 第一页还没有模板，直接按行带位置取；之后用已有模板对齐
      const align = tpl.size ? findRowAlignment(panel, runs[r], tpl) : { dy: 0, score: 0 };
      for (let c = 0; c < COLS; c++) {
        const digits = String(rows[r][c]).split("");
        const dn = digits.length;
        for (const dy of [align.dy - 1, align.dy, align.dy + 1]) {
          for (let slot = 0; slot < 3; slot++) {
            const patch = slotPatch(panel, runs[r], c, slot, dy);
            if (slot < dn) add(digits[dn - 1 - slot], patch);
            else if (slot <= dn + 1) add(EMPTY, patch);
          }
        }
      }
    }
  }
  return tpl;
}

/** 识别一个槽位 */
export function matchPatch(patch, templates) {
  let best = EMPTY, bestScore = -Infinity;
  for (const [ch, list] of templates) {
    for (const t of list) {
      const s = correlation(patch, t);
      if (s > bestScore) { bestScore = s; best = ch; }
    }
  }
  return { ch: best, score: bestScore };
}

/**
 * 为一条行带找最佳对齐 (dy, dx)。
 *
 * 为什么不直接用 run.top / 固定 x：行带是靠「暗像素带」找出来的，被面板边缘裁切的行
 * 带高会偏小；而面板位置在不同分辨率下是**自动识别 + 重采样**得到的，
 * 横向会有累积误差（实测模拟器上重采样后整列数字偏移，出现 `19`→`1`、`41`→`1`、
 * `224`→`21` 这种系统性漏读）。所以横竖都搜一遍，让「5 列各自最佳 NCC 之和」最大。
 */
export function findRowAlignment(panel, run, templates, rangeY = 14, rangeX = 9) {
  let bestDy = 0, bestDx = 0, bestSum = -Infinity;
  for (let dx = -rangeX; dx <= rangeX; dx += 1) {
    for (let dy = -rangeY; dy <= rangeY; dy += 1) {
      let sum = 0;
      for (let c = 0; c < COLS; c++) {
        let best = -Infinity;
        for (let slot = 0; slot < 3; slot++) {
          const patch = slotPatch(panel, run, c, slot, dy, dx);
          for (const list of templates.values()) {
            for (const t of list) {
              const s = correlation(patch, t);
              if (s > best) best = s;
            }
          }
        }
        sum += best === -Infinity ? 0 : best;
      }
      if (sum > bestSum) { bestSum = sum; bestDx = dx; bestDy = dy; }
    }
  }
  return { dy: bestDy, dx: bestDx, score: bestSum / COLS };
}

/**
 * 读一格：数字右对齐，从个位往左逐个槽位识别，遇到"空槽位"就停。
 * dy/dx 由 findRowAlignment 给出（整行共用）。
 */
export function readCellAt(panel, run, col, templates, dy, dx = 0) {
  const digits = [];
  for (let slot = 0; slot < 3; slot++) {
    const patch = slotPatch(panel, run, col, slot, dy);
    const m = matchPatch(patch, templates);
    if (m.ch === EMPTY) break;
    digits.push(m.ch);
  }
  return digits.length ? digits.reverse().join("") : null;
}

/** 读一条行带 → 5 个数字（先整行对齐，再逐格识别） */
export function readRun(panel, run, templates, dy = null, dx = null) {
  const align = (dy === null || dx === null) ? findRowAlignment(panel, run, templates) : { dy, dx };
  const out = [];
  for (let c = 0; c < COLS; c++) out.push(readCellAt(panel, run, c, templates, align.dy, align.dx));
  return out;
}

/** 把一整页读成若干行（自上而下） */
export function readPanelRows(panel, templates) {
  return detectDigitRuns(panel).map((run) => readRun(panel, run, templates));
}

/** 调试：把一个槽位的灰度块渲染成 ASCII */
export function renderPatch(patch, w = PATCH.w, h = PATCH.h) {
  const lines = [];
  for (let y = 0; y < h; y++) {
    let s = "";
    for (let x = 0; x < w; x++) {
      const v = patch[y * w + x];
      s += v > 0.02 ? "#" : v < -0.02 ? "+" : ".";
    }
    lines.push(s);
  }
  return lines.join("\n");
}
