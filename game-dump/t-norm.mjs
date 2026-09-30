import fs from "node:fs";
import { readPng, crop, resize, writePng } from "./png.mjs";
import { findPanel } from "./findpanel2.mjs";
import { PANEL, detectDigitRuns, readRun, PATCH } from "./ocr2.mjs";
// 加载导出好的模板
const doc = JSON.parse(fs.readFileSync("ocr-templates.json","utf8"));
const EMPTY = "__EMPTY__";
const templates = new Map();
for (const [k,list] of Object.entries(doc.t)) {
  templates.set(k === "" ? EMPTY : k, list.map(b64 => {
    const buf = Buffer.from(b64,"base64"); const p = new Float64Array(buf.length);
    for (let i=0;i<buf.length;i++){ const v = buf[i] > 127 ? buf[i]-256 : buf[i]; p[i] = v/127; }
    return p;
  }));
}
function loadPanelNormalized(file, useAuto) {
  const img = readPng(file);
  let rect = { x: PANEL.x, y: PANEL.y, w: PANEL.w, h: PANEL.h };
  if (useAuto) { const d = findPanel(img, 4); if (!d) return null; rect = d; }
  const sub = crop(img, rect.x, rect.y, rect.w, rect.h);
  const norm = (rect.w === PANEL.w && rect.h === PANEL.h) ? sub : resize(sub, PANEL.w, PANEL.h);
  const n = norm.width*norm.height; const gray = new Uint8Array(n);
  for (let i=0;i<n;i++){const s=i*4;gray[i]=(norm.data[s]*299+norm.data[s+1]*587+norm.data[s+2]*114)/1000;}
  return { width: norm.width, height: norm.height, gray };
}
const TESTS = [
  ["device/emu-panel.png", "模拟器 1920x1080（面板 796x548，自动识别+重采样）", true,
   [[5,3,1,1,25],[19,41,224,24,14],[20,62,13,17,79],[20,31,31,23,19]]],
  ["device/minglun-shots/p00.png", "手机 2800x1260（已知几何）", false,
   [[7,4,3,6,3],[51,44,64,34,17],[84,38,58,28,31],[34,17,100,21,30]]],
];
for (const [f, label, auto, truth] of TESTS) {
  const panel = loadPanelNormalized(f, auto);
  if (!panel) { console.log(`${label}\n  面板识别失败`); continue; }
  const runs = detectDigitRuns(panel);
  console.log(`\n${label}`);
  console.log(`  重采样后 ${panel.width}x${panel.height}，检出 ${runs.length} 条数字行带`);
  runs.forEach((run, i) => {
    const got = readRun(panel, run, templates);
    const want = (truth[i] ?? []).map(String);
    const ok = got.length === 5 && got.every((v,j) => v === want[j]);
    console.log(`    ${got.map(v=>(v??"?").padStart(4)).join(" ")}   实际 ${want.map(v=>v.padStart(4)).join(" ")}  ${ok?"✓":"✗"}`);
  });
}
