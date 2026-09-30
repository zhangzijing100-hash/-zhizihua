import fs from "node:fs";
const doc = JSON.parse(fs.readFileSync("ocr-templates.json","utf8"));
const lines = [];
lines.push("// 命轮数量 OCR 的灰度模板（自动生成，勿手改）");
lines.push("// 生成脚本：game-dump/export-tpl.mjs；训练页：p00（亮底 UR/SSR）+ t01（过渡行）+ t03（暗底 SR/R）");
lines.push("// 每项是归一化灰度小块（Int8，长度 w*h）的 base64。");
lines.push(`export const PATCH_W = ${doc.w};`);
lines.push(`export const PATCH_H = ${doc.h};`);
lines.push("export const TEMPLATE_BASE64 = {");
for (const [k, list] of Object.entries(doc.t)) {
  lines.push(`  ${JSON.stringify(k)}: [`);
  for (const b of list) lines.push(`    ${JSON.stringify(b)},`);
  lines.push("  ],");
}
lines.push("};");
lines.push("");
fs.writeFileSync("../minglun-mobile/src/data/ocrTemplates.js", lines.join("\n"), "utf8");
console.log("已写出 minglun-mobile/src/data/ocrTemplates.js  " + (fs.statSync("../minglun-mobile/src/data/ocrTemplates.js").size/1024).toFixed(0) + " KB");
