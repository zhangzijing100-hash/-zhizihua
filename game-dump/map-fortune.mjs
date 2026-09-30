// 把 printfortunewheel 的库存对到 App 的伙伴名上
import { readFileSync, writeFileSync } from "node:fs";

const inv = JSON.parse(readFileSync("fortune-inventory.json", "utf8"));
const wb = JSON.parse(readFileSync("../minglun-mobile/src/data/workbench.json", "utf8"));
const chars = wb.characters.map((c) => ({ id: c.id, name: c.name, rarity: c.rarity, isLimited: !!c.isLimited }));

const total = inv.total.filter((r) => r.name.startsWith("命轮·"));
// 去掉「命轮·」前缀和可能的形态前缀
const FORMS = ["龙刃", "隐狩", "剑御", "影镰", "天演", "月读命", "须佐之男命", "弑罪", "巫女", "龙马", "皇女", "天照命"];

function match(name) {
  const bare = name.replace(/^命轮·/, "");
  const cands = [bare];
  for (const f of FORMS) if (bare.startsWith(f)) cands.push(bare.slice(f.length));
  for (const c of cands) {
    const exact = chars.find((x) => x.name === c);
    if (exact) return { ...exact, how: c === bare ? "完全相同" : `去形态前缀「${bare.slice(0, bare.length - c.length)}」` };
  }
  // 包含匹配
  const inc = chars.find((x) => bare.includes(x.name) || x.name.includes(bare));
  if (inc) return { ...inc, how: "包含匹配" };
  return null;
}

console.log("命轮名\t\t\t\t数量\t→ 伙伴\t\t\t匹配方式");
const rows = total.map((r) => {
  const m = match(r.name);
  console.log(`${r.name}\t${r.left}\t→ ${m ? m.name + `(${m.rarity}${m.isLimited ? "/限定" : ""})` : "❌未匹配"}\t${m ? m.how : ""}`);
  return { wheelName: r.name, itemId: r.id, count: r.left, used: r.used, partner: m?.name ?? null, partnerId: m?.id ?? null, how: m?.how ?? null };
});

const have = rows.filter((r) => r.count > 0);
const unmatched = rows.filter((r) => !r.partner);
console.log(`\n合计 ${rows.length} 个命轮 / 有货 ${have.length} 个 / 未匹配伙伴 ${unmatched.length} 个`);
if (unmatched.length) console.log("未匹配: " + unmatched.filter(r=>r.count>0).map((r) => r.wheelName).join("、"));

writeFileSync("fortune-partner-inventory.json", JSON.stringify(rows, null, 2), "utf8");
console.log("\n→ fortune-partner-inventory.json");
