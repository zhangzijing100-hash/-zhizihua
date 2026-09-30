import { readPng, crop } from "./png.mjs";
import { PANEL, cellWindow } from "./ocr-core.mjs";
const img = readPng("device/minglun-shots/p00.png");
const sub = crop(img, PANEL.x, PANEL.y, PANEL.w, PANEL.h);
const g = new Uint8Array(sub.width*sub.height);
for (let y=0;y<sub.height;y++) for (let x=0;x<sub.width;x++){const i=(y*sub.width+x)*4;g[y*sub.width+x]=(sub.data[i]*299+sub.data[i+1]*587+sub.data[i+2]*114)/1000;}
const w = cellWindow(1,2);   // 行2列3，应该是「64」
console.log(`窗口 ${w.x1-w.x0+1} x ${w.y1-w.y0+1}`);
console.log("图例:  # = 极暗(<50)   * = 亮白(>205)   . = 中间调");
for (let y=w.y0;y<=w.y1;y++){
  let s="  ";
  for(let x=w.x0;x<=w.x1;x++){
    const v=g[y*sub.width+x];
    s += v<50 ? "#" : v>205 ? "*" : v<130 ? "+" : ".";
  }
  console.log(s);
}
// 统计：整格窗口里亮白像素 vs 极暗像素
let dark=0,bright=0,mid=0;
for(let y=w.y0;y<=w.y1;y++)for(let x=w.x0;x<=w.x1;x++){const v=g[y*sub.width+x]; if(v<50)dark++;else if(v>205)bright++;else mid++;}
console.log(`\n极暗(<50)=${dark}  亮白(>205)=${bright}  中间=${mid}`);
