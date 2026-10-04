# 栀子花2

《龙族：卡塞尔之门》的**命轮升级规划工具**（安卓端）。

录入你拥有的命轮和碎片，设定优化目标，它用混合整数规划（HiGHS WASM，跑在手机本地）
算出**全局最优**的升级顺序 —— 怎么升最省、先升谁、哪些盘值得开宿命之轮。

**完全离线**：只有一条 `INTERNET` 权限，不读游戏文件、不跟游戏通信、不修改任何游戏数据。
装完就能用，不需要 root、不需要 Shizuku、不需要电脑。

---

## 下载

**[栀子花2.apk](栀子花2.apk)** —— 5.0 MB · versionCode 1 · 包名 `com.minglun.app.manual`

直接装，或者看 [使用说明.md](使用说明.md)。

---

## 功能

| | |
|---|---|
| **优化目标** | 选要优化的属性（攻/生/物防/法防/元素/命轮值…）并设权重 |
| **参考基础属性** | 录当前面板，把百分比收益折算成实际点数 |
| **资源录入** | 按品质分组录 63 个伙伴的命轮数与碎片数 |
| **求解** | 宿命之轮开关 · SSR 自选数量 · 忽略碎片品质组 · 可取消 · 显示属性加成 |
| **求解历史** | 每次自动存档，可查看 / 单删 / 批量删除 + 全选 |
| **导入导出** | 玩家数据（含历史）与数据库都能存成 JSON 互传 |
| **开发者模式** | 自己改命轮库：加盘、改成员、调全局设置 |
| **外观** | 自定义背景（透明度 / 模糊 / 缩放） |

**结果按游戏盘序排列**：先分「创始之轮 → 执行之轮 → 物质之轮 → 宿命之轮」，
组内顺序取自**游戏配置里的排序键**（不是猜的，用实拍验证过），照着往下加点就行。

**内置数据**：63 个伙伴 / 485 个关系盘 / 475 条与游戏一致的官方命轮值。

---

## 目录

```
栀子花/
├── minglun-mobile/        App 工程（前端 + 安卓原生壳）
├── game-dump/             游戏解包与逆向工作区（3 GB，不入库）
├── _archive/              归档：不再参与开发但没删的东西（不入库）
├── 使用说明.md             ★ 给用户的说明书
├── 目录结构.md             ★ 工程结构与构建须知
├── 命轮盘序.md             485 个盘的完整游戏顺序
├── README.md              本文件
├── 栀子花2.apk             ★ 构建产物
└── 栀子花.ico              图标
```

工程内部的目录划分见 [目录结构.md](目录结构.md)。

---

## 从源码构建

需要 Node ≥ 18 和 Android SDK（本机用的是仓库外的 `.android-tools/`）。

```powershell
$root = 'C:\Users\Ricairo\Desktop\栀子花'
$env:GRADLE_USER_HOME = "$root\.gradle-home"
$env:TEMP = "$root\.build-tmp\jvm-tmp"; $env:TMP = $env:TEMP
$env:JAVA_HOME = "$root\.android-tools\jdk\jdk-21.0.12+8"
$env:ANDROID_HOME = "$root\.android-tools\sdk"

cd "$root\minglun-mobile"
npm install
npm run build
npx cap sync android
cd android
& "$root\.android-tools\gradle\gradle-8.14.3\bin\gradle.bat" assembleRelease --console=plain --no-daemon `
    "-Pkotlin.compiler.execution.strategy=in-process"
```

产物在 `minglun-mobile/android/app/build/outputs/apk/release/app-release.apk`。

> ⚠️ 那两个环境变量和最后那个 `-P` 参数**不能省**：
> 本机 JVM 写不了工作区外的临时文件，而 Kotlin 编译 worker 处理不了非 ASCII 路径。

### 跑测试

```powershell
cd minglun-mobile
node tests/wheel-order-check.mjs     # 游戏盘序
node tests/fate-value-check.mjs      # 命轮值公式
node tests/exhaustive-check.mjs      # 求解器 vs 穷举
# …其余同目录
```

---

## 签名

发布包用仓库根外的 `minglun-mobile/minglun-release.keystore` 签名，
口令放在 `minglun-mobile/android/keystore.properties`。

**这两个文件都不入库**（`.gitignore` 已排除），**请自行另存** ——
丢了就签不出同签名的包，已安装的用户没法覆盖升级。

证书 SHA-256：`5c0b0b3a75e580bd6697fa3b49e41456d5a2ad290c8623291e9ede6b5a56494d`

---

## 免责

本工具只是**离线计算器**：它读不到你的游戏账号，也不会替你操作游戏。

游戏数据（角色、关系盘、命轮值）来自公开渠道整理的静态配置，可能随版本变化；
发现对不上可以在「开发者」页里自己改。
