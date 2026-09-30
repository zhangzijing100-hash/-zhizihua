// Lua 5.1 字节码解析器 —— 把常量表全部导出来。
//
// 游戏里的 *.lua 是 Lua 5.1 编译字节码（头 \x1bLuaQ）。
// 配置数据通常是生成的 Lua 表字面量，值就躺在函数原型的常量表里，
// 所以不用完整反编译，遍历常量表就够了。
//
// 头（12 字节）：signature(4) version(1) format(1) endianness(1)
//               sizeof(int)(1) sizeof(size_t)(1) sizeof(Instruction)(1) sizeof(lua_Number)(1) integral(1)

export function parseLua51(buf) {
  let p = 0;
  const sig = buf.subarray(0, 4).toString("latin1");
  if (sig !== "\x1bLua") throw new Error("不是 Lua 字节码");
  const version = buf[4];
  const littleEndian = buf[6] === 1;
  const sizeofInt = buf[7];
  const sizeofSizeT = buf[8];
  const sizeofNumber = buf[10];
  p = 12;

  const rd = {
    byte: () => buf[p++],
    int: () => { const v = littleEndian ? buf.readInt32LE(p) : buf.readInt32BE(p); p += sizeofInt; return v; },
    size: () => { const v = sizeofSizeT === 8 ? Number(buf.readBigUInt64LE(p)) : buf.readUInt32LE(p); p += sizeofSizeT; return v; },
    num: () => { const v = buf.readDoubleLE(p); p += sizeofNumber; return v; },
    str: () => { const n = rd.size(); if (n === 0) return null; const s = buf.subarray(p, p + n - 1).toString("utf8"); p += n; return s; },
  };

  const constants = [];
  const protos = [];

  function loadFunction(depth) {
    const source = rd.str();
    const linedefined = rd.int();
    rd.int();                       // lastlinedefined
    rd.byte();                      // nups
    rd.byte();                      // numparams
    rd.byte();                      // is_vararg
    rd.byte();                      // maxstacksize
    const nCode = rd.int();
    const code = new Array(nCode);
    for (let i = 0; i < nCode; i++) { code[i] = littleEndian ? buf.readUInt32LE(p) : buf.readUInt32BE(p); p += 4; }
    const proto = { source, linedefined, code, strings: [], numbers: [], k: [] };
    protos.push(proto);

    const nConst = rd.int();
    for (let i = 0; i < nConst; i++) {
      const t = rd.byte();
      if (t === 0) { proto.strings.push(null); proto.k.push({ t: 0, value: null }); }
      else if (t === 1) { const b = rd.byte(); proto.k.push({ t: 1, value: b !== 0 }); }
      else if (t === 3) { const n = rd.num(); proto.numbers.push(n); proto.k.push({ t: 3, value: n }); }
      else if (t === 4) { const s = rd.str(); proto.strings.push(s); proto.k.push({ t: 4, value: s }); constants.push(s); }
      else throw new Error(`未知常量类型 ${t} @${p}`);
    }
    const nProto = rd.int();
    for (let i = 0; i < nProto; i++) loadFunction(depth + 1);
    // debug
    const nLine = rd.int(); p += nLine * 4;
    const nLoc = rd.int(); for (let i = 0; i < nLoc; i++) { rd.str(); rd.int(); rd.int(); }
    const nUp = rd.int(); for (let i = 0; i < nUp; i++) rd.str();
    return proto;
  }

  loadFunction(0);
  return { version, protos, constants, numbers: protos.flatMap((x) => x.numbers) };
}

/** 把一个 lua 文件里的所有可打印字符串和数字都倒出来（按出现顺序） */
export function dumpLua(buf) {
  const r = parseLua51(buf);
  const out = [];
  r.protos.forEach((proto) => {
    if (proto.source) out.push({ kind: "source", value: proto.source });
    proto.strings.forEach((s) => { if (s != null) out.push({ kind: "string", value: s }); });
    proto.numbers.forEach((n) => out.push({ kind: "number", value: n }));
  });
  return out;
}
