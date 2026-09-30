# 模拟器 root 直读 —— 逆向进展

> 2026-09-19 / 20。目标：不靠截图 OCR，直接从游戏里把命轮库存读出来。
> 环境：MuMu 模拟器（Android 15 / x86_64），游戏 **arm64 + ARM 翻译**。

---

## ✅ 一、拿到 root

```
adb connect 127.0.0.1:7555     # MuMu 的调试端口（5555 也开着）
adb root                       # → restarting adbd as root
adb shell id                   # uid=0(root) ✓
```

**只有模拟器能这样**（手机 `ro.debuggable=0`、无 su）。
⚠️ 因为游戏是 `arm64-v8a` 靠 MuMu 的 **ARM 二进制翻译**在跑，
**Frida 基本用不了**（x86_64 的 frida-server 挂不进翻译层）。
所以走的是**纯内存扫描 + 静态逆向**路线。

## ✅ 二、确认磁盘上没有库存

有了 root 就能完整看 `/data/data/<pkg>/`：

- `databases/` —— 全是腾讯 GCloud SDK 的 `Nearx_*` 表
- `files/UE4Game/` —— 只有 Config 和 Log
- `files/cache/` —— 证书、网络缓存

**库存只在服务器和内存里**，和之前手机上的结论一致。

## ✅ 三、逆出了游戏资源包 `*.png` 的格式 ★

游戏的内容全在 `assets/res_base/package/*.png` 里（名字叫 png，其实是归档）：

```
0x00  4B  magic  EF 23 CA 4D
0x04  4B  解压后总大小
0x08  4B  0
0x0C  4B  magic  B7 89 A0 56
0x10  4B  magic  20 78 2A 7B      ← 短头到这儿就结束，数据紧跟其后
0x14  4B  03 00 02 00             ← 长头才有
...       "Azure File Package, Loong Co. Ltd. All Rights Reserved."
          然后是一串 zlib 流（一条 = 一个文件）
          最后是若干 **280 字节的「名字记录」**，与内容**按顺序一一对应**
```

**名字记录的布局**（关键）：

```
0x000..0x103   以 NUL 结尾的路径，后面补 0
0x104  uint32  数据在包内的偏移
0x10C  uint32  数据长度
0x110  uint32  数据长度（同上）
0x114  uint32  0
```

⚠️ 坑：`.bny` 配置表是**未压缩**存的，zlib 扫描器发现不了它们 ——
必须靠名字记录里的偏移/长度去取。差的那 2396 条正好等于 `.bny` 的数量。

**工具**：`game-dump/unpackpng.mjs`

```
emu/lua.png      → 42,624 条 Lua 文件（0.6 秒解完）
emu/data.png     → 17,366 条（7,485 内容 + 9,881 名字记录）
emu/configs.png  →     70 条（35 内容 + 35 名字，1:1 验证通过）
```

## ✅ 四、Lua 5.1 字节码解析

游戏的 `*.lua` 是 **Lua 5.1 编译字节码**（头 `\x1bLuaQ`，size_t = 4 字节）。
写了一版常量表提取器（`game-dump/luadump.mjs`），不用完整反编译就能把
字符串常量和数字常量全倒出来 —— 配置类的字段名、路径都在这儿。

## ✅ 五、拿到命轮物品配置

配置表是 `.bny` 格式，一串定长记录，每条开头 4 字节标记 `19 2E D6 XX`（XX 是记录序号），
字段是**大端 int32**。

```
bny\drc.gsp.fortunewheel.confbean.cfortunewheelitemcfg.bny
  偏移 40380812  长度 13602  记录长 72×74 条
  [86, 0, 1, 2, 100506002, 5, 3, 1]     ← 第 5 个字段就是物品 id
```

**工具**：`game-dump/bny.mjs` → 提取出 **37 个命轮物品 id**，存 `emu/fw-item-ids.json`

## ✅ 六、★ 找到确切的数据路径 ★

`lua.png` 里 `@lua\modules\wheeloffortune\gui\fortunestarbagpanel.lua`
的字符串常量把 API 全写出来了：

```
WheelOfFortuneMgr . GetAllFortuneStarItemIdList   ← 取所有命轮物品 id 列表
                    GetItemCanConsumeNumber       ← 取某个 id 的「可消耗数量」= 面板上显示的数字
                    GetItemBaseCfg                ← 物品基础配置
字段: itemId / num / rarity / color / sort
```

**这就是面板上那些数字的真正来源。** 下一步顺着 `WheelOfFortuneMgr` 找它把数量存哪。

## 🎯 六-b、★ 找到确切的数据路径 ★

顺着 `FortuneStarBagPanel` 的 Lua 一路追下去：

```lua
-- lua/modules/wheeloffortune/gui/fortunestarbagpanel.lua
WheelOfFortuneUtility.GetAllFortuneStarItemIdList()   -- 取所有命轮物品 id
WheelOfFortuneMgr.GetItemCanConsumeNumber(itemId)     -- 取「可消耗数量」= 面板上那个数字

-- modules/wheeloffortune/wheeloffortuneutility.lua
GetItemCanConsumeNumber → Item.GetItemNumber(itemId) + 商店可购数

-- modules/item/iteminterface.lua（46KB，物品系统门面）
GetBagIdByItemId / GetBag / GetItemNumber / GetItemNumberById / GetBagItemList

-- 数据层 modules/item/bag.lua
Bag 字段：bagid, capacity, slot2ItemMap, uuid2slotIndex, itemId2Num  ← ★库存就在这
-- 数据层 modules/item/itemdata.lua
ItemData 字段：bags  ← 所有背包

-- 服务器同步 modules/item/itemprotocols.lua
OnSSyncItemStorageInfo：items = { id, num, bound, extra_map, extra_binary_map, uuid }
OnSSyncItemStorageChangeInfo：grid2ItemId / grid2AddNum（增量）
```

**结论：命轮库存 = `ItemData.Instance().bags[*].itemId2Num`（Lua 表，{物品id → 数量}）。**

## 🎁 六-c、顺带挖到：游戏自带**调试控制台**

```
lua/core/debug/debugman.lua          ← 管理器（34KB）
lua/core/gui/ecpaneldebuginput.lua   ← 控制台面板（46KB）
configs/debugcommandscfg.lua         ← 客户端命令表（10803 B）
configs/gm/servercommands.lua        ← 服务器 GM 命令表（7519 B，需 .gm on）
```

**客户端命令**里几个有用的：

| 命令 | 作用 |
|---|---|
| `print_text_widget [file_path]` | **打印全部文本控件的名字和内容**（能导文件！） |
| `print_cur_panel` / `print_all_panel` | 打印当前/所有面板 |
| `notifydata [entry] [count]` | 查看/修改 Entry 数值 |
| `dumpid` | 打印 openId / roleId / userId |
| `fightvalue partnerId` | 显示客户端与服务器分别算的战力 |
| `protologlevel` | 协议日志级别 |

**服务器 GM 命令**（`.gm on` 之后可用）：

| 命令 | 作用 |
|---|---|
| **`.additem id n`** | **增加物品**（做「改一个数再 diff」实验的钥匙） |
| `.addname 名字 n` | 按名字增加物品 |
| `.addcurrency 类型 值` | 增加货币 |
| `.get_count_limit 配置Id` | 通用限次查询 |

**开关**：`debugman.lua` 用 `console.flag` + `HasDebugPath` 判断；
`zdirutility.lua` 里有 `disable_console` / `zdir_flag` 两个标志文件。
控制台是**多指手势**打开的（`Input.GetInputSituationProxy` + `OnPreTouchDown/Move/Up`，数字常量里多次出现 3）。

⚠️ **两个卡点**：
1. **多指手势没法用 `adb shell input` 合成**（`input` 只支持单点触摸）。要么 `sendevent` 直接写 /dev/input，要么人手在模拟器上比。
2. 就算开了控制台，**也没有「查询背包」的命令** —— 只有 `.additem` 这类**改**的命令。
   但它正好能干「改一个数再 diff」。

## 🚧 七、内存扫描：现在的状态

写了个 dex 内存扫描器（`game-dump/tools/MemScan.java`，`javac --release 8` + `d8` 编成 dex，
用 root 的 `app_process` 跑）。支持**通配符** `??` 和**命中处上下文 dump**。

```
CLASSPATH=/data/local/tmp/memscan.dex app_process /system/bin MemScan <pid> <hex模式> ...
```

**已验证**：搜「物品详情」的 UTF-16 → 命中 ✓（扫描器本身没问题）

**已找到**：物品 id 在内存里，结构很规整：

```
[0: int64 物品id] [8: int64 = 4] [16: 指针] ...
  100506002 → 4
  100506006 → 4
  100506009 → 4
  100506008 → 4
```

**但全是 4** —— 这是**配置缓存**（`GetItemBaseCfg` 的结果），不是玩家的库存。
玩家的 `{itemId → 数量}` 表还没定位到。

### 下一步（按优先级）

1. **先读 `WheelOfFortuneMgr` 的 Lua**：看 `GetItemCanConsumeNumber` 从哪个表取数。
   那会告诉我们库存表的形态（Lua table？C++ map？），扫描时好定位。
   ```js
   // 找文件：@lua\...\wheeloffortune\...mgr.lua
   ```
2. **搜「同时出现多个物品 id」的内存区**：库存表应当集中持有玩家**拥有的**那批 id，
   而配置缓存是全部 id。找「id 集合较小且密集」的区。
3. **改一个值再 diff**：在游戏里升一次命轮（消耗材料），前后各 dump 一次对比 ——
   变化的那几个字节就是库存。这条最稳，但要动账号。

## 📁 产出文件

| 文件 | 作用 |
|---|---|
| `game-dump/unpackpng.mjs` | 解 `*.png` 资源包（zlib 流 + 名字记录） |
| `game-dump/luadump.mjs` | Lua 5.1 字节码常量提取 |
| `game-dump/bny.mjs` | 读资源包的「名字记录」、按偏移取文件、解析 `.bny` |
| `game-dump/tools/MemScan.java` | dex 内存扫描器（通配符 + 上下文 dump） |
| `game-dump/emu/fw-item-ids.json` | 命轮物品 id 列表 |
| `game-dump/emu/Azure.log` | UE4 日志（面板打开流程全在里面） |
| `game-dump/emu/base.apk` | 从模拟器拉下来的游戏 APK（923 MB） |

## 🔧 常用命令

```powershell
$adb = "C:\Users\Ricairo\Desktop\栀子花\.android-tools\sdk\platform-tools\adb.exe"
$env:ANDROID_SERIAL = "127.0.0.1:7555"
& $adb root
& $adb shell "pidof com.zulong.drcqd.nearme.gamecenter"

# 解包
cd game-dump
node unpackpng.mjs emu/lua.png

# 内存扫描（先编 dex）
cd tools
$env:JAVA_HOME = "C:\Users\Ricairo\Desktop\栀子花\.android-tools\jdk\jdk-21.0.12+8"
& "$env:JAVA_HOME\bin\javac.exe" --release 8 -Xlint:-options -d out MemScan.java
& "C:\Users\Ricairo\Desktop\栀子花\.android-tools\sdk\build-tools\35.0.0\d8.bat" --output out --min-api 26 out\MemScan.class
& $adb push out\classes.dex /data/local/tmp/memscan.dex
```

> ⚠️ 老规矩：**别用 PowerShell 的 `Set-Content` / `Add-Content` 改带中文的文件**，会把整份重编码成乱码。
