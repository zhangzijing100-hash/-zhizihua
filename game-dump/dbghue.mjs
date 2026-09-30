import { readPng } from "./png.mjs";
import { PANEL, TILE, COLS } from "./ocr.mjs";
function rgb2hsv(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;let h=0;
  if(d){if(mx===r)h=((g-b)/d)%6;else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;h*=60;if(h<0)h+=360;}
  return {h,s:mx?d/mx:0,v:mx};}
const img = readPng("device/minglun-shots/p00.png");
function sample(row, col, label) {
  const x0 = Math.round(PANEL.x + TILE.left + col*TILE.pitchX);
  const y0 = Math.round(PANEL.y + TILE.top + row*TILE.pitchY);
  const bins = new Array(12).fill(0); let n=0, hues=[];
  const B = 9; // 边框宽度
  for (let y = y0; y < y0+TILE.h; y++) for (let x = x0; x < x0+TILE.w; x++) {
    const edge = (x-x0<B)||(x0+TILE.w-1-x<B)||(y-y0<B)||(y0+TILE.h-1-y<B);
    if (!edge) continue;
    const i=(y*img.width+x)*4;
    const {h,s,v}=rgb2hsv(img.data[i],img.data[i+1],img.data[i+2]);
    if (s<0.3||v<0.3) continue;
    bins[Math.min(11,Math.floor(h/30))]++; n++;
  }
  const pct = bins.map(b=>n?(b/n*100):0);
  const segs = pct.filter(p=>p>8).length;
  console.log(`${label}  有效像素=${n}  覆盖色相段=${segs}`);
  console.log(`   直方图(每30°): ${pct.map((p,i)=>`${i*30}:${p.toFixed(0)}%`).join(" ")}`);
}
sample(0,0,"行1列1 (UR?)");
sample(0,1,"行1列2 (UR?)");
sample(1,0,"行2列1 (SSR?)");
sample(3,0,"行4列1");
