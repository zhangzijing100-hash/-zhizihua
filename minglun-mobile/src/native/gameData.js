// 原生桥：经 Shizuku 以 shell 身份读游戏写的调试日志。
// 实现在 android/app/src/main/java/com/minglun/app/GameDataPlugin.java。
// 只在安卓原生壳里有；网页版（dev server）走 gameDataSupported() === false 的分支。
import { registerPlugin, Capacitor } from "@capacitor/core";

const GameData = registerPlugin("GameData");

export const ACCESS_CODES = {
  NOT_ANDROID: "NOT_ANDROID",
  NEED_SHIZUKU_INSTALL: "NEED_SHIZUKU_INSTALL",
  NEED_SHIZUKU_START: "NEED_SHIZUKU_START",
  NEED_SHIZUKU_PERMISSION: "NEED_SHIZUKU_PERMISSION",
};

export function gameDataSupported() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function call(method, options) {
  if (!gameDataSupported()) throw new Error("只有安卓 App 里能用这个功能");
  if (typeof GameData?.[method] !== "function") throw new Error(`原生插件里没有 ${method}`);
  return GameData[method](options ?? {});
}

/** 探测 Shizuku 状态：{installed, running, granted, version} */
export const probeGameData = () => call("probe");
/** 弹 Shizuku 授权框 */
export const requestShizukuAccess = () => call("requestAccess");
/** 打开 Shizuku App */
export const openShizukuApp = () => call("openShizuku");

/**
 * 读取游戏目录里最新的 Debug-*.log。
 * @returns {Promise<{path:string|null, name:string|null, text:string, candidates:string[]}>}
 */
export function readFortuneLog() {
  return call("readFortuneLog");
}

/** 把各种形态的错误 / 结果对象翻成给用户看的话 */
export function describeAccessError(error) {
  if (error == null) return "读取失败";
  if (typeof error === "string") return error;

  // 原生返回的 {ok:false, reason:"..."} 这种结果对象
  if (!error.code && (error.reason || error.message)) {
    return String(error.reason ?? error.message);
  }

  switch (error.code) {
    case ACCESS_CODES.NEED_SHIZUKU_INSTALL:
      return "没装 Shizuku。Shizuku 能用手机自己的「无线调试」拿到读文件权限，装一次就行。";
    case ACCESS_CODES.NEED_SHIZUKU_START:
      return "Shizuku 没有在运行。打开 Shizuku，点「通过无线调试启动」。";
    case ACCESS_CODES.NEED_SHIZUKU_PERMISSION:
      return "栀子花还没有拿到 Shizuku 权限，点「重新授权」。";
    case "LIST_FAILED":
      return `列渠道服失败：${error.message ?? ""}`;
    case "PROBE_FAILED":
      return `截图失败：${error.message ?? ""}`;
    case "LAUNCH_FAILED":
      return `切应用失败：${error.message ?? ""}`;
    default:
      break;
  }

  if (error.message) return String(error.message);
  // 兜底：至少别显示 [object Object]
  try {
    const s = JSON.stringify(error);
    return s && s !== "{}" ? s : String(error);
  } catch {
    return "操作失败（未知错误）";
  }
}

// ---------------- 控制台自动化 ----------------

/** 屏幕分辨率与参考分辨率的换算信息 */
export const automationInfo = () => call("automationInfo");
/** 装了哪些渠道服 */
export const listGamePackages = () => call("listGamePackages");
/** 当前面板探测亮度（调参用） */
export const consoleProbe = () => call("consoleProbe");
/** 切到游戏 */
export const launchGame = (packageName) => call("launchGame", { packageName });
/** 切回栀子花 */
export const backToApp = () => call("backToApp");
/**
 * 打开 / 关闭游戏里的调试命令行。
 * @returns {Promise<{ok:boolean, open:boolean, probe:number, steps:string[], reason?:string}>}
 */
export const setConsole = (open) => call("setConsole", { open: !!open });

/** 渠道服包名 -> 显示名 */
export const CHANNEL_NAMES = {
  "com.zulong.drc.mi": "小米",
  "com.zulong.drcqd.vivo": "vivo",
  "com.zulong.drc.aligames": "九游",
  "com.zulong.drcqd.nearme.gamecenter": "OPPO",
  "com.zulong.drcqd.huawei": "华为",
  "com.zulong.drc.honor": "荣耀",
  "com.zulong.drc.oppo": "OPPO",
  "com.zulong.drc.tencent": "应用宝",
  "com.zulong.drc.bilibili": "bilibili",
};

/** 包名 -> 「华为 (com.zulong.drcqd.huawei)」这样的显示名 */
export function channelLabel(pkg) {
  const name = CHANNEL_NAMES[pkg];
  return name ? `${name}（${pkg}）` : pkg;
}
