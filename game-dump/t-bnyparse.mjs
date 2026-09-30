import { readNameRecords, readFile, parseBny } from "./bny.mjs";
const pack = "emu/data.png";
const recs = readNameRecords(pack);
console.log(`名字记录共 ${recs.length} 条`);
const pick = (kw) => recs.find(r => r.name.toLowerCase().includes(kw));
for (const kw of ["cfortunewheelitemcfg.bny", "fortunewheelitem2entrycfg.bny", "fortunewheelentrylevelcfg.bny"]) {
  const r = pick(kw);
  if (!r) { console.log(`${kw} 没找到`); continue; }
  const data = readFile(pack, r);
  const { recordSize, records } = parseBny(data);
  console.log(`\n=== ${r.name} ===`);
  console.log(`  偏移 ${r.offset} 长度 ${r.size}  记录长 ${recordSize}  共 ${records.length} 条`);
  records.slice(0, 6).forEach(rec => {
    console.log(`   #${rec.index}: [${rec.ints.slice(0, 8).join(", ")}]`);
  });
}
