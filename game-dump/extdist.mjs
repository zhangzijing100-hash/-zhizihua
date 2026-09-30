import fs from "node:fs";
import path from "node:path";

const dir = process.cwd();
const entries = JSON.parse(fs.readFileSync(path.join(dir, "entries.json"), "utf8"));

const ext = {};
for (const e of entries) {
  const m = e.name.match(/\.([a-z0-9]+)$/i);
  ext[m ? m[1] : "(none)"] = (ext[m ? m[1] : "(none)"] || 0) + 1;
}
console.log("=== 扩展名分布 ===");
for (const [k, v] of Object.entries(ext).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(6)}  .${k}`);

console.log("\n=== configs.cat 全部 33 条 ===");
for (const e of entries.filter((x) => x.key === "configs")) console.log("  " + e.name);

console.log("\n=== 含 bny / datatable / cfg 的条目 ===");
for (const kw of [".bny", "datatable", "\\cfg\\", "table"]) {
  const h = entries.filter((e) => e.name.toLowerCase().includes(kw));
  console.log(`[${kw}] ${h.length}`);
  for (const x of h.slice(0, 15)) console.log("     " + x.name);
}
