import fs from "node:fs";
const buf = fs.readFileSync("emu/libUE4-arm64.so");
console.log(`libUE4.so ${(buf.length/1048576).toFixed(1)} MB`);
// 找 Lua 版本字符串
const keys = ["Lua 5.1", "Lua 5.2", "Lua 5.3", "Lua 5.4", "LuaJIT", "lua_State", "lua_getfield", "lua_rawgeti", "LUA_VERSION", "luaL_newstate", "wLuaCore", "wLua"];
for (const k of keys) {
  let n = 0, first = -1;
  let i = -1;
  while ((i = buf.indexOf(k, i + 1)) >= 0 && n < 1000) { if (first < 0) first = i; n++; }
  console.log(`  "${k}": ${n === 0 ? "无" : n + " 处，首个偏移 0x" + first.toString(16)}`);
}
// 找形如 "Lua 5.x" 的字符串
const s = buf.toString("latin1");
const m = [...s.matchAll(/Lua \d\.\d[^\x00]{0,40}/g)].slice(0, 10).map(x => x[0]);
console.log("\n出现的 Lua 版本串:", JSON.stringify([...new Set(m)]));
const m2 = [...s.matchAll(/\$LuaVersion:[^\x00]{0,20}/g)].slice(0,5).map(x=>x[0]);
console.log("LuaVersion 标记:", JSON.stringify(m2));
