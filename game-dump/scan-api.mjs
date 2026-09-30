import fs from "node:fs";
const root = "C:/Users/Ricairo/Desktop/栀子花/game-dump/";
const files = ["lua.cat", "libUE4-arm64.so", "data.bin", "configs.bin", "miscs.bin"];
const needles = ["lzkp-common", "fight-record", "tc-lzkp-grc", "acoralai"];
const pathRe = /\/(?:api|grc|query|role|rank|record|fight|player|user|item|bag|inventory|profile|h5|report)\/[A-Za-z0-9_\/-]{2,60}/g;

for (const f of files) {
  let buf;
  try { buf = fs.readFileSync(root + f); } catch { continue; }
  const text = buf.toString("latin1");
  console.log(`\n########## ${f} ##########`);
  for (const n of needles) {
    let i = 0, hits = [];
    while ((i = text.indexOf(n, i)) !== -1) { hits.push(i); i++; if (hits.length > 6) break; }
    if (!hits.length) continue;
    console.log(`  「${n}」 ${hits.length}+ 处，上下文：`);
    for (const at of hits.slice(0, 3)) {
      const seg = text.slice(Math.max(0, at - 90), at + 130).replace(/[^\x20-\x7e]/g, ".");
      console.log(`     …${seg}…`);
    }
  }
  const paths = new Set();
  let m;
  const re = new RegExp(pathRe.source, "g");
  while ((m = re.exec(text)) !== null) { paths.add(m[0]); if (paths.size > 60) break; }
  if (paths.size) console.log(`  形如 /api/… /grc/… 的路径 ${paths.size} 个:\n    ${[...paths].slice(0, 40).join("\n    ")}`);
}
