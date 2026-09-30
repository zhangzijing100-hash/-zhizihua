import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "bny");
const files = fs.readdirSync(dir);
const magics = {
  "zlib 78 01": [0x78, 0x01],
  "zlib 78 9c": [0x78, 0x9c],
  "zlib 78 da": [0x78, 0xda],
  zstd: [0x28, 0xb5, 0x2f, 0xfd],
  gzip: [0x1f, 0x8b],
  uasset: [0xc1, 0x83, 0x2a, 0x9e],
  snappy: [0xff, 0x06, 0x00, 0x00],
  lz4: [0x04, 0x22, 0x4d, 0x18],
  "LuaQ": [0x1b, 0x4c, 0x75, 0x61, 0x51],
  "bny-magic ef23ca4d": [0xef, 0x23, 0xca, 0x4d],
};
const totals = {};
for (const k of Object.keys(magics)) totals[k] = 0;
const perFile = [];

for (const f of files) {
  const buf = fs.readFileSync(path.join(dir, f));
  const hits = {};
  for (const [k, m] of Object.entries(magics)) {
    const mb = Buffer.from(m);
    let c = 0, p = 0;
    while ((p = buf.indexOf(mb, p)) !== -1) { c++; p += 1; }
    hits[k] = c;
    totals[k] += c;
  }
  const nonzero = Object.entries(hits).filter(([, v]) => v > 0);
  if (nonzero.length) perFile.push({ f, size: buf.length, nonzero });
}
console.log("=== 全部 2262 个 .bny 中的容器/压缩标记统计 ===");
for (const [k, v] of Object.entries(totals)) console.log(`  ${k.padEnd(22)} 出现 ${v} 次（含重复命中）`);
console.log(`\n有命中的文件数: ${perFile.length} / ${files.length}`);
console.log("\n=== 抽样 12 个文件的命中详情 ===");
for (const p of perFile.slice(0, 12)) console.log(`  ${p.f.padEnd(62)} ${p.size}  ${p.nonzero.map(([k, v]) => `${k}:${v}`).join(" ")}`);

// 检查目标大表
const big = "drc.gsp.fortunewheel.confbean.fortunewheelentrylevelcfg.bny";
if (fs.existsSync(path.join(dir, big))) {
  const buf = fs.readFileSync(path.join(dir, big));
  console.log(`\n=== ${big} (${buf.length} B) 标记扫描 ===`);
  for (const [k, m] of Object.entries(magics)) {
    const mb = Buffer.from(m);
    let c = 0, first = -1, p = 0;
    while ((p = buf.indexOf(mb, p)) !== -1) { c++; if (first < 0) first = p; p += 1; }
    if (c) console.log(`  ${k.padEnd(22)} ${c} 次, 首次 @${first}`);
  }
}
