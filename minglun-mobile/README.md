# 栀子花2 · 命轮优化（手机版）

《龙族：卡塞尔之门》命轮优化工具的移动端版本。录入你拥有的命轮 / 碎片，设定优化目标，
用 HiGHS 混合整数规划在**手机本地**算出最优命轮搭配方案。

> **这版不读游戏数据** —— 不需要 Shizuku、不解析日志、不碰命令行，命轮库存全部手填。
> 整个 App 只有一条 `INTERNET` 权限，完全离线。

## 已实现功能

- **优化目标**：选择要优化的属性（攻击/生命/物防/法防/各元素/命轮值），设置权重
- **参考基础属性**：录入角色当前面板（用于把百分比收益折算成点数）
- **资源录入**：按品质分组录入 63 个伙伴的命轮数和碎片数；支持兑换资源与自选池
- **求解**：包含宿命之轮开关、SSR 自选数量、忽略碎片品质组，一键求解并展示最优方案 + 属性加成
- **结果按游戏盘序排列**：先按「创始 → 执行 → 物质 → 宿命」分组，组内顺序取自游戏配置的排序键
  （`src/data/wheelOrder.js`，由 `game-dump/gen-wheel-order.mjs` 生成）
- **求解历史**：自动保存每次结果，可查看、单删、**批量删除 + 全选**
- **玩家档案**：保存 / 切换 / 删除多个玩家的数据（多玩家共用一台设备）
- **导入导出**：玩家数据（含历史）和数据库（角色/关系盘）的 JSON 导出 / 导入
- **开发者模式**：全局设置（最高阶数、碎片消耗）、命轮库编辑、关系命轮启停 / 删除
- **外观**：自定义背景（透明度 / 模糊 / 缩放 / 覆盖方式）
- **本地持久化**：所有数据存 localStorage，重启不丢失；老版本数据由 `src/core/migrate.js` 自动补齐
- **竖屏锁定**（`AndroidManifest.xml` 的 `screenOrientation="portrait"`）

数据已内置：**63 角色 / 485 关系盘**（含 475 条与游戏一致的命轮值）。

## 一、在电脑上预览（开发）

```bash
npm install
npm run dev
```

打开终端显示的地址（默认 http://localhost:5173）。手机浏览器上把窗口宽度调窄即可看到移动端布局。

## 二、在手机上直接看（无需打包）

电脑和手机连**同一个 WiFi**：

```bash
npm run build
npm run preview -- --host
```

然后用手机浏览器访问终端显示的地址（形如 `http://192.168.x.x:4173`）。

## 三、打包成 Android APK

> 需要先安装 **Node.js**（≥18）和 **Android SDK**。

```bash
npm install
npm run build
npx cap sync android
cd android
gradlew.bat assembleRelease
```

**本机特有的坑**（换台机器可能不需要）：JVM 写不了工作区外的临时文件，
而且 Kotlin 编译 worker 处理不了非 ASCII 路径。必须这样跑：

```powershell
$root = 'C:\Users\Ricairo\Desktop\栀子花'
$env:GRADLE_USER_HOME = "$root\.gradle-home"
$env:TEMP = "$root\.build-tmp\jvm-tmp"; $env:TMP = $env:TEMP
$env:JAVA_HOME = "$root\.android-tools\jdk\jdk-21.0.12+8"
$env:ANDROID_HOME = "$root\.android-tools\sdk"
cd android
& "$root\.android-tools\gradle\gradle-8.14.3\bin\gradle.bat" assembleRelease --console=plain --no-daemon `
    "-Pkotlin.compiler.execution.strategy=in-process"
```

生成的 APK 在：`android/app/build/outputs/apk/release/app-release.apk`

**签名**：口令放在 `android/keystore.properties`（已 gitignore），密钥是 `../minglun-release.keystore`。
CI 上可以用环境变量 `MINGLUN_STORE_PASSWORD` / `MINGLUN_KEY_PASSWORD` 代替。

## 云端同步说明

当前版本是**本地存储**（数据存在手机 App 的 localStorage 里）。多设备同步需要一台服务器，属于独立的后端项目。目前推荐的做法：

- **手动同步**：用「设置 → 导入导出 → 导出玩家数据」存成 JSON 文件，通过微信/网盘传给另一台设备再「导入」。
- **未来接入云端**：可对接自建服务器（如 WebDAV / 云函数 + 数据库）实现自动同步，这需要额外的服务器和账号体系，不在当前版本内。

## 目录结构

```
minglun-mobile/
├── index.html
├── vite.config.js
├── capacitor.config.json      # Capacitor 配置
├── package.json
├── README.md
├── src/
│   ├── main.jsx               # 入口
│   ├── app/
│   │   ├── App.jsx            # 全部界面（目标/基础/资源/求解/历史 + 设置）
│   │   └── styles.css         # 全部样式
│   ├── engine/                # 求解与数值计算
│   │   ├── solver.js          # HiGHS WASM 混合整数规划
│   │   ├── solver.worker.js   # 放到 Worker 里跑，不卡界面
│   │   └── fate-value.js      # 命轮值公式 + 与官方数据核对
│   ├── core/                  # 公共设施
│   │   ├── storage.js         # localStorage 封装
│   │   └── migrate.js         # 老版本数据补齐 / 纠正
│   ├── data/                  # 游戏数据与生成的表
│   │   ├── workbench.json          # 数据库（63 角色 / 485 关系盘）
│   │   ├── officialFateValues.js   # 官方命轮值（475 条）
│   │   └── wheelOrder.js           # 游戏盘序（485 条，gen-wheel-order.mjs 生成）
│   └── assets/
│       └── default-bg.jpg     # 默认壁纸
├── tests/                     # 纯 node 测试套件（7 套）
├── android/app/…              # 原生壳
└── dist/                      # 构建产物（网页版直接用这个目录）
```
