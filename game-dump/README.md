# 《龙族：卡塞尔之门》客户端数据提取报告

**来源**：手机（vivo V2458A / Android 16）上的 `com.zulong.drc.aligames`（阿里渠道包，当前在玩的账号）
**引擎**：UE4（工程名 `Azure`），Lua 脚本层 = 定制 Lua 5.4（标记 `\x1bLuaQ`）
**日期**：2026-09-19

---

## 一、提取成果

| 产物 | 路径 | 内容 |
|---|---|---|
| Lua 逻辑与配置（索引） | `lua.cat` / `data.cat` / `configs.cat` | 22,272 个 Lua 文件拼合体 |
| 完整配置数据库 | `bny/` | **2,262 张 `.bny` 配置表**（50.8 MB） |
| 命轮表结构 | `extract/*.txt` | fatecore 各表的字段名（schema） |
| 命轮协议定义 | `extract/fatecore.lua.txt` | 全部协议号、错误码、字段名 |
| 原始包 | `*.bin` | 从 APK 抽出的 8 个资源包 |
| 资源清单 | `saved_download_entry.dat` | 173,724 条资源文件索引 |

---

## 二、容器格式（已完全破解）

### 1. `res_base/package/*.png`（APK 内的资源包，实为伪装扩展名）

```
[ef 23 ca 4d]  魔数
[u32]          整个文件长度
[u32]          0
[56 a0 89 b7]  固定标记
--- 以下为 chunk 序列 ---
```

**zlib 型**（`configs` / `lua` / `data`）：chunk 就是首尾相接的 zlib 流，从 offset 16 开始。
**zstd 型**（`fight` / `plugins` / `scenes` / `engine` / `miscs`）：每块 22 字节块头

```
[4d 25 ed bc]  块标记
[u16]          flag (1 = zstd)
[u32]          解压后大小
[u16][u32][u16] 保留
[u32]          压缩后大小
--- zstd 帧 ---
```

**iguf 型**（热更包）：在块头前多 8 字节 `[58 af 5a 00][u32 总长]`，块头起点 +8。

### 2. Lua 文件条目格式

```
[1b 4c 75 61 51]   "\x1bLuaQ"
[00 01 04 04 04 08 00]
[u32]              文件名长度（含结尾 \0）
[文件名]           例：@lua\bny\gen\drc\gsp\fatecore\confbean\...
--- 定制 Lua 5.4 字节码 ---
```

**常量池沿用标准 Lua 5.4 tag**：
- `0x04` = 短字符串 → `[u32 长度含\0][字节]`
- `0x03` = 浮点（double, 8 字节）
- `0x13` = 整数（int64, 8 字节）
- `0x00/0x01/0x11` = nil / false / true

→ 所以**配置数据可以直接从常量池读出**，无需还原指令集。

### 3. `.bny` 配置数据库

位于 `data.png` 解压流中：
- `offset 10,687,128` 起为数据区
- `offset 68,594,577` 起为目录区，每条记录 **280 字节**

```
+0    文件名（bny\drc.gsp.<模块>.confbean.<表名>.bny，NUL 填充）
+256  [u32 0][u32 数据偏移][u32 0][u32 大小][u32 大小]
```

---

## 三、命轮（FateCore）模块 —— 与优化器直接相关

游戏内术语对照：

| 我们的叫法 | 游戏内 |
|---|---|
| 命轮 | **FateCore**（fatecore） |
| 宿命之轮 | **HolyCore**（holycore，圣核） |
| 阶 | **color**（颜色品质） |
| 星 | **star** |
| 元素 | FIRE / WIND / WATER / GROUND / **MENTAL**（精神） |

### 26 张命轮配置表

| 表 | 大小 | 推测用途 |
|---|---|---|
| `fatecorebasepropertycfg` | 6175 | **基础属性（按 color/type）** |
| `fatecorerankexpcfg` | 3631 | **升阶经验 / 命轮值** |
| `fatecorerankctrlcfg` | 226 | 阶位控制 |
| `fatecorespecialpropertycfg` | 1025 | 特殊属性 |
| `colorandstar2upcostintegration` | 1516 | **升星/变色消耗** |
| `increaseonerankcfg` | 2031 | 升一阶配置 |
| `cfatecoreitemcfg` | 3148 | 命轮道具 |
| `holycorecfg` | 210 | 圣核 |
| `holycoregeneratecfg` | 78 | 圣核生成 |
| `fatecoreconst` | 139 | 常量 |
| `fatecorecolorsequence` | 94 | 颜色序列 |
| `fatecorecolor2squarenumcfg` | 114 | 颜色→方格数 |
| …（共 26 张） | | |

### 关键协议字段（`extract/fatecore.lua.txt`）

- `FateCoreImproveStar` → `old_color, old_star, new_color, new_star, return_uuid_list`
- `FateCoreStarUpCostInfo` → `cost_info: map<int32, …>, color2cost_info`
- `FateCoreExpStatic` → `STATIC_ONE_EXP / STATIC_TWO_EXP / STATIC_FIVE_EXP / STATIC_DIRECTLY_LEVEL_UP`
- 错误码 `66131`~`66230`（`FATE_CORE_NEED_BREAK_THROUGH` 等）

### `fatecorebasepropertycfg` 字段（表结构）

```
id, basePropertyCfgId, basePropertyColor,
basePropertyType, basePropertyValue, basePropertyLevelUpGrowth
```

对应我们工具里的「阶 → 基础值 / 每级成长」。

---

## 四、数据获取路径（重要结论）

手机**未 root**，游戏**不可调试**，因此 `/data/data/com.zulong.drc.aligames` 读不到。

```
✓ APK (932MB)          → res_base 资源包 → Lua + .bny + uasset
✓ main.obb (11.5MB)    → UE4 pak (仅挂载这一个)
✓ 外部存储 5.5GB       → iguf 热更包 = UE4 资源（uasset），无配置
✗ 内部存储             → 需要 root
```

**结论**：`.bny` 配置数据的唯一可读来源就是本次提取的 `data.bin`，已全部拿到。

---

## 五、下一步（待定）

`.bny` 是自定义二进制格式（疑似「全局字符串表索引 + 定点字段」），要完整解码还需要
反编译 `libUE4.so` 里的 BnyDataTable 加载器，或者靠 schema（已拿到字段名与顺序）+ 数据推断。

优先级建议：
1. **`fatecorerankexpcfg`** —— 直接对应「命轮值」，可校验/修正优化器的核心规则
2. **`fatecorebasepropertycfg`** —— 校验「基础值 / 每级成长」
3. **`colorandstar2upcostintegration`** —— 校验升星消耗
4. 把 `extract/` 里的 schema 与 `bny/` 原始数据做结构化还原，生成优化器可直接用的 JSON
