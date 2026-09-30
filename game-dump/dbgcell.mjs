import { readPng, crop } from "./png.mjs";
import { PANEL, ROWS, COLS, cellWindow, renderGlyph } from "./ocr-core.mjs";
const img = readPng("device/minglun-shots/p00.png");
const sub = crop(img, PANEL.x, PANEL.y, PANEL.w, PANEL.h);
const g = new Uint8Array(sub.width*sub.height);
for (let y=0;y<sub.height;y++) for (let x=0;x<sub.width;x++){const i=(y*sub.width+x)*4;g[y*sub.width+x]=(sub.data[i]*299+sub.data[i+1]*587+sub.data[i+2]*114)/1000;}
const panel={width:sub.width,height:sub.height,gray:g};
console.log("面板", sub.width, "x", sub.height);
for (const [r,c] of [[1,2],[2,2],[2,3],[3,0],[3,2]]) {
  const w = cellWindow(r,c);
  console.log(`\n### 行${r+1} 列${c+1}  窗口 panel(${w.x0}..${w.x1}, ${w.y0}..${w.y1})`);
  // 直接打印窗口的 ASCII（暗像素）
  for (let y=w.y0;y<=w.y1;y+=2){let s="   ";for(let x=w.x0;x<=w.x1;x++){const v=g[y*sub.width+x];s+= v<78?"#": v<130?"+": v<190?".":" ";}console.log(s);}
}
