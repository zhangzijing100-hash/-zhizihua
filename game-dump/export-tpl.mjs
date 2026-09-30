import fs from "node:fs";
import { readPng, crop } from "./png.mjs";
import { PANEL, buildTemplates, PATCH, EMPTY } from "./ocr2.mjs";
const KNOWN = [
  { file: "device/minglun-shots/p00.png", rows: [[7,4,3,6,3],[51,44,64,34,17],[84,38,58,28,31],[34,17,100,21,30]] },
  { file: "device/shots2/t01.png",        rows: [[36,17,100,21,30],[37,49,42,30,30],[11,21,20,16,15],[18,18,17,17,34]] },
  { file: "device/shots2/t03.png",        rows: [[7,6,9,3,182],[171,160,160,156,159],[176,149,181,200,192],[203,171,158,201,221]] },
];
function loadPanel(file){
  const img = readPng(file);
  const sub = crop(img, PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  const n = sub.width*sub.height; const gray = new Uint8Array(n);
  for (let i=0;i<n;i++){const s=i*4;gray[i]=(sub.data[s]*299+sub.data[s+1]*587+sub.data[s+2]*114)/1000;}
  return {width:sub.width,height:sub.height,gray};
}
const panels = KNOWN.map(k => ({ panel: loadPanel(k.file), rows: k.rows }));
const tpl = buildTemplates(panels);
// 去重：与已保留的任一模板的平方距离 < TH 就丢掉（相邻 dy 采出来的基本一样）
const TH = 0.02;
function dedupe(list, th) {
  const keep = [];
  for (const p of list) {
    let dup = false;
    for (const q of keep) {
      let d = 0;
      for (let i=0;i<p.length;i++) { const x = p[i]-q[i]; d += x*x; if (d > th) break; }
      if (d <= th) { dup = true; break; }
    }
    if (!dup) keep.push(p);
  }
  return keep;
}
const out = {};
let before=0, after=0;
for (const [ch, list] of tpl) {
  before += list.length;
  const keep = dedupe(list, TH);
  after += keep.length;
  out[ch === EMPTY ? "" : ch] = keep.map(p => {
    const q = Buffer.alloc(p.length);
    for (let i=0;i<p.length;i++) q[i] = Math.max(-127, Math.min(127, Math.round(p[i]*127))) & 0xff;
    return q.toString("base64");
  });
}
fs.writeFileSync("ocr-templates.json", JSON.stringify({ w: PATCH.w, h: PATCH.h, t: out }), "utf8");
console.log(`去重 ${before} -> ${after} 个，` + (fs.statSync("ocr-templates.json").size/1024).toFixed(0) + " KB");
console.log(Object.entries(out).map(([k,v])=>`${k===""?"空":k}:${v.length}`).join(" "));

