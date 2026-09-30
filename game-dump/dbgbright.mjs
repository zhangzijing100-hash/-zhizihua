import { readPng, crop } from "./png.mjs";
import { PANEL, TILE, SLOT, detectDigitRuns } from "./ocr-core.mjs";
function loadPanel(file){
  const img = readPng(file);
  const sub = crop(img, PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  const n = sub.width*sub.height; const gray = new Uint8Array(n);
  for (let i=0;i<n;i++){const s=i*4;gray[i]=(sub.data[s]*299+sub.data[s+1]*587+sub.data[s+2]*114)/1000;}
  return {width:sub.width,height:sub.height,gray};
}
function dump(p, label, run, col) {
  const x0 = Math.round(TILE.left + col*TILE.pitchX + 5);
  const x1 = Math.round(TILE.left + col*TILE.pitchX + TILE.w - 5);
  const y0 = run.top - 5, y1 = run.bottom + 5;
  console.log(`\n### ${label}  列${col+1}  x=${x0}..${x1} y=${y0}..${y1}`);
  for (let y=y0;y<=y1;y++){
    let s="  ";
    for(let x=x0;x<=x1;x++){const v=p.gray[y*p.width+x]; s += v>205?"*": v<50?"#":".";}
    console.log(s);
  }
}
const p00 = loadPanel("device/minglun-shots/p00.png");
const r00 = detectDigitRuns(p00);
dump(p00, "p00 行2 (51)", r00[1], 0);
const t03 = loadPanel("device/shots2/t03.png");
const r03 = detectDigitRuns(t03);
dump(t03, "t03 行2 (171)", r03[1], 0);
