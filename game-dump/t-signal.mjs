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
const before = load("emu/hash-before.txt");
const control = load("emu/hash-control.txt");
const panel = load("emu/hash-panel.txt");
// 稳定块：before 与 control 一致（说明不是游戏自己在动的噪声）
let stable = 0, changedNow = 0, signal = [];
for (const [k, v] of panel) {
  const c = control.get(k);
  if (c === undefined) continue;
  if (c === v) continue;              // 这次没变
  changedNow++;
  if (before.get(k) === c) { stable++; if (signal.length < 40) signal.push(k); }
}
console.log(`这次变化 ${changedNow} 块，其中「之前稳定」的 ${stable} 块（信号）`);
console.log("信号块地址（前 40）:");
console.log("  " + signal.join("\n  "));
fs.writeFileSync("emu/signal-blocks.txt", signal.join("\n"), "utf8");
