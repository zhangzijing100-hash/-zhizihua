# 栀子花 · 命轮优化（手机版）

《龙族·卡塞尔》命轮优化工具的移动端版本。录入你拥有的命轮/碎片，设定优化目标，用 HiGHS 混合整数规划在**手机浏览器本地**算出最优命轮搭配方案。

## 已实现功能

- **优化目标**：选择要优化的属性（攻击/生命/物防/法防/各元素/命轮值），设置权重
- **参考基础属性**：录入角色当前面板（用于把百分比收益折算成点数）
- **资源录入**：按品质分组录入每个伙伴的命轮数和碎片数
- **一键读取命轮库存**：读游戏自己的调试日志拿库存，不用手点 63 次 —— 详见 `../使用说明.md` 第三节
  （游戏里停在命轮界面 → 命令行执行 `printfortunewheel` → 日志面板点「保存」；App 经 Shizuku 读那份 `Debug-*.log`）
- **求解**：包含宿命之轮开关、SSR 自选数量、忽略碎片品质组，一键求解并展示最优方案 + 属性加成
- **求解历史**：自动保存每次结果，可查看、单删、**批量删除 + 全选**
- **玩家档案**：保存/切换/删除多个玩家的数据（多玩家共用一台设备）
- **导入导出**：玩家数据（含历史）和数据库（角色/关系盘）的 JSON 导出/导入
- **开发者模式**：全局设置（最高阶数、碎片消耗）、命轮库编辑、关系命轮启停/删除
- **本地持久化**：所有数据存 localStorage，重启不丢失

数据已内置：**62 角色 / 480 关系盘**（含「隐狩矢吹樱」及 5 个执行之轮关系盘）。

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

## 三、打包成 Android APK（在你自己的电脑上）

> 需要先安装 **Node.js**（≥18）和 **Android Studio**（带 Android SDK）。

```bash
# 1. 安装依赖
npm install

# 2. 生成 Android 工程（首次只需一次）
npx cap add android

# 3. 构建网页 + 同步到 Android 工程
npm run build
npx cap sync android

# 4. 出调试版 APK（不需要签名）
cd android
gradlew.bat assembleDebug
```

生成的 APK 在：`android/app/build/outputs/apk/debug/app-debug.apk`

**签名发布版**（可分发安装）：在 Android Studio 里用 `Build > Generate Signed Bundle / APK`，创建一个密钥后即可出 release APK。

## 云端同步说明

当前版本是**本地存储**（数据存在手机浏览器/App 的 localStorage 里）。多设备同步需要一台服务器，属于独立的后端项目。目前推荐的做法：

- **手动同步**：用「设置 → 导入导出 → 导出玩家数据」存成 JSON 文件，通过微信/网盘传给另一台设备再「导入」。
- **未来接入云端**：可对接自建服务器（如 WebDAV / 云函数 + 数据库）实现自动同步，这需要额外的服务器和账号体系，不在当前版本内。

## 目录结构

```
minglun-mobile/
├── index.html
├── vite.config.js
├── capacitor.config.json      # Capacitor 配置
├── package.json
├── src/
│   ├── main.jsx               # 入口
│   ├── App.jsx                # 界面
│   ├── solver.js              # 求解器（HiGHS WASM，移植自桌面版）
│   ├── styles.css             # 移动端样式
│   ├── native/gameData.js     # 调原生插件（Shizuku 读游戏日志）
│   └── data/
│       ├── workbench.json     # 游戏数据（62角色/480盘）
│       ├── officialFateValues.js  # 官方命轮值（475 条）
│       ├── fortuneLog.js      # 解析 printfortunewheel 的 DebugLog
│       └── wheelInventoryMap.js   # 命轮 itemId → 伙伴（63 条，自动生成）
├── tests/                     # 纯 node 测试套件（7 套）
├── android/app/…              # 原生壳 + Shizuku 读取插件（GameDataPlugin.java）
└── dist/                      # 构建产物（网页版直接用这个目录）
```
