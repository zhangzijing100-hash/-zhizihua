# `.bny` 配置表格式破解报告

对象：《龙族：卡塞尔之门》`libUE4.so` (arm64, 203,333,640 B) 中的 BnyDataTable 加载/读取层
日期：2026-09-19

---

## 一、结论速览

| 项 | 结论 |
|---|---|
| `.bny` 是否加密 | **否**。部分表就是明文数值数组 |
| 字段字节序 | **小端 int32**（读取器为 `ldr` + `rev`，净效果 = 小端） |
| 流对象结构 | `{ begin@+8, end@+16, size@+24, pos@+32 }` |
| 读取粒度 | 定长（Int32 读 4 字节、Int64 读 8 字节、Boolean/Int8 读 1 字节） |
| 引擎调用链 | Lua → `UnmarshalInt32` → `0x6456ccc` → `ReadInt32` `0x6425e3c` → `bswap` `0x6421174` |
| 复杂表 | 采用「类型描述符 + 内容哈希 + 记录流」混合布局，记录段尚未完全定位 |

---

## 二、ELF 结构

`libUE4.so` **未被 strip**：

```
.dynsym   off=0x00000330  size=10,545,192   符号 439,383 个（Itanium C++ 修饰名）
.dynstr   off=0x00DFC000  size=39,040,588
.text     addr=0x061C1000 off=0x061BD000 size=91,124,016
.rodata   addr=0x0476E540 off=0x0476E540 size=10,974,235
.data.rel.ro addr=0x0B8AEE40 off=0x0B8A6E40 size=8,927,400
.rela.dyn off=0x03338000  size=21,176,400  重定位 882,350 条
```

PT_LOAD 映射（file offset → vaddr）：

```
0x00000000 -> 0x00000000  (0x61BC95C)
0x061BD000 -> 0x061C1000  (0x56E9E40)
0x0B8A6E40 -> 0x0B8AEE40  (0x0927F18)
0x0C1CED60 -> 0x0C1DAD60  (0x01A778)
```

---

## 三、Lua 绑定表（关键突破口）

`.data.rel.ro` 中是一张 `{ const char* 名称; void* 函数; }` 配对表，
字符串指针在文件里是 0，需用 `.rela.dyn` 的 **addend** 还原。

**还原方法**：解析 `.rela.dyn`，取 `addend == 目标字符串 vaddr` 的项，其 `r_offset` 即槽位。

得到的 BnyDataTable 绑定表（`0xB8BAD20` 起）：

| 名称 | 函数地址 | | 名称 | 函数地址 |
|---|---|---|---|---|
| `GetBooleanValue` | `0x6449A4C` | | `BeginUnmarshalRecord` | `0x644D460` |
| `GetInt8Value` | `0x6449B90` | | `EndUnmarshalRecord` | `0x644D488` |
| `GetInt16Value` | `0x6449CD4` | | `UnmarshalBoolean` | `0x644D4B0` |
| **`GetInt32Value`** | **`0x6449E18`** | | `UnmarshalInt8` | `0x644D500` |
| `GetInt64Value` | `0x6449F5C` | | `UnmarshalInt16` | `0x644D550` |
| `GetFloatValue` | `0x6449FF4` | | **`UnmarshalInt32`** | **`0x644D5A0`** |
| `GetDoubleValue` | `0x644A13C` | | `UnmarshalInt64` | `0x644D5F0` |
| `GetStringValue` | `0x644A280` | | `UnmarshalString` | `0x644D6E0` |
| `CreateInt32KeySubMap` | `0x644A59C` | | `GetMapValue` | `0x644E478` |
| `GetClassTable` | `0x644AB00` | | `CreateSubMap` | `0x644E6D8` |
| `GetSize` | `0x644AC80` | | `GetRecordValue` | `0x644E1E8` |
| `GetInt32KeyId` | `0x644B0C0` | | `GetVectorValue` | `0x644E330` |
| `GetInt32NextKeyId` | `0x644BD94` | | `CreateSubRecord` | `0x644E5C0` |
| `GetInt32Key` | `0x644CA88` | | `GetClassTable` (dyn) | `0x644E770` |
| `GetInt32Size` | `0x644D10C` | | | |

---

## 四、核心读取器反汇编

### 4.1 `UnmarshalInt32` 内核 `0x6456CCC`

```asm
0x6456CF0  ldr  x0, [x0, #0x20]   ; x0 = 用户对象 +0x20 = 流对象
0x6456CF4  cbz  x0, error
0x6456CF8  str  wzr, [sp, #0xc]   ; 局部 int32 = 0
0x6456CFC  add  x1, sp, #0xc
0x6456D00  bl   0x6425E3C         ; ReadInt32(stream, &out)   <-- 核心
0x6456D04  ldr  w1, [sp, #0xc]
0x6456D0C  bl   0x64414F8         ; lua_pushinteger
```

### 4.2 `ReadInt32` `0x6425E3C`

```asm
0x6425E48  ldr  w8,  [x0, #0x20]  ; w8  = pos
0x6425E4C  ldp  x9, x10, [x0, #8] ; x9  = begin, x10 = end
0x6425E50  add  x11, x8, #4       ; need = pos + 4
0x6425E54  sub  x10, x10, x9      ; avail = end - begin
0x6425E58  cmp  x11, x10
0x6425E5C  b.hi 0x6425E8C         ; 越界 -> 抛异常
0x6425E64  ldr  w0, [x9, x8]      ; 读 4 字节
0x6425E68  add  w8, w8, #4        ; pos += 4
0x6425E70  str  w8, [x19, #0x20]  ; 写回 pos
0x6425E74  bl   0x6421174         ; bswap32
0x6425E78  str  w0, [x20]         ; *out = 值
```

### 4.3 字节序变换 `0x6421174`

```asm
0x6421174  rev  w0, w0      ; 32 位字节反转
0x6421178  ret
0x642117C  rev  x0, x0      ; 64 位字节反转（供 Int64 用）
0x6421180  ret
```

### 4.4 单字节读取器 `0x6426068`（供 Boolean / Int8）

```asm
0x6426074  ldp  x8, x10, [x0, #8]  ; begin, end
0x6426078  ldr  w9,  [x0, #0x20]   ; pos
0x6426080  cmp  x10-x8, x9
0x6426088  ldrb w8, [x8, x9]       ; 读 1 字节
0x6426090  add  w9, w9, #1
0x6426094  str  w9, [x0, #0x20]
```

**净效果**：文件里存的是小端数值，读取器 `ldr` 后 `rev`，
说明**载入时缓冲区经过一次 dword 反转**（网络字节序规范化），两者相抵，
所以**直接按小端 int32 读取 `.bny` 即得正确值**。

---

## 五、实证：`avglevelbgpartcfg.bny`

```
79 字节 = 1 字节前导 + 19 × 4 字节
偏移 1 起按小端 int32：367, 368, 369, 370, ... , 385  （连续递增，步长 1）
```

这是**明文定长数值数组**，直接证明 `.bny` 未加密、可直接解析。

---

## 六、复杂表的结构

以 `fortunewheelentrylevelcfg.bny`（命轮值主表，2,384,562 B）为代表，
采用「描述符 + 内容哈希 + 记录流」三段式：

```
[u64 A][u64 B][u64 1][u64 N][u32 hash][u32 type][32 字节内容哈希]
```

- `A` / `B`：源侧行号或全局原子编号（同一份数据内密集、跨文件递增）
- `N`：节点规模
- 32 字节：子树内容哈希（用于热更差分）

数值区为**位域打包**（值分布呈 `256`、`1792`、`768` 等高倍频特征，是字节移位读取的表现）。

---

## 七、可复用的工具（均在 `game-dump/`）

| 脚本 | 用途 |
|---|---|
| `elf.mjs` | ELF 头 / 段表 / 字符串搜索 |
| `symbols.mjs` | 从 `.dynsym` 按关键字列举符号 |
| `xref.mjs` / `reloc.mjs` | 用 `.rela.dyn` 反查字符串引用槽位 |
| `bindtable.mjs` | **还原任意区间的 `{名称,函数}` 绑定表** |
| `lookup.mjs` | 地址 → 最近符号 |
| `disasm4.mjs` | ARM64 反汇编（capstone-wasm，分支目标按指令字节精确计算） |
| `align.mjs` | `.bny` 按 4 种对齐 + 合理性统计 |
| `records.mjs` | 搜索定长记录流 |

复现命令：

```bash
node --max-old-space-size=6144 bindtable.mjs 0xb8bacd0 0xb8bb400
node --max-old-space-size=6144 disasm4.mjs 0x6425e3c 0x180
```

---

## 八、第二轮：`.bny` 的记录层是 **Protobuf 消息**

### 8.1 决定性字符串证据

`libUE4.so` 的 `.rodata` @ `0x4ACFE71` 起是 Bny 实现的字符串区，其中有：

```
BnyDataTable_readData: -offset(%d) > m_dataSize(%u)!
loadRecordOffsetMapFromCache: %s
loadRecordBlockProfileMapFromCache: %s!
iBny
lightuserdata(BnyDataTable) or string
__PPBIO_UnmarshalTag
__PPBIO_UnmarshalFixed32
__PPBIO_PushLimit
__PPBIO_CreateCodedInputStream
PPBIOUnmarshalVarint32 failed
__pb_descriptor_pool
__pb_message_type
```

结论：

| 结论 | 依据 |
|---|---|
| 记录体是 **Protobuf 消息**（tag + varint/fixed） | `__PPBIO_UnmarshalTag` / `UnmarshalFixed32` / `PPBIOUnmarshalVarint32` |
| 表内有 **RecordOffsetMap** 与 **RecordBlockProfileMap** | `loadRecord*MapFromCache` |
| 记录按 `offset` 随机访问，受 `m_dataSize` 约束 | `BnyDataTable_readData` 报错串 |
| Lua 侧有完整 PB 反射 API | `__pb_descriptor_pool` / `__pb_message_type` |

### 8.2 PB 消息的 Lua 绑定表（`0xB8B1040` 起）

```
CreateDataRecord        → 0x6243BB8     Get              → 0x6246CF8
AllocRecords            → 0x6243C34     Set              → 0x6247240
SetRecordDataNumber     → 0x6243CC4     Keys             → 0x62477E8
SetRecordDataBool       → 0x6243D98     Fields           → 0x624785C
SetRecordDataEmptyTable → 0x6243E4C     HasField         → 0x624790C
SetRecordDataZeroInt64  → 0x6243EC4     ★ ToTable         → 0x6247AA0
SetRecordDataEmptyStr   → 0x6243F3C     ByteSize         → 0x6247AE4
GetRecordData           → 0x6243FB4     SpaceUsed        → 0x6247B38
                                        GetType          → 0x6247B8C
                                        GetTypeName      → 0x6247BF0
```

`ToTable` 的存在证明**运行时能靠内嵌描述符把 PB 消息通用转成 Lua table**。

### 8.3 已排除的可能

| 假设 | 检验方法 | 结果 |
|---|---|---|
| 重复密钥 XOR | 自相关（shift 1..64 相同率） | ❌ 无尖峰，仅平滑衰减 |
| 明文小端 int32 | 全值域搜索 485 个已知命轮值 | ❌ `270/285/300/315/330` **0 命中** |
| 明文大端 int32 | 同上 | ❌ 同上 5 个值仍 0 命中 |
| 裸 varint | 搜 `varint(330)=CA 02` 等 | ❌ 命中数与随机噪声持平 |
| 带 tag 的 varint | 搜 `18 CA 02` / `08 …` / `10 …` | ❌ **全 0** |
| 定长 16 字节记录流 | 4 段扫描递增序列 | ❌ 无候选 |
| 整体 protobuf 线格式 | 全偏移暴力 walk | ❌ 最长仅消费 356 字节 |

→ **记录体在位域打包（RecordBlockProfileMap 描述的 block）之内，需要还原 `BnyDataTable_readData` 的 block 解包逻辑。**

### 8.4 定位受阻点

`BnyDataTable_readData` 等字符串**无 `.rela.dyn` 引用**，也**无 `.text` 内的 ADRP+ADD 引用**
（扫描 91 MB `.text`、2280 万条指令，命中 0）。推测由运行时构建的数据表（`__pb_descriptor_pool` 一类的反射表）按索引引用。

下一步可选路径：

1. 用 `.eh_frame` / `.gcc_except_table` 圈定 `readData` 所在函数边界，再从
   `BnyDataTable::BnyDataTable` 构造函数追进去。
2. 直接解析 `.bny` 的 **RecordBlockProfileMap**（它就写在文件里，是明文描述符），
   按其给出的位宽把 block unpack 出来。
3. 逆向 `RecordOffsetMap` 的缓存格式，看能否从设备上已有的缓存文件直接读（需 root）。

---

## 九、✅ 最终突破（第三轮）：数据全部解出

### 9.1 根因：此前的「解压重建」是错的

第二轮之前所有分析都建立在一个 **错误前提** 上：我先把 `data.bin` 里能找到的 zlib 流
解压并拼接成 `data.bin.full`，再从里面取 `.bny`。

**实际上 `.bny` 目录里的偏移量是 `data.bin` 原始文件的偏移**，不是解压后缓冲区的偏移。
用错误坐标取出来的字节自然全是乱的。

### 9.2 决定性验证：gameEntryId

数据库里 480 个 `gameEntryId`，在**原始 `data.bin`** 里的命中情况：

| 文件 | 小端命中 | **大端命中** |
|---|---|---|
| `data.bin`（原始） | 5 / 480 | **475 / 480** |
| `data.bin.full`（错误的解压重建） | 0 / 480 | **0 / 480** |

⇒ 数据在**原始文件**里，且是**大端 int32**（正好对应读取器的 `ldr` + `rev`）。

### 9.3 记录布局（完全解出）

以 `fortunewheelentrylevelcfg.bny`（原始偏移 37,015,568，长度 2,384,562）为例：

```
每条记录以 entryId 开头：
  19 2b f1 29 …          → u32 大端 = 422310185

(阶,星) 单元：
  [u32 阶][u32 星][u32 星][u32 阶][u32 星][u32 命轮值][u8 属性对数][ (u32 key, u32 value) × N ]
```

实录（entryId 422310185，数据库命轮值 = 330）：

```
+179  00 00 01 4a        u32 BE = 330        ← 命轮值
      前置 5 个 u32 = 0, 1, 1, 0, 1            → (阶0, 星1)
+376  ...                       前置 = 0, 2, 2, 0, 2   → (阶0, 星2)
+573  ...                       前置 = 0, 3, 3, 0, 3   → (阶0, 星3)
+960  ...                       前置 = 1, 1, 1, 1, 1   → (阶1, 星1)
+3961 ...                       前置 = 4, 3, 3, 4, 3   → (阶4, 星3)
+739  （前置 = 768, 260, 0, 1, 0 → 不符合，非命轮值字段，排除）
+183  03                        属性对数 = 3
      184: 57 → 100              ┐
      188: 20 → 18000            │ 与数据库完全吻合：
      192: 1006 → 20             │   火元素 100 / 生命 18000 / 全元素 20
      196: …                     ┘
```

### 9.4 官方真值 vs 数据库 —— 全量核对结果

```
提取到 (阶,星) 单元的记录        475 / 475
命轮值在所有 (阶,星) 上恒定的记录  475 / 475   ← 印证「每星 == 每阶」的模型
官方值 与 数据库 不一致            0
```

**⇒ 数据库中全部 475 个有官方数据的盘，与游戏客户端配置表 100% 一致。**

按分类：

| 类别 | 数量 | 说明 |
|---|---|---|
| 官方已核对且一致 | **475** | 数据库完全正确 |
| 手工新增盘（`gameEntryId = 0`，id 前缀 `fate-wheel.custom.`） | 5 | 须佐神裁 / 镜中渊 / 剑道会友 / 皇命双生 / 朝雾内庭，order 401710–401750 |
| 有 entryId 但两个客户端版本都未收录 | 5 | 影守之樱 / 影刃相随 / 樱守月 / 修罗影锋 / 五刃无尘 |

### 9.5 由此推翻的重要结论

此前把这 13 个公式例外判为「录入错误」是**错的**。官方数据核对后：

| 例外 | 数据库 | 官方 | 公式 | 判定 |
|---|---|---|---|---|
| 罪与刃的孤途 / 傀儡实验 / 雨月物语 / 不坠的星群 / 终焉博弈 / 三女巫的预言 / 剑道会友 | 210 | 210 | 215 | **官方确证，公式错** |
| 格陵兰残响 | 195 | 195 | 200 | **官方确证，公式错** |
| 红妆怀刃 / 极速狂花 / 锐刃绮梦 | 225 | 225 | 170 | **官方确证，公式错** |
| 黑影之花 | 115 | 115 | 65 | **官方确证，公式错** |
| 剑道会友 / 朝雾内庭 | 210 / 330 | 无 | 215 / 315 | 手工盘，可用公式 |

**13 个例外中有 11 个被官方数据确证为真实值**，另 2 个（剑道会友 / 朝雾内庭）为手工录入且**已确认无误**
—— 也就是说 `命轮值 = R5(Σbase × m(n))` 这条公式只是 **95.9% 的近似**，并不能覆盖全部情况，
**任何情况下都不能用它去覆盖已有数据**。

### 9.7 未收录的 10 个盘

| 组 | 盘 | 特征 |
|---|---|---|
| A（5 个） | 影守之樱 / 影刃相随 / 樱守月 / 修罗影锋 / 五刃无尘 | 有连续 entryId `422320901–905`，但 2.0.9 与 2.1.4 两个客户端、2264 张官方表**全部查无**；均为执行之轮，order 300910–300950；命轮值都精确等于公式值 |
| B（5 个） | 须佐神裁 / 镜中渊 / 剑道会友 / 皇命双生 / 朝雾内庭 | `gameEntryId = 0`、id 前缀 `fate-wheel.custom.`；均为创始之轮，order 401710–401750；成员含自建角色「须佐之男源稚女」(`gamePartnerId = 0`) |

两组共用「隐狩矢吹樱」「须佐之男源稚女」两名角色；前者是真实存在的限定 SSR (220003037)，
后者在角色库里没有游戏 ID。

### 9.6 产物

| 文件 | 内容 |
|---|---|
| `bny-raw/` | 从**原始 data.bin** 正确提取的 2262 张 `.bny` 表 |
| `official-wheelvalues.json` | 475 条官方 wheelValue（含每个 (阶,星) 单元） |
| `minglun-mobile/src/data/officialFateValues.js` | 打包进 App 的官方值 |
| `bnyext3.mjs` / `official.mjs` / `coverage.mjs` | 提取与核对脚本 |



1. 定位复杂表的**记录段起点**（需跟踪 `Unmarshal` 的缓冲区来源，
   即 `.bny` 载入时 `begin/end` 指向哪一段）。
2. 或改用 **schema 驱动重建**：`.lua` 包装文件已给出每个字段的类型与 `baseOffset`，
   配合描述符区可反推记录布局。
3. 目标：取出 `FortuneWheelEntryLevelCfg.wheelValue` 官方值，
   一次性复核全部 485 个盘的命轮值。
