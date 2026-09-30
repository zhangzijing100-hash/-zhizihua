import fs from "node:fs";
import path from "node:path";
import { findEntry, extractConstants } from "./luaq.mjs";

const dir = process.cwd();
const outDir = path.join(dir, "extract");
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  "@lua\\bny\\gen\\drc\\gsp\\fatecore\\confbean\\fatecorebasepropertycfg.lua",
  "@lua\\bny\\gen\\drc\\gsp\\fatecore\\confbean\\fatecorerankexpcfg.lua",
  "@lua\\bny\\gen\\drc\\gsp\\fatecore\\confbean\\fatecoreconst.lua",
  "@lua\\bny\\gen\\drc\\gsp\\fatecore\\confbean\\fatecorespecialpropertycfg.lua",
  "@lua\\bny\\gen\\drc\\gsp\\fatecore\\confbean\\colorandstar2upcostintegration.lua",
  "@lua\\bny\\gen\\drc\\gsp\\fatecore\\confbean\\increaseonerankcfg.lua",
  "@lua\\bny\\gen\\drc\\gsp\\fatecore\\confbean\\fatecorecolor2squarenumcfg.lua",
  "@lua\\bny\\gen\\drc\\gsp\\fatecore\\confbean\\fatecoresquarenum.lua",
  "@lua\\bny\\gen\\drc\\gsp\\fatecore\\confbean\\fatecorerankctrlcfg.lua",
  "@lua\\bny\\gen\\drc\\gsp\\fatecore\\confbean\\cfatecoreitemcfg.lua",
  "@lua\\acoralprotocoltest\\data\\generate\\fatecore.lua",
];

const summary = [];
for (const t of targets) {
  let e;
  try { e = findEntry(t); } catch (err) { console.log(`MISS ${t}`); continue; }
  const best = extractConstants(e.bytes);
  const short = t.split("\\").pop();
  if (!best) { console.log(`${short.padEnd(45)} size=${String(e.bytes.length).padStart(9)}  no constants`); continue; }
  // trim leading/trailing nils
  let seq = best.seq;
  while (seq.length && seq[0].value === null) seq = seq.slice(1);
  while (seq.length && seq[seq.length - 1].value === null) seq = seq.slice(0, -1);
  const lines = seq.map((c, i) => {
    const v = c.value === null ? "nil" : typeof c.value === "bigint" ? c.value.toString() : typeof c.value === "number" ? String(c.value) : JSON.stringify(c.value);
    return `${String(i).padStart(5)}  ${c.kind.padEnd(4)} ${v}`;
  });
  fs.writeFileSync(path.join(outDir, short + ".txt"), lines.join("\n"), "utf8");
  summary.push({ short, size: e.bytes.length, count: seq.length, poolFrom: best.start, poolTo: best.end, file: short + ".txt" });
}

console.log("file".padEnd(45), "size".padStart(10), "consts".padStart(8), "  pool range");
for (const s of summary) console.log(s.short.padEnd(45), String(s.size).padStart(10), String(s.count).padStart(8), `  ${s.poolFrom}..${s.poolTo}`);
fs.writeFileSync(path.join(outDir, "_summary.json"), JSON.stringify(summary, null, 1));
