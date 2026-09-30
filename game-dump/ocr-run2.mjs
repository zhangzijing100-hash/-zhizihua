// 自定位版 OCR 验证：直接从图里找数字 → 排成 5×4 → 模板识别
import fs from "node:fs";
import { readPng, crop } from "./png.mjs";
import { PANEL, detectNumbers, groupToGlyphs, layoutNumbers, matchGlyph, renderGlyph } from "./ocr-core.mjs";

const P00 = [
  [7, 4, 3, 6, 3],
  [51, 44, 64, 34, 17],
  [84, 38, 58, 28, 31],
  [34, 17, 100, 21, 30],
];

function loadPanel(file) {
  const img = readPng(file);
  const sub = crop(img, PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  const n = sub.width * sub.height;
  const gray = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const s = i * 4; gray[i] = (sub.data[s] * 299 + sub.data[s + 1] * 587 + sub.data[s + 2] * 114) / 1000; }
  return { width: sub.width, height: sub.height, gray };
}

const p00 = loadPanel("device/minglun-shots/p00.png");
const groups0 = detectNumbers(p00);
console.log(`p00 检出数字组 ${groups0.length} 个`);
const rows0 = [];
{
  const sorted = [...groups0].sort((a, b) => a.cy - b.cy);
  for (const g of sorted) {
    const last = rows0[rows0.length - 1];
    if (last && Math.abs(g.cy - last.cy) < 60) last.items.push(g);
    else rows0.push({ cy: g.cy, items: [g] });
  }
}
console.log(`p00 排成 ${rows0.length} 行：${rows0.map((r) => r.items.length).join(" + ")}`);
rows0.forEach((r, i) => console.log(`  行${i + 1}: cy=${r.cy.toFixed(0)}  ${r.items.length} 个`));

// 建模板：p00 的 20 个数字是已知的
const templates = new Map();
let built = 0, skipped = 0;
rows0.forEach((r, ri) => {
  r.items.sort((a, b) => a.cx - b.cx);
  if (!P00[ri]) return;
  r.items.forEach((g, ci) => {
    const expect = String(P00[ri][ci] ?? "");
    const glyphs = groupToGlyphs(p00, g);
    if (!glyphs || glyphs.length !== expect.length) { skipped++; return; }
    for (let k = 0; k < glyphs.length; k++) {
      const ch = expect[k];
      if (!templates.has(ch)) templates.set(ch, []);
      templates.get(ch).push(glyphs[k].bits);
      built++;
    }
  });
});
console.log(`\n模板：建了 ${built} 个字形，跳过 ${skipped} 组`);
console.log("  " + [...templates.keys()].sort().join(" "));

// 回认 p00
console.log("\np00 回认：");
rows0.forEach((r, ri) => {
  const got = r.items.sort((a, b) => a.cx - b.cx).map((g) => {
    const glyphs = groupToGlyphs(p00, g);
    if (!glyphs) return "?";
    return glyphs.map((gl) => matchGlyph(gl.bits, templates).ch).join("");
  });
  const want = (P00[ri] ?? []).map(String);
  const ok = got.length === want.length && got.every((v, i) => v === want[i]);
  console.log(`  行${ri + 1}: ${got.map((v) => v.padStart(4)).join(" ")}   实际 ${want.map((v) => v.padStart(4)).join(" ")}  ${ok ? "✓" : "✗"}`);
});

// 其它页
for (const p of ["p01", "p02", "p03", "p04", "p05", "p06", "p07", "p08", "p09"]) {
  const f = `device/minglun-shots/${p}.png`;
  if (!fs.existsSync(f)) continue;
  const panel = loadPanel(f);
  const groups = detectNumbers(panel);
  const rows = [];
  for (const g of [...groups].sort((a, b) => a.cy - b.cy)) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(g.cy - last.cy) < 60) last.items.push(g);
    else rows.push({ cy: g.cy, items: [g] });
  }
  console.log(`\n${p}  检出 ${groups.length} 个，${rows.length} 行 (${rows.map((r) => r.items.length).join("+")})`);
  rows.forEach((r, ri) => {
    const got = r.items.sort((a, b) => a.cx - b.cx).map((g) => {
      const glyphs = groupToGlyphs(panel, g);
      if (!glyphs) return "?";
      return glyphs.map((gl) => matchGlyph(gl.bits, templates).ch).join("");
    });
    console.log(`  行${ri + 1}: ${got.map((v) => v.padStart(4)).join(" ")}`);
  });
}
