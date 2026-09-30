import fs from "node:fs";
function load(p) {
  const m = new Map();
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    if (!line) continue;
    const sp = line.indexOf(" ");
    m.set(line.slice(0, sp), line.slice(sp + 1));
  }
  return m;
}
const a = load("emu/hash-before.txt"), b = load("emu/hash-control.txt");
console.log(`before ${a.size} 块，control ${b.size} 块`);
let changed = 0, appeared = 0, gone = 0;
const addrs = [];
for (const [k, v] of b) {
  if (!a.has(k)) appeared++;
  else if (a.get(k) !== v) { changed++; if (addrs.length < 10) addrs.push(k); }
}
for (const k of a.keys()) if (!b.has(k)) gone++;
console.log(`变化 ${changed} 块 / 新增 ${appeared} / 消失 ${gone}   -> 噪声率 ${((changed+b.size*0)/b.size*100).toFixed(3)}%`);
console.log("前 10 个变化地址: " + addrs.join(", "));
