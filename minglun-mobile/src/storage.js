// localStorage 持久化辅助
const PREFIX = "minglun.v1.";

function get(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function set(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    /* 写入失败（如存储满）—— 返回 false 让调用方提示用户 */
    return false;
  }
}
function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export const storage = { get, set, remove };

export const KEYS = {
  workbench: "workbench", // 开发者模式编辑后的 workbench（缺省用内置数据）
  state: "state", // 当前玩家状态 {objectives, baseAttributes, inventory, solver}
  history: "history", // 求解历史数组
  profiles: "profiles", // 玩家档案数组
  activeProfile: "activeProfile", // 当前档案 id
  developerMode: "developerMode", // 开发者模式开关
  background: "background", // 自定义背景 {dataUrl,name,opacity,blur,fit}
  consoleAck: "consoleAck", // 是否已确认过「命令行使用警告」
};
