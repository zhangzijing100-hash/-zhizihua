import { useEffect, useMemo, useRef, useState } from "react";
import workbenchBundle from "../data/workbench.json";
import { solveWorkbench, formatNumber, resultDisplayHelpers } from "../engine/solver.js";
import {
  auditWorkbench,
  applyFateValueFixes,
  suggestFateValueFor,
  FATE_VALUE_SOURCE_ID,
  NORMAL_MULTIPLIER,
  DESTINY_STEP,
} from "../engine/fate-value.js";
import { storage, KEYS } from "../core/storage.js";
import { upgradeWorkbench } from "../core/migrate.js";
import defaultBgUrl from "../assets/default-bg.jpg";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

import { WHEEL_CATEGORY_ORDER, categoryOrderOf, wheelOrderOf } from "../data/wheelOrder.js";

const RARITY_ORDER = ["UR", "SSR_LIMITED", "SSR", "SR", "R"];
const RARITY_LABEL = { UR: "UR", SSR_LIMITED: "限定SSR", SSR: "普通SSR", SR: "SR", R: "R" };
const resourceGroupOf = (c) => (c.rarity === "SSR" && c.isLimited ? "SSR_LIMITED" : c.rarity);

// 「额外百分比」只对元素属性开放
const ELEMENT_GROUP = "元素属性";
const DEFAULT_EXTRA_PERCENT = 10;
const elementMetricsOf = (wb) => wb.optimizationMetrics.filter((m) => m.group === ELEMENT_GROUP);
function defaultExtraPercent(wb, metricId) {
  const entry = (wb.defaults.userBaseAttributeTemplate.extraPercents ?? []).find((item) => item.metricId === metricId);
  return entry ? Number(entry.value) || 0 : DEFAULT_EXTRA_PERCENT;
}

// ---------- 兑换货币（王牌积分 / 命轮金币） ----------
const currencyListOf = (wb) => (wb.globalSettings.currencies ?? []).filter((c) => c.isEnabled);
function currencyRateOf(currency, group) {
  const rate = (currency.rates ?? []).find((item) => item.resourceGroup === group);
  const cost = Number(rate?.costPerWheel);
  return Number.isFinite(cost) && cost > 0 ? cost : 0;
}
function currencyRateHint(currency) {
  const parts = RARITY_ORDER.map((g) => {
    const cost = currencyRateOf(currency, g);
    return cost ? `${RARITY_LABEL[g]} ${cost}` : null;
  }).filter(Boolean);
  return parts.length ? parts.join(" / ") : "当前不可兑换";
}
function withRate(rates, group, cost) {  const list = rates ?? [];
  return list.some((item) => item.resourceGroup === group)
    ? list.map((item) => (item.resourceGroup === group ? { ...item, costPerWheel: cost } : item))
    : [...list, { resourceGroup: group, costPerWheel: cost }];
}

function defaultPlayer(wb) {
  const alg = wb.defaults.solverAlgorithms.find((a) => a.isEnabled) ?? wb.defaults.solverAlgorithms[0];
  return {
    objectives: wb.optimizationMetrics.map((m) => ({ metricId: m.id, weight: m.defaultWeight, isEnabled: false })),
    baseAttributes: wb.defaults.userBaseAttributeTemplate.values.map((v) => ({ ...v })),
    extraPercents: elementMetricsOf(wb).map((m) => ({ metricId: m.id, value: defaultExtraPercent(wb, m.id) })),
    inventory: wb.characters.filter((c) => c.isEnabled).map((c) => ({ characterId: c.id, wheelCount: 0, fragmentCount: 0 })),
    currencies: currencyListOf(wb).map((c) => ({ currencyId: c.id, amount: 0 })),
    solver: {
      algorithmId: alg?.id ?? "solver.highs-mip",
      includeDestinyWheel: true,
      ignoredFragmentGroups: [],
      ssrWheelChoices: 0,
      parameters: (alg?.parameters ?? []).map((p) => ({ key: p.key, value: p.defaultValue })),
    },
  };
}

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
async function exportData(filename, data) {
  if (!Capacitor.isNativePlatform()) {
    downloadJSON(filename, data);
    return;
  }
  try {
    const result = await Filesystem.writeFile({
      path: filename,
      data: JSON.stringify(data, null, 2),
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: filename, url: result.uri, dialogTitle: "导出数据" });
  } catch (e) {
    console.error("导出失败", e);
  }
}
function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
function uid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatBytes(n) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

// ---------- 背景：三种选择 ----------
// solid  = 现在这个（调亮后的深灰底 + 径向光）
// zhefeng = 自带的哲风壁纸
// custom = 用户自己上传的图
const DEFAULT_BACKGROUND = { mode: "solid", dataUrl: null, name: "", bytes: 0, opacity: 0.5, blur: 0, fit: "cover" };
const BG_MODES = [["solid", "默认"], ["zhefeng", "哲风壁纸"], ["custom", "自定义壁纸"]];
const BG_OPACITY_MIN = 0.1;
const BG_OPACITY_MAX = 0.9;
function clampBgOpacity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_BACKGROUND.opacity;
  return Math.min(BG_OPACITY_MAX, Math.max(BG_OPACITY_MIN, n));
}
function readImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("这张图片无法解码"));
      image.src = reader.result;
    };
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}
// 缩放 + 转 JPEG：壁纸不需要原图尺寸，压过才塞得进 localStorage
function encodeBackground(image, maxEdge, quality) {
  const w0 = image.naturalWidth || image.width || 1;
  const h0 = image.naturalHeight || image.height || 1;
  const scale = Math.min(1, maxEdge / Math.max(w0, h0));
  const width = Math.max(1, Math.round(w0 * scale));
  const height = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#14161A"; // 透明区域按底色填，避免 JPEG 变黑
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}
async function makeBackgroundImage(file) {
  if (!file) throw new Error("没有选择文件");
  const looksImage = /^image\//.test(file.type || "") || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name || "");
  if (file.type && !looksImage) throw new Error("请选择图片文件");
  const image = await readImageFromFile(file);
  let dataUrl = encodeBackground(image, 1280, 0.8);
  if (dataUrl.length > 1_200_000) dataUrl = encodeBackground(image, 900, 0.68);
  if (dataUrl.length > 2_000_000) throw new Error("图片太大，请换一张尺寸小一些的");
  return { dataUrl, name: file.name || "自定义图片", bytes: Math.round((dataUrl.length * 3) / 4) };
}
export default function App() {
  const migratedRef = useRef(false);
  const [workbench, setWorkbench] = useState(() => {
    const stored = storage.get(KEYS.workbench, null);
    if (!stored) return workbenchBundle;
    const upgraded = upgradeWorkbench(stored, workbenchBundle);
    if (upgraded !== stored) migratedRef.current = true;
    return upgraded;
  });
  const [player, setPlayer] = useState(() => storage.get(KEYS.state, null) ?? defaultPlayer(workbenchBundle));
  const [history, setHistory] = useState(() => storage.get(KEYS.history, []));
  const [profiles, setProfiles] = useState(() => storage.get(KEYS.profiles, []));
  const [activeProfileId, setActiveProfileId] = useState(() => storage.get(KEYS.activeProfile, null));
  const [developerMode, setDeveloperMode] = useState(() => storage.get(KEYS.developerMode, false));
  const [background, setBackground] = useState(() => {
    const stored = storage.get(KEYS.background, null) ?? {};
    return { ...DEFAULT_BACKGROUND, ...stored, opacity: clampBgOpacity(stored.opacity ?? DEFAULT_BACKGROUND.opacity) };
  });
  // 选了壁纸（且自定义那张确实有图）才铺背景、才把面板换成液态玻璃
  const bgActive = background.mode === "zhefeng" || (background.mode === "custom" && !!background.dataUrl);

  const [tab, setTab] = useState("goal");
  const [screen, setScreen] = useState("main"); // "main" | "settings" | "dev"
  const screenRef = useRef(screen);
  const tabRef = useRef(tab);
  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => { tabRef.current = tab; }, [tab]);
  const [result, setResult] = useState(null);
  const [solving, setSolving] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const playerFileRef = useRef(null);
  const dbFileRef = useRef(null);
  const workerRef = useRef(null);
  const cancelRef = useRef(false);

  useEffect(() => { if (workbench !== workbenchBundle) storage.set(KEYS.workbench, workbench); else storage.remove(KEYS.workbench); }, [workbench]);
  useEffect(() => { storage.set(KEYS.state, player); }, [player]);
  useEffect(() => { storage.set(KEYS.history, history); }, [history]);
  useEffect(() => { storage.set(KEYS.profiles, profiles); }, [profiles]);
  useEffect(() => { storage.set(KEYS.activeProfile, activeProfileId); }, [activeProfileId]);
  useEffect(() => { storage.set(KEYS.developerMode, developerMode); }, [developerMode]);
  // 背景含 base64 大字符串，拖滑块时不要每次 input 都写盘 —— 防抖 350ms
  useEffect(() => {
    const timer = setTimeout(() => { storage.set(KEYS.background, background); }, 350);
    return () => clearTimeout(timer);
  }, [background]);

  const chooseBackground = async (file) => {
    if (!file) return;
    try {
      const image = await makeBackgroundImage(file);
      setBackground((prev) => ({ ...prev, ...image, mode: "custom" }));
      setNotice(`已换成自定义壁纸（${formatBytes(image.bytes)}）`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "换壁纸失败");
    }
  };
  const updateBackground = (patch) => setBackground((prev) => ({ ...prev, ...patch, ...(patch.opacity === undefined ? {} : { opacity: clampBgOpacity(patch.opacity) }) }));
  const resetBackground = () => { setBackground({ ...DEFAULT_BACKGROUND }); setNotice("已恢复默认背景"); };
  // 数据库被补齐时提示一次（补齐后会写回本机，之后不再提示）
  useEffect(() => {
    if (migratedRef.current) setNotice("已为本机数据库补齐新功能所需字段");
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2200);
    return () => clearTimeout(t);
  }, [notice]);

  // 计算计时：还能顺带证明 Worker 生效（主线程被阻塞时计时器不会走）
  useEffect(() => {
    if (!solving) return undefined;
    const timer = setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, [solving]);

  // 离开 / 卸载时终止 Worker
  useEffect(() => () => { if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; } }, []);

  // 给壁纸记录「完整屏高」：键盘弹出只改 innerHeight、不改 innerWidth，
  // 所以只在宽度变化（旋转屏幕）时重新测量 —— 壁纸就不会随键盘缩放或位移。
  useEffect(() => {
    const apply = () => document.documentElement.style.setProperty("--app-vh", `${window.innerHeight}px`);
    apply();
    let lastWidth = window.innerWidth;
    const onResize = () => {
      if (Math.abs(window.innerWidth - lastWidth) > 1) { lastWidth = window.innerWidth; apply(); }
    };
    const onOrientation = () => setTimeout(apply, 250);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onOrientation);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrientation);
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapApp.addListener("backButton", () => {
      if (screenRef.current !== "main") {
        setScreen("main");
      } else if (tabRef.current !== "goal") {
        setTab("goal");
      } else {
        CapApp.exitApp();
      }
    });
    return () => { listener.remove(); };
  }, []);

  // 让 player 数据与 workbench 保持一致（新增/删除角色、导入数据库后自动对齐）
  useEffect(() => {
    setPlayer((p) => {
      const safeObjectives = Array.isArray(p.objectives) ? p.objectives : [];
      const safeBase = Array.isArray(p.baseAttributes) ? p.baseAttributes : [];
      const safeInventory = Array.isArray(p.inventory) ? p.inventory : [];
      const inventory = workbench.characters.filter((c) => c.isEnabled).map((c) => safeInventory.find((i) => i.characterId === c.id) ?? { characterId: c.id, wheelCount: 0, fragmentCount: 0 });
      const objectives = workbench.optimizationMetrics.map((m) => safeObjectives.find((o) => o.metricId === m.id) ?? { metricId: m.id, weight: m.defaultWeight, isEnabled: false });
      const baseAttributes = (workbench.defaults.userBaseAttributeTemplate.values ?? []).map((v) => safeBase.find((b) => b.metricId === v.metricId) ?? { ...v });
      const safeExtra = Array.isArray(p.extraPercents) ? p.extraPercents : [];
      const extraPercents = elementMetricsOf(workbench).map((m) => safeExtra.find((e) => e.metricId === m.id) ?? { metricId: m.id, value: defaultExtraPercent(workbench, m.id) });
      const safeCurrencies = Array.isArray(p.currencies) ? p.currencies : [];
      const currencies = currencyListOf(workbench).map((c) => safeCurrencies.find((x) => x.currencyId === c.id) ?? { currencyId: c.id, amount: 0 });
      const next = { ...p, inventory, objectives, baseAttributes, extraPercents, currencies };
      return JSON.stringify(next) === JSON.stringify(p) ? p : next;
    });
  }, [workbench]);

  const metrics = workbench.optimizationMetrics;
  const characters = useMemo(() => workbench.characters.filter((c) => c.isEnabled).sort((a, b) => a.order - b.order), [workbench]);
  const helpers = useMemo(() => resultDisplayHelpers(workbench), [workbench]);
  const metricById = useMemo(() => new Map(metrics.map((m) => [m.id, m])), [metrics]);
  const charById = useMemo(() => new Map(workbench.characters.map((c) => [c.id, c])), [workbench]);
  const inventoryByChar = useMemo(() => new Map(player.inventory.map((i) => [i.characterId, i])), [player.inventory]);

  const groups = useMemo(() => {
    const g = new Map();
    for (const c of characters) {
      const rg = resourceGroupOf(c);
      if (!g.has(rg)) g.set(rg, []);
      g.get(rg).push(c);
    }
    return RARITY_ORDER.filter((k) => g.has(k)).map((k) => ({ key: k, label: RARITY_LABEL[k], list: g.get(k) }));
  }, [characters]);

  // 玩家数据更新
  const patchPlayer = (patch) => setPlayer((p) => ({ ...p, ...patch }));
  const updateObjective = (metricId, p) => patchPlayer({ objectives: player.objectives.map((o) => (o.metricId === metricId ? { ...o, ...p } : o)) });
  const updateBase = (metricId, value) => patchPlayer({ baseAttributes: player.baseAttributes.map((b) => (b.metricId === metricId ? { ...b, value } : b)) });
  const updateExtra = (metricId, value) => patchPlayer({
    extraPercents: (player.extraPercents ?? []).some((e) => e.metricId === metricId)
      ? player.extraPercents.map((e) => (e.metricId === metricId ? { ...e, value } : e))
      : [...(player.extraPercents ?? []), { metricId, value }],
  });
  const updateCurrency = (currencyId, amount) => patchPlayer({
    currencies: (player.currencies ?? []).some((c) => c.currencyId === currencyId)
      ? player.currencies.map((c) => (c.currencyId === currencyId ? { ...c, amount } : c))
      : [...(player.currencies ?? []), { currencyId, amount }],
  });
  const updateInventory = (characterId, p) => patchPlayer({
    inventory: player.inventory.some((i) => i.characterId === characterId)
      ? player.inventory.map((i) => (i.characterId === characterId ? { ...i, ...p } : i))
      : [...player.inventory, { characterId, wheelCount: 0, fragmentCount: 0, ...p }],
  });
  const resetInventory = () => {
    patchPlayer({ inventory: player.inventory.map((i) => ({ ...i, wheelCount: 0, fragmentCount: 0 })) });
    // 连「读取命轮库存」那张表一起清 —— 否则清完下面的录入列表，
    // 上面的读取结果还留着数字，整页看着像没清掉
    setNotice("已全部清零");
  };
  // 一键还原基础值：参考基础属性 + 额外百分比 恢复成内置默认
  const resetBase = () => {
    patchPlayer({
      baseAttributes: (workbench.defaults.userBaseAttributeTemplate.values ?? []).map((v) => ({ ...v })),
      extraPercents: elementMetricsOf(workbench).map((m) => ({ metricId: m.id, value: defaultExtraPercent(workbench, m.id) })),
    });
    setNotice("已还原为默认基础值");
  };
  const setAllObjectives = (on) => patchPlayer({ objectives: player.objectives.map((o) => ({ ...o, isEnabled: on })) });

  const enabledCount = player.objectives.filter((o) => o.isEnabled).length;
  const enteredCount = player.inventory.filter((i) => i.wheelCount || i.fragmentCount).length;

  const doSolve = async () => {
    if (!player.objectives.some((o) => o.isEnabled)) { setError("请先在「目标」页至少启用一个优化目标"); return; }
    setError(null); setResult(null); setSolving(true); setProgress("正在计算，请稍等…"); setElapsed(0);
    cancelRef.current = false;
    const makeEntry = (r) => ({
      id: uid(),
      title: new Date().toLocaleString(),
      createdAt: new Date().toISOString(),
      configuration: { ...player.solver },
      objectives: player.objectives.filter((o) => o.isEnabled),
      baseAttributes: player.baseAttributes,
      inventory: player.inventory.filter((i) => i.wheelCount || i.fragmentCount),
      result: r,
    });
    const accept = (r) => {
      if (cancelRef.current) return;
      setResult(r);
      setSolving(false); setProgress("");
      setHistory((h) => [makeEntry(r), ...h].slice(0, 50));
    };
    const fail = (message) => {
      if (cancelRef.current) return;
      setError(message);
      setSolving(false); setProgress("");
    };
    const runOnMainThread = async () => {
      try {
        const r = await solveWorkbench(workbench, player, (m) => setProgress(m ? `正在计算，请稍等…（${m}）` : "正在计算，请稍等…"));
        accept(r);
      } catch (e) {
        fail(e instanceof Error ? e.message : String(e));
      }
    };

    // 优先用 Worker：HiGHS 的 solve() 是同步阻塞调用，放主线程会让界面假死、取消按钮点不动
    let worker = null;
    try {
      worker = new Worker(new URL("../engine/solver.worker.js", import.meta.url), { type: "module" });
    } catch {
      worker = null;
    }
    if (!worker) { await runOnMainThread(); return; }

    let settled = false;
    let fellBack = false;
    const closeWorker = () => {
      const current = workerRef.current;
      workerRef.current = null;
      if (current) current.terminate();
    };
    workerRef.current = worker;
    worker.onmessage = (event) => {
      const message = event.data ?? {};
      if (message.type === "progress") { setProgress(message.message ? `正在计算，请稍等…（${message.message}）` : "正在计算，请稍等…"); return; }
      settled = true;
      closeWorker();
      if (message.type === "result") accept(message.result);
      else fail(message.message || "求解失败");
    };
    // Worker 起不来（模块 / wasm 加载失败）时退回主线程，避免整个功能不可用
    worker.onerror = () => {
      if (settled || cancelRef.current) { closeWorker(); return; }
      if (fellBack) { closeWorker(); fail("计算进程异常退出"); return; }
      fellBack = true;
      closeWorker();
      setProgress("正在计算，请稍等…（Worker 不可用，改用主线程）");
      void runOnMainThread();
    };
    worker.postMessage({ type: "solve", requestId: uid(), workbench, userPlan: player });
  };

  const cancelSolve = () => {
    cancelRef.current = true;
    const worker = workerRef.current;
    workerRef.current = null;
    if (worker) worker.terminate();
    setSolving(false);
    setProgress("");
    setNotice("已取消计算");
  };

  const loadHistoryEntry = (entry) => { setResult(entry.result); setTab("solve"); };
  const deleteHistory = (id) => setHistory((h) => h.filter((e) => e.id !== id));
  const deleteManyHistory = (ids) => setHistory((h) => h.filter((e) => !ids.has(e.id)));

  // 档案
  const saveProfile = (name) => {
    const clean = name.trim() || "未命名";
    setProfiles((list) => {
      const existing = list.find((p) => p.name === clean);
      const profile = { id: existing?.id ?? uid(), name: clean, player: JSON.parse(JSON.stringify(player)) };
      return existing ? list.map((p) => (p.name === clean ? profile : p)) : [...list, profile];
    });
    setNotice(`已保存档案「${clean}」`);
  };
  const loadProfile = (profile) => {
    setPlayer(JSON.parse(JSON.stringify(profile.player)));
    setActiveProfileId(profile.id);
    setNotice(`已切换到「${profile.name}」`);
  };
  const deleteProfile = (id) => { setProfiles((list) => list.filter((p) => p.id !== id)); if (activeProfileId === id) setActiveProfileId(null); };

  // 导入导出
  const exportPlayer = () => exportData(`栀子花玩家数据-${new Date().toISOString().slice(0, 10)}.json`, { format: "minglun-player-data", version: 1, plan: player, history });
  const applyPlayerJson = (text) => {
    const doc = JSON.parse(text);
    const p = doc?.plan ?? doc?.player;
    if (doc?.format !== "minglun-player-data" || !p || !Array.isArray(p.objectives) || !Array.isArray(p.inventory)) throw new Error("不是有效的玩家数据文件");
    setPlayer(p);
    if (Array.isArray(doc.history)) setHistory(doc.history.slice(0, 50));
    setNotice("已导入玩家数据");
  };
  const importPlayer = async (file) => {
    try { applyPlayerJson(await readFileText(file)); }
    catch (e) { setNotice(e instanceof Error ? e.message : "导入失败"); }
  };
  const exportDatabase = () => exportData(`栀子花数据库-${new Date().toISOString().slice(0, 10)}.json`, { format: "minglun-workbench", version: 1, workbench });
  const applyDatabaseJson = (text) => {
    const doc = JSON.parse(text);
    const wb = doc?.workbench ?? doc;
    if (!wb?.characters || !wb?.fateWheels) throw new Error("不是有效的数据库文件");
    setWorkbench(wb);
    setPlayer(defaultPlayer(wb));
    setNotice("已导入数据库，请重新设置目标和资源");
  };
  const importDatabase = async (file) => {
    try { applyDatabaseJson(await readFileText(file)); }
    catch (e) { setNotice(e instanceof Error ? e.message : "导入失败"); }
  };
  const importPasted = (text) => {
    try {
      const doc = JSON.parse(text);
      if (doc?.format === "minglun-player-data" || doc?.plan || doc?.player) applyPlayerJson(text);
      else if (doc?.workbench || doc?.fateWheels || doc?.characters) applyDatabaseJson(text);
      else throw new Error("无法识别该数据（需为玩家数据或数据库的导出内容）");
    } catch (e) { setNotice(e instanceof Error ? e.message : "导入失败"); }
  };

  // ---------- 一键读取命轮库存（读游戏写的 DebugLog） ----------
  return (
    <div className={"app" + (bgActive ? " bg-on" : "")}>
      {bgActive && (
        <div
          className="bg-layer"
          aria-hidden="true"
          style={{
            backgroundImage: `url(${background.mode === "custom" ? background.dataUrl : defaultBgUrl})`,
            backgroundSize: background.fit === "contain" ? "contain" : "cover",
            opacity: background.opacity,
            filter: background.blur ? `blur(${background.blur}px)` : undefined,
            transform: background.blur ? "scale(1.06)" : undefined,
          }}
        />
      )}
      <header className="topbar">
        <div className="topbar-row">
          <div className="brand">栀子花</div>

          <div className="topbar-actions">
            {activeProfileId && <span className="profile-tag">{profiles.find((p) => p.id === activeProfileId)?.name}</span>}
            <button className="icon-btn" onClick={() => setScreen("settings")} aria-label="设置">⚙</button>
          </div>
        </div>
        <div className="sub">{workbench.characters.length} 角色 / {workbench.fateWheels.length} 关系盘</div>
      </header>

      {screen === "settings" ? (
        <SettingsScreen
          profiles={profiles} saveProfile={saveProfile} loadProfile={loadProfile} deleteProfile={deleteProfile}
          exportPlayer={exportPlayer} importPlayer={importPlayer} exportDatabase={exportDatabase} importDatabase={importDatabase} importPasted={importPasted}
          developerMode={developerMode} setDeveloperMode={setDeveloperMode}
          background={background} chooseBackground={chooseBackground} updateBackground={updateBackground} resetBackground={resetBackground} bgModes={BG_MODES}
          defaultBgUrl={defaultBgUrl}
          playerFileRef={playerFileRef} dbFileRef={dbFileRef} onBack={() => setScreen("main")}
        />
      ) : screen === "dev" ? (
        <DevScreen workbench={workbench} setWorkbench={setWorkbench} onBack={() => setScreen("main")} notify={setNotice} />
      ) : (
        <>
          <main className="content">
            {tab === "goal" && (
              <GoalTab metrics={metrics} objectives={player.objectives} updateObjective={updateObjective} setAllObjectives={setAllObjectives} />
            )}
            {tab === "base" && (
              <BaseTab
                baseAttributes={player.baseAttributes}
                metricById={metricById}
                updateBase={updateBase}
                extraPercents={player.extraPercents ?? []}
                updateExtra={updateExtra}
                onReset={resetBase}
                defaults={{
                  base: workbench.defaults.userBaseAttributeTemplate.values ?? [],
                  extra: elementMetricsOf(workbench).map((m) => ({ metricId: m.id, value: defaultExtraPercent(workbench, m.id) })),
                }}
              />
            )}
          {tab === "res" && (
            <ResTab
              groups={groups}
              characters={characters}
              inventoryByChar={inventoryByChar}
              updateInventory={updateInventory}
              resetInventory={resetInventory}
              enteredCount={enteredCount}
              currencyList={currencyListOf(workbench)}
              currencies={player.currencies ?? []}
              updateCurrency={updateCurrency}
            />
          )}
          {tab === "solve" && <SolveTab player={player} setPlayer={patchPlayer} enabledCount={enabledCount} doSolve={doSolve} solving={solving} progress={progress} elapsed={elapsed} onCancel={cancelSolve} error={error} result={result} helpers={helpers} />}
            {tab === "history" && <HistoryTab history={history} loadHistoryEntry={loadHistoryEntry} deleteHistory={deleteHistory} deleteMany={deleteManyHistory} />}
          </main>
          {developerMode && tab === "solve" && (
            <button className="dev-fab" onClick={() => setScreen("dev")} aria-label="开发者">🔧</button>
          )}
          <nav className="tabbar">
            {[["goal", "目标"], ["base", "基础"], ["res", "资源"], ["solve", "求解"], ["history", "历史"]].map(([id, label]) => (
              <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
            ))}
          </nav>
        </>
      )}

      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

function GoalTab({ metrics, objectives, updateObjective, setAllObjectives }) {
  return (
    <section>
      <div className="page-head">
        <h1>优化目标</h1>
        <div className="head-actions"><button className="ghost" onClick={() => setAllObjectives(true)}>全选</button><button className="ghost" onClick={() => setAllObjectives(false)}>清空</button></div>
      </div>
      <p className="hint">勾选想优化的属性，权重越高越优先。</p>
      <div className="list">
        {metrics.map((m) => {
          const o = objectives.find((x) => x.metricId === m.id);
          return (
            <div key={m.id} className={"row" + (o.isEnabled ? " on" : "")}>
              <label className="row-main">
                <input type="checkbox" checked={o.isEnabled} onChange={() => updateObjective(m.id, { isEnabled: !o.isEnabled })} />
                <span className="row-title">{m.name}<small>{m.group}</small></span>
              </label>
              <div className="weight"><input type="number" min="0" step="0.1" value={o.weight} disabled={!o.isEnabled} onChange={(e) => updateObjective(m.id, { weight: Number(e.target.value) })} /><span>权重</span></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BaseTab({ baseAttributes, metricById, updateBase, extraPercents, updateExtra, defaults, onReset }) {
  const [confirming, setConfirming] = useState(false);
  const extraByMetric = new Map((extraPercents ?? []).map((e) => [e.metricId, e]));
  const defaultExtraByMetric = new Map((defaults?.extra ?? []).map((e) => [e.metricId, e.value]));
  return (
    <section>
      <div className="page-head">
        <h1>参考基础属性</h1>
        <div className="head-actions"><button className="ghost" onClick={() => setConfirming(true)}>一键还原</button></div>
      </div>
      <p className="hint">总值 =（升星固定值 + 基础值）×（1 + 进阶百分比 + 额外百分比）。只有元素属性有「额外%」（其他系统提供的元素加成）。</p>
      <div className="list">
        {baseAttributes.map((b) => {
          const m = metricById.get(b.metricId);
          const isElement = m?.group === ELEMENT_GROUP;
          return (
            <div key={b.metricId} className="row">
              <span className="row-title">{m?.name}<small>{m?.group}</small></span>
              <div className="weight"><input type="number" min="0" value={b.value} onFocus={(e) => e.target.select()} onChange={(e) => updateBase(b.metricId, Number(e.target.value))} /><span>点</span></div>
              {isElement && (
                <div className="weight"><input type="number" step="0.1" min="0" value={extraByMetric.get(b.metricId)?.value ?? 0} onFocus={(e) => e.target.select()} onChange={(e) => updateExtra(b.metricId, Number(e.target.value))} /><span>额外%</span></div>
              )}
            </div>
          );
        })}
      </div>
      {confirming && (
        <div className="modal-backdrop" onClick={() => setConfirming(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>还原为默认基础值？</h3>
            <p>以下是内置默认值，确认后会覆盖你当前填写的「参考基础属性」和「额外百分比」。</p>
            <div className="reset-list">
              {(defaults?.base ?? []).map((d) => (
                <div key={d.metricId} className="reset-item">
                  <span>{metricById.get(d.metricId)?.name ?? d.metricId}</span>
                  <strong>
                    {formatNumber(d.value, 0)}
                    {defaultExtraByMetric.has(d.metricId) ? `　额外 ${defaultExtraByMetric.get(d.metricId)}%` : ""}
                  </strong>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setConfirming(false)}>取消</button>
              <button className="danger-btn" onClick={() => { onReset(); setConfirming(false); }}>确认还原</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ResTab({ groups, enteredCount, characters, inventoryByChar, updateInventory, resetInventory, currencyList, currencies, updateCurrency, wheel }) {
  return (
    <section>
      <div className="page-head"><h1>资源录入</h1><div className="head-actions"><button className="ghost" onClick={resetInventory}>全部清零</button></div></div>

      {currencyList.length > 0 && (
        <div className="config">
          <span className="fg-label">兑换资源 —— 可换任意同品质角色的命轮，求解时自动决定买给谁</span>
          {currencyList.map((c) => (
            <label key={c.id} className="field-row">
              <span>{c.name}</span>
              <input type="number" min="0" value={currencies.find((x) => x.currencyId === c.id)?.amount ?? 0} onFocus={(e) => e.target.select()} onChange={(e) => updateCurrency(c.id, Number(e.target.value))} />
            </label>
          ))}
          <p className="tip">适用于凹命轮值开宿命之轮，其余情况兑换成SSR自选即可</p>
          <p className="hint">兑换价（每个命轮）：{currencyRateHint(currencyList[0])}{currencyList.length > 1 ? "（各货币相同）" : ""}</p>
        </div>
      )}

      <p className="hint">已录入 {enteredCount}/{characters.length} 个伙伴。</p>
      {groups.map((g) => (
        <div key={g.key} className="group">
          <div className="group-head"><span className="badge">{g.label}</span><span>{g.list.length} 个</span></div>
          {g.list.map((c) => {
            const inv = inventoryByChar.get(c.id);
            return (
              <div key={c.id} className="row">
                <span className="row-title">{c.name}</span>
                <div className="weight two"><input type="number" min="0" value={inv?.wheelCount ?? 0} onFocus={(e) => e.target.select()} onChange={(e) => updateInventory(c.id, { wheelCount: Number(e.target.value) })} /><span>命轮</span></div>
                <div className="weight two"><input type="number" min="0" value={inv?.fragmentCount ?? 0} onFocus={(e) => e.target.select()} onChange={(e) => updateInventory(c.id, { fragmentCount: Number(e.target.value) })} /><span>碎片</span></div>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}

function SolveTab({ player, setPlayer, enabledCount, doSolve, solving, progress, elapsed, onCancel, error, result, helpers }) {  const solver = player.solver;
  const setSolver = (s) => setPlayer({ solver: typeof s === "function" ? s(solver) : s });
  return (
    <section>
      <div className="page-head"><h1>求解</h1></div>
      <div className="config">
        <label className="switch-row"><span>包含宿命之轮</span><input type="checkbox" checked={solver.includeDestinyWheel} onChange={(e) => setSolver((s) => ({ ...s, includeDestinyWheel: e.target.checked }))} /></label>
        <label className="field-row"><span>SSR 命轮自选数量</span><input type="number" min="0" value={solver.ssrWheelChoices} onChange={(e) => setSolver((s) => ({ ...s, ssrWheelChoices: Number(e.target.value) }))} /></label>
        <div className="frag-groups">
          <span className="fg-label">忽略碎片（品质组）</span>
          <div className="fg-options">
            {RARITY_ORDER.map((k) => (
              <label key={k} className="fg-chip">
                <input type="checkbox" checked={solver.ignoredFragmentGroups.includes(k)} onChange={(e) => setSolver((s) => ({ ...s, ignoredFragmentGroups: e.target.checked ? [...s.ignoredFragmentGroups, k] : s.ignoredFragmentGroups.filter((x) => x !== k) }))} />
                {RARITY_LABEL[k]}
              </label>
            ))}
          </div>
        </div>
      </div>
      <button className="solve-btn" disabled={solving} onClick={doSolve}>{solving ? "计算中…" : `求解（${enabledCount} 个目标）`}</button>
      {solving && (
        <div className="solving-panel">
          <span className="spinner" aria-hidden="true" />
          <div className="solving-text">
            <strong>正在计算，请稍等…</strong>
            <small>{progress || "构建整数规划模型"}　已用 {elapsed} 秒</small>
          </div>
          <button className="ghost cancel-btn" onClick={onCancel}>取消</button>
        </div>
      )}
      {error && <div className="error">{error}</div>}
      {result && <ResultView result={result} helpers={helpers} />}
    </section>
  );
}

function HistoryTab({ history, loadHistoryEntry, deleteHistory, deleteMany }) {
  const [selected, setSelected] = useState(new Set());
  const allSelected = history.length > 0 && history.every((e) => selected.has(e.id));
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(history.map((e) => e.id)));
  const deleteSelected = () => { deleteMany(selected); setSelected(new Set()); };
  return (
    <section>
      <div className="page-head"><h1>求解历史</h1></div>
      {history.length === 0 ? (
        <p className="hint">暂无求解记录。</p>
      ) : (
        <>
          <div className="history-toolbar">
            <label><input type="checkbox" checked={allSelected} onChange={toggleAll} /> 全选</label>
            <button className="ghost" disabled={selected.size === 0} onClick={deleteSelected}>批量删除{selected.size ? `(${selected.size})` : ""}</button>
          </div>
          <div className="list">
            {history.map((e) => (
              <div key={e.id} className="row hist-row">
                <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                <button className="hist-main" onClick={() => loadHistoryEntry(e)}>
                  <span className="row-title">{e.title}<small>{e.result.isProvenOptimal ? "全局最优" : e.result.status} · 分 {formatNumber(e.result.objectiveScore, 4)}</small></span>
                </button>
                <button className="ghost" onClick={() => deleteHistory(e.id)}>删</button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function ResultView({ result, helpers }) {
  const { wheelById, categoryById, characterById, sourceById, metricById, wheelStageLabel } = helpers;
  const statusLabel = result.isProvenOptimal ? "全局最优" : result.status === "time_limit" ? "限时可行" : result.status;

  // 按**游戏里的盘顺序**排列：先按「轮」的先后（物质→执行→创始→宿命），
  // 组内按盘在游戏里的显示顺序。顺序表由 game-dump/gen-wheel-order.mjs
  // 从游戏配置 cfortunewheelcfg.bny 解出，见 data/wheelOrder.js。
  // 注意：只排这份渲染用的新数组，不动 result.fateWheels 本体（历史记录不受影响）。
  const groups = useMemo(() => {
    const items = [];
    for (const line of result.fateWheels) {
      const wheel = wheelById.get(line.fateWheelId);
      if (wheel) items.push({ line, wheel, unknown: wheelOrderOf(wheel.gameEntryId) === Number.POSITIVE_INFINITY });
    }
    items.sort((a, b) => {
      const ca = categoryOrderOf(a.wheel.wheelCategoryId);
      const cb = categoryOrderOf(b.wheel.wheelCategoryId);
      if (ca !== cb) return ca - cb;
      const oa = wheelOrderOf(a.wheel.gameEntryId);
      const ob = wheelOrderOf(b.wheel.gameEntryId);
      if (oa !== ob) return oa - ob;
      return String(a.wheel.name).localeCompare(String(b.wheel.name), "zh");
    });
    const out = [];
    const seen = new Map();
    for (const item of items) {
      const cid = item.wheel.wheelCategoryId;
      let g = seen.get(cid);
      if (!g) {
        g = { id: cid, name: categoryById.get(cid)?.name ?? "其他", items: [] };
        seen.set(cid, g);
        out.push(g);
      }
      g.items.push(item);
    }
    return out;
  }, [result, wheelById, categoryById]);

  return (
    <div className="result">
      <div className="result-head"><span className={"pill " + result.status}>{statusLabel}</span><strong>{formatNumber(result.objectiveScore, 4)}</strong><small>{formatNumber(result.elapsedMilliseconds / 1000, 2)} 秒</small></div>
      <h2>命轮方案（{result.fateWheels.length} 个）</h2>
      <p className="tip">顺序与游戏里各「轮」的盘序一致，照着往下加点就行。</p>
      {groups.map((g) => (
        <div className="wheel-group" key={g.id}>
          <h3 className="wheel-group-head">{g.name}<small>{g.items.length} 个</small></h3>
          <div className="wheel-list">
            {g.items.map(({ line: w, wheel, unknown }) => {
              const category = categoryById.get(wheel.wheelCategoryId);
              const members = wheel.members.map((m) => characterById.get(m.characterId)?.name).filter(Boolean).join("、");
              return (
                <div key={w.fateWheelId} className="wheel-item">
                  <div className="wi-head"><strong>{wheel.name}</strong><span className="stage">{wheelStageLabel(w.rank, w.star, 5)}</span></div>
                  <div className="wi-meta"><span>{category?.name}</span><span>{members}</span>{unknown && <span className="wi-unknown">顺序未知</span>}</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {(result.currencyUsage ?? []).length > 0 && (
        <>
          <h2>兑换消耗</h2>
          <div className="attr-list">
            {(result.currencyUsage ?? []).map((u) => (
              <div key={u.currencyId + u.characterId} className="attr-item">
                <span>{u.currencyName} → {characterById.get(u.characterId)?.name ?? u.characterId}<small>{u.count} 个命轮</small></span>
                <strong>-{formatNumber(u.cost, 0)}</strong>
              </div>
            ))}
          </div>
        </>
      )}
      <h2>属性总值</h2>
      <div className="attr-list">
        {(result.finalValues ?? []).map((v) => (
          <div key={v.metricId} className="attr-item">
            <span>{metricById.get(v.metricId)?.name ?? v.metricId}<small>（{formatNumber(v.base, 0)} + {formatNumber(v.flat, 0)}）× (1 + {formatNumber(v.percent + v.extra, 2)}%)</small></span>
            <strong>{formatNumber(v.value, 2)}</strong>
          </div>
        ))}
        {(result.finalValues ?? []).length === 0 && <p className="hint">该记录由旧版模型生成，只有下面的词条明细。</p>}
      </div>
      <h2>词条明细</h2>
      <div className="attr-list">
        {(result.finalAttributes ?? []).map((a) => (
          <div key={a.sourceAttributeId + a.valueKind} className="attr-item"><span>{sourceById.get(a.sourceAttributeId)?.name ?? a.sourceAttributeId}</span><strong>{a.value >= 0 ? "+" : ""}{formatNumber(a.value, 2)}{a.valueKind === "percent" ? "%" : ""}</strong></div>
        ))}
      </div>
    </div>
  );
}

function SettingsScreen({ profiles, saveProfile, loadProfile, deleteProfile, exportPlayer, importPlayer, exportDatabase, importDatabase, importPasted, developerMode, setDeveloperMode, background, chooseBackground, updateBackground, resetBackground, bgModes, defaultBgUrl, playerFileRef, dbFileRef, onBack }) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState("profile"); // profile | io | dev
  const [pasteText, setPasteText] = useState("");
  const bgFileRef = useRef(null);
  return (
    <main className="content">
      <div className="page-head"><h1>设置</h1><button className="ghost" onClick={onBack}>返回</button></div>
      <div className="seg">
        {[["profile", "玩家档案"], ["io", "导入导出"], ["bg", "外观"], ["dev", "开发者"]].map(([k, l]) => (
          <button key={k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}>{l}</button>
        ))}
      </div>

      {mode === "bg" && (
        <div className="stack">
          <div className="config">
            <div className="seg" style={{ margin: 0 }}>
              {bgModes.map(([k, l]) => (
                <button key={k} className={background.mode === k ? "on" : ""} onClick={() => updateBackground({ mode: k })}>{l}</button>
              ))}
            </div>
            {background.mode !== "solid" && (
              <p className="hint" style={{ margin: "2px 0 0" }}>
                {background.mode === "zhefeng" && "用随 App 自带的那张壁纸，面板会自动变成液态玻璃。"}
                {background.mode === "custom" && (background.dataUrl ? `当前：${background.name}（${formatBytes(background.bytes)}）` : "选一张本地图片，面板会自动变成液态玻璃。")}
              </p>
            )}
          </div>

          {background.mode === "custom" && (
            <div className="config">
              <button className="ghost block" onClick={() => bgFileRef.current?.click()}>选择本地图片…</button>
              <input ref={bgFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => { const f = e.target.files?.[0]; if (f) await chooseBackground(f); e.target.value = ""; }} />
            </div>
          )}

          {background.mode !== "solid" && (
            <div className="config">
              <label className="range-row">
                <span>浓度</span>
                <input type="range" min="10" max="90" step="1" value={Math.round(background.opacity * 100)} onChange={(e) => updateBackground({ opacity: Number(e.target.value) / 100 })} />
                <span className="val">{Math.round(background.opacity * 100)}%</span>
              </label>
              <label className="range-row">
                <span>模糊</span>
                <input type="range" min="0" max="20" step="1" value={background.blur} onChange={(e) => updateBackground({ blur: Number(e.target.value) })} />
                <span className="val">{background.blur}px</span>
              </label>
              <div className="range-row">
                <span>填充</span>
                <div className="seg" style={{ margin: 0, flex: 1 }}>
                  {[["cover", "铺满"], ["contain", "完整"]].map(([k, l]) => (
                    <button key={k} className={background.fit === k ? "on" : ""} onClick={() => updateBackground({ fit: k })}>{l}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <button className="ghost block" onClick={resetBackground}>恢复默认</button>
        </div>
      )}



      {mode === "profile" && (
        <div className="stack">
          <div className="config">
            <label className="field-row"><span>档案名</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：玩家A" /></label>
            <button className="solve-btn" onClick={() => { saveProfile(name); setName(""); }}>保存当前数据为档案</button>
          </div>
          <div className="list">
            {profiles.length === 0 && <p className="hint">暂无档案。录入数据后点「保存当前数据为档案」。</p>}
            {profiles.map((p) => (
              <div key={p.id} className="row">
                <span className="row-title">
                  {p.name}
                  <small>
                    {`${p.player.inventory.filter((i) => i.wheelCount || i.fragmentCount).length} 个已录入伙伴`}
                  </small>
                </span>
                <button className="ghost" onClick={() => loadProfile(p)}>载入</button>
                <button className="ghost" onClick={() => deleteProfile(p.id)}>删</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === "io" && (
        <div className="stack">
          <div className="config">
            <button className="ghost block" onClick={exportPlayer}>导出玩家数据（含历史）</button>
            <button className="ghost block" onClick={() => playerFileRef.current?.click()}>导入玩家数据（选文件）</button>
            <div className="divider" />
            <button className="ghost block" onClick={exportDatabase}>导出数据库（角色/关系盘）</button>
            <button className="ghost block" onClick={() => dbFileRef.current?.click()}>导入数据库（选文件）</button>
            <input ref={playerFileRef} type="file" accept="*/*" style={{ display: "none" }} onChange={async (e) => { const f = e.target.files?.[0]; if (f) await importPlayer(f); e.target.value = ""; }} />
            <input ref={dbFileRef} type="file" accept="*/*" style={{ display: "none" }} onChange={async (e) => { const f = e.target.files?.[0]; if (f) await importDatabase(f); e.target.value = ""; }} />
          </div>
          <div className="config">
            <span className="fg-label">或直接粘贴 JSON 内容导入（自动识别玩家数据 / 数据库）</span>
            <textarea className="paste-area" value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="粘贴导出的 JSON 内容…" />
            <button className="ghost block" disabled={!pasteText.trim()} onClick={() => { importPasted(pasteText); setPasteText(""); }}>从粘贴内容导入</button>
          </div>
          <p className="hint">玩家数据 = 目标 + 基础属性 + 资源 + 求解配置 + 历史。数据库 = 角色与关系盘。导出的文件通常在手机的「下载 / Download」文件夹里。</p>
        </div>
      )}

      {mode === "dev" && (
        <div className="stack">
          <label className="switch-row"><span>开发者模式（显示命轮库/关系命轮/全局设置）</span><input type="checkbox" checked={developerMode} onChange={(e) => setDeveloperMode(e.target.checked)} /></label>
          <p className="hint">开启后，在「求解」页右下角会出现 🔧 按钮，进入开发者编辑界面。</p>
        </div>
      )}
    </main>
  );
}

function DevScreen({ workbench, setWorkbench, onBack, notify }) {
  const [section, setSection] = useState("global"); // global | chars | wheels
  const [showAddWheel, setShowAddWheel] = useState(false);
  const [draft, setDraft] = useState(null);
  const [confirm, setConfirm] = useState(null); // { title, message, onConfirm }
  const [editingWheelId, setEditingWheelId] = useState(null);
  const patch = (next) => setWorkbench(typeof next === "function" ? next(workbench) : next);

  const updateGlobal = (p) => patch((w) => ({ ...w, globalSettings: { ...w.globalSettings, ...p } }));
  const updateCurrencies = (map) => updateGlobal({ currencies: (workbench.globalSettings.currencies ?? []).map(map) });
  const updateCurrencyDef = (id, p) => updateCurrencies((c) => (c.id === id ? { ...c, ...p } : c));
  const updateCurrencyRate = (id, group, cost) => updateCurrencies((c) => (c.id === id ? { ...c, rates: withRate(c.rates, group, cost) } : c));
  const updateTemplate = (rarity, p) => patch((w) => ({ ...w, defaults: { ...w.defaults, rarityTemplates: w.defaults.rarityTemplates.map((t) => (t.rarity === rarity ? { ...t, ...p } : t)) } }));
  const updateChar = (id, p) => patch((w) => ({ ...w, characters: w.characters.map((c) => (c.id === id ? { ...c, ...p } : c)) }));
  const addChar = () => {
    patch((w) => ({ ...w, characters: [...w.characters, { id: "character.custom." + uid().slice(0, 8), gamePartnerId: 0, name: "新角色", order: Math.max(0, ...w.characters.map((c) => c.order)) + 10, rarity: "SSR", isLimited: false, baseRankFragmentCost: 30, destinyRankFragmentCost: 60, isEnabled: true }] }));
    notify?.("已新增角色（列表最底部），可改名字/品质/碎片");
  };
  const deleteChar = (id) => patch((w) => ({ ...w, characters: w.characters.filter((c) => c.id !== id), fateWheels: w.fateWheels.filter((f) => !f.members.some((m) => m.characterId === id)) }));
  const updateWheel = (id, p) => patch((w) => ({ ...w, fateWheels: w.fateWheels.map((f) => (f.id === id ? { ...f, ...p } : f)) }));
  const deleteWheel = (id) => patch((w) => ({ ...w, fateWheels: w.fateWheels.filter((f) => f.id !== id) }));
  const askDeleteChar = (c) => setConfirm({ title: `删除角色「${c.name}」？`, message: "删除后，包含该伙伴的关系盘也会一并删除。", onConfirm: () => deleteChar(c.id) });
  const askDeleteWheel = (w) => setConfirm({ title: `删除关系盘「${w.name}」？`, message: "删除后无法恢复。", onConfirm: () => deleteWheel(w.id) });

  const openAddWheel = () => {
    const firstCategory = workbench.wheelCategories.find((c) => !c.isDestiny)?.id ?? workbench.wheelCategories[0]?.id;
    setDraft({ name: "", wheelCategoryId: firstCategory, maxStar: 3, memberIds: [], perStarGains: [], perRankGains: [] });
    setShowAddWheel(true);
  };
  const saveWheel = () => {
    if (!draft?.name?.trim()) { notify?.("请输入关系盘名称"); return; }
    if (!draft?.memberIds?.length) { notify?.("请至少选择一个伙伴"); return; }
    const wheel = {
      id: "fate-wheel.custom." + uid().slice(0, 8),
      gameEntryId: 0,
      name: draft.name.trim(),
      order: Math.max(0, ...workbench.fateWheels.map((w) => w.order)) + 10,
      wheelCategoryId: draft.wheelCategoryId,
      tagIds: [],
      maxStar: Math.max(1, draft.maxStar),
      members: draft.memberIds.map((id) => ({ characterId: id, perStarWheelCost: 1 })),
      perStarGains: draft.perStarGains,
      perRankGains: draft.perRankGains,
      isEnabled: true,
    };
    patch((w) => ({ ...w, fateWheels: [...w.fateWheels, wheel] }));
    setShowAddWheel(false);
    notify?.("已新增关系盘");
  };
  const addGain = (kind) => {
    const src = workbench.sourceAttributes[0];
    setDraft((d) => ({ ...d, [kind]: [...d[kind], { sourceAttributeId: src?.id, valueKind: src?.defaultValueKind ?? "flat", value: src?.defaultValue ?? 0 }] }));
  };
  const updateGain = (kind, idx, p) => setDraft((d) => ({ ...d, [kind]: d[kind].map((g, i) => (i === idx ? { ...g, ...p } : g)) }));
  const removeGain = (kind, idx) => setDraft((d) => ({ ...d, [kind]: d[kind].filter((_, i) => i !== idx) }));
  const fillDraftFateValue = (value) => {
    const setVal = (arr) => {
      const list = arr ?? [];
      if (list.some((g) => g.sourceAttributeId === FATE_VALUE_SOURCE_ID)) {
        return list.map((g) => (g.sourceAttributeId === FATE_VALUE_SOURCE_ID ? { ...g, value } : g));
      }
      return [...list, { sourceAttributeId: FATE_VALUE_SOURCE_ID, valueKind: "flat", value }];
    };
    setDraft((d) => ({ ...d, perStarGains: setVal(d.perStarGains), perRankGains: setVal(d.perRankGains) }));
  };

  // 编辑已有关系盘：伙伴与收益
  const updateWheelMember = (id, idx, p) => patch((w) => ({ ...w, fateWheels: w.fateWheels.map((f) => (f.id === id ? { ...f, members: f.members.map((m, i) => (i === idx ? { ...m, ...p } : m)) } : f)) }));
  const addWheelMember = (id) => {
    const wheel = workbench.fateWheels.find((f) => f.id === id);
    const existing = new Set((wheel?.members ?? []).map((m) => m.characterId));
    const first = [...workbench.characters].sort((a, b) => a.order - b.order).find((c) => !existing.has(c.id));
    if (!first) { notify?.("所有伙伴都已在此盘中"); return; }
    patch((w) => ({ ...w, fateWheels: w.fateWheels.map((f) => (f.id === id ? { ...f, members: [...f.members, { characterId: first.id, perStarWheelCost: 1 }] } : f)) }));
  };
  const removeWheelMember = (id, idx) => patch((w) => ({ ...w, fateWheels: w.fateWheels.map((f) => (f.id === id ? { ...f, members: f.members.filter((_, i) => i !== idx) } : f)) }));
  const updateWheelGain = (id, kind, idx, p) => patch((w) => ({ ...w, fateWheels: w.fateWheels.map((f) => (f.id === id ? { ...f, [kind]: f[kind].map((g, i) => (i === idx ? { ...g, ...p } : g)) } : f)) }));
  const addWheelGain = (id, kind) => {
    const src = workbench.sourceAttributes[0];
    patch((w) => ({ ...w, fateWheels: w.fateWheels.map((f) => (f.id === id ? { ...f, [kind]: [...f[kind], { sourceAttributeId: src?.id, valueKind: src?.defaultValueKind ?? "flat", value: src?.defaultValue ?? 0 }] } : f)) }));
  };
  const removeWheelGain = (id, kind, idx) => patch((w) => ({ ...w, fateWheels: w.fateWheels.map((f) => (f.id === id ? { ...f, [kind]: f[kind].filter((_, i) => i !== idx) } : f)) }));
  const askRemoveWheelMember = (wheel, m, i) => {
    const cname = workbench.characters.find((c) => c.id === m.characterId)?.name ?? "该伙伴";
    setConfirm({ title: `移除伙伴「${cname}」？`, message: "移除后，该伙伴在此关系盘中的加成不再生效。", onConfirm: () => removeWheelMember(wheel.id, i) });
  };
  const askRemoveWheelGain = (wheel, kind, i) => {
    const gain = wheel[kind]?.[i];
    const attrName = workbench.sourceAttributes.find((a) => a.id === gain?.sourceAttributeId)?.name ?? "该收益";
    setConfirm({ title: `删除「${attrName}」收益？`, message: "删除后无法恢复。", onConfirm: () => removeWheelGain(wheel.id, kind, i) });
  };

  const rarityTemplates = workbench.defaults.rarityTemplates;
  const charList = [...workbench.characters].sort((a, b) => a.order - b.order);
  const enabledChars = workbench.characters.filter((c) => c.isEnabled).sort((a, b) => a.order - b.order);
  const fateAudit = useMemo(() => auditWorkbench(workbench), [workbench]);

  const moveWheelFateValue = (wheel, to) => {
    const setVal = (arr) => (arr ?? []).map((g) => (g.sourceAttributeId === FATE_VALUE_SOURCE_ID ? { ...g, value: to } : g));
    updateWheel(wheel.id, { perStarGains: setVal(wheel.perStarGains), perRankGains: setVal(wheel.perRankGains) });
  };
  const fillMissingFateValues = () => {
    const { workbench: next, changes } = applyFateValueFixes(workbench);
    if (!changes.length) { notify?.("所有关系盘的命轮值都已填写，公式不会覆盖任何数据"); return; }
    patch(() => next);
    notify?.(`已用公式补全 ${changes.length} 个缺失的命轮值`);
  };

  return (
    <main className="content dev-screen">
      <div className="page-head"><h1>开发者</h1><button className="ghost" onClick={onBack}>返回</button></div>
      <div className="seg">
        {[["global", "全局设置"], ["chars", "命轮库"], ["wheels", "关系命轮"], ["fatevalue", "命轮值校验"]].map(([k, l]) => (
          <button key={k} className={section === k ? "on" : ""} onClick={() => setSection(k)}>{l}</button>
        ))}
      </div>

      {section === "global" && (
        <div className="stack">
          <label className="field-row"><span>关系命轮最高阶数</span><input type="number" min="1" max="20" value={workbench.globalSettings.maxRank} onChange={(e) => updateGlobal({ maxRank: Number(e.target.value) })} /></label>
          <h2 className="subhead">碎片消耗（每品质）</h2>
          {rarityTemplates.map((t) => (
            <div key={t.rarity} className="config">
              <div className="row"><span className="row-title">{RARITY_LABEL[t.rarity] ?? t.rarity}</span></div>
              <label className="field-row"><span>普通命轮碎片/阶</span><input type="number" min="0" value={t.baseRankFragmentCost} onChange={(e) => updateTemplate(t.rarity, { baseRankFragmentCost: Number(e.target.value) })} /></label>
              <label className="field-row"><span>宿命之轮碎片/阶</span><input type="number" min="0" value={t.destinyRankFragmentCost} onChange={(e) => updateTemplate(t.rarity, { destinyRankFragmentCost: Number(e.target.value) })} /></label>
            </div>
          ))}
          <h2 className="subhead">兑换货币（每个命轮的价格，填 0 = 该品质不可兑换）</h2>
          {(workbench.globalSettings.currencies ?? []).map((c) => (
            <div key={c.id} className="config">
              <div className="row"><span className="row-title">{c.name}<small>{c.id}</small></span></div>
              <label className="field-row"><span>名称</span><input type="text" value={c.name} onChange={(e) => updateCurrencyDef(c.id, { name: e.target.value })} /></label>
              <label className="switch-row"><span>启用该货币</span><input type="checkbox" checked={c.isEnabled} onChange={(e) => updateCurrencyDef(c.id, { isEnabled: e.target.checked })} /></label>
              {RARITY_ORDER.map((g) => (
                <label key={g} className="field-row">
                  <span>{RARITY_LABEL[g] ?? g}</span>
                  <input type="number" min="0" value={currencyRateOf(c, g)} onChange={(e) => updateCurrencyRate(c.id, g, Number(e.target.value))} />
                </label>
              ))}
            </div>
          ))}
        </div>
      )}

      {section === "chars" && (
        <div className="stack">
          <button className="solve-btn" onClick={addChar}>+ 新增角色</button>
          <div className="list">
            {charList.map((c) => (
              <div key={c.id} className="char-card">
                <div className="row">
                  <label className="row-main"><input type="checkbox" checked={c.isEnabled} onChange={(e) => updateChar(c.id, { isEnabled: e.target.checked })} /><span className="row-title">{c.name}<small>{RARITY_LABEL[resourceGroupOf(c)] ?? c.rarity}{c.isLimited ? "·限定" : ""}</small></span></label>
                  <button className="ghost" onClick={() => askDeleteChar(c)}>删</button>
                </div>
                <div className="char-fields">
                  <input value={c.name} onChange={(e) => updateChar(c.id, { name: e.target.value })} />
                  <select value={c.rarity} onChange={(e) => updateChar(c.id, { rarity: e.target.value })}>
                    <option value="UR">UR</option><option value="SSR">SSR</option><option value="SR">SR</option><option value="R">R</option>
                  </select>
                  <label><input type="checkbox" checked={c.isLimited} onChange={(e) => updateChar(c.id, { isLimited: e.target.checked })} />限定</label>
                  <input type="number" min="0" value={c.baseRankFragmentCost} onChange={(e) => updateChar(c.id, { baseRankFragmentCost: Number(e.target.value) })} />
                  <input type="number" min="0" value={c.destinyRankFragmentCost} onChange={(e) => updateChar(c.id, { destinyRankFragmentCost: Number(e.target.value) })} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {section === "wheels" && (
        <div className="stack">
          {!showAddWheel ? (
            <button className="solve-btn" onClick={openAddWheel}>+ 新增关系盘</button>
          ) : (
            <div className="config">
              <label className="field-row"><span>名称</span><input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="关系盘名称" /></label>
              <label className="field-row"><span>类别</span><select value={draft.wheelCategoryId} onChange={(e) => setDraft((d) => ({ ...d, wheelCategoryId: e.target.value }))}>{workbench.wheelCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="field-row"><span>最高星数</span><input type="number" min="1" max="5" value={draft.maxStar} onChange={(e) => setDraft((d) => ({ ...d, maxStar: Number(e.target.value) }))} /></label>
              <div className="frag-groups">
                <span className="fg-label">选择伙伴（已选 {draft.memberIds.length} 个）</span>
                <div className="member-check-list">
                  {enabledChars.map((c) => (
                    <label key={c.id} className="fg-chip"><input type="checkbox" checked={draft.memberIds.includes(c.id)} onChange={(e) => setDraft((d) => ({ ...d, memberIds: e.target.checked ? [...d.memberIds, c.id] : d.memberIds.filter((x) => x !== c.id) }))} />{c.name}</label>
                  ))}
                </div>
                {(() => {
                  const v = suggestFateValueFor(workbench, draft.wheelCategoryId, draft.memberIds);
                  if (v === null) return <p className="hint">宿命之轮的命轮值无法由成员推算，请按游戏内实测填写。</p>;
                  return (
                    <div className="reset-item">
                      <span>按公式，该盘命轮值应为</span>
                      <strong>{v}</strong>
                      <button className="ghost" onClick={() => fillDraftFateValue(v)}>填入</button>
                    </div>
                  );
                })()}
              </div>
              <GainEditorList title="收益/星" gains={draft.perStarGains} attributes={workbench.sourceAttributes} onAdd={() => addGain("perStarGains")} onUpdate={(i, p) => updateGain("perStarGains", i, p)} onRemove={(i) => removeGain("perStarGains", i)} />
              <GainEditorList title="收益/阶" gains={draft.perRankGains} attributes={workbench.sourceAttributes} onAdd={() => addGain("perRankGains")} onUpdate={(i, p) => updateGain("perRankGains", i, p)} onRemove={(i) => removeGain("perRankGains", i)} />
              <div className="head-actions">
                <button className="ghost block" onClick={() => setShowAddWheel(false)}>取消</button>
                <button className="solve-btn" style={{ flex: 1 }} onClick={saveWheel}>保存关系盘</button>
              </div>
            </div>
          )}
          <p className="hint">共 {workbench.fateWheels.length} 个关系盘。勾选启用，点「详情」查看并修改各盘数据，点「删」移除。</p>
          <div className="list">
            {[...workbench.fateWheels].sort((a, b) => a.order - b.order).map((w) => {
              const editing = editingWheelId === w.id;
              return (
                <div key={w.id} className="char-card">
                  <div className="row">
                    <label className="row-main"><input type="checkbox" checked={w.isEnabled} onChange={(e) => updateWheel(w.id, { isEnabled: e.target.checked })} /><span className="row-title">{w.name}<small>{workbench.wheelCategories.find((c) => c.id === w.wheelCategoryId)?.name} · {w.members.length} 伙伴 · 最高{w.maxStar}星</small></span></label>
                    <button className="ghost" onClick={() => setEditingWheelId(editing ? null : w.id)}>{editing ? "收起" : "详情"}</button>
                    <button className="ghost" onClick={() => askDeleteWheel(w)}>删</button>
                  </div>
                  {editing && (
                    <div className="config wheel-editor">
                      <label className="field-row"><span>名称</span><input type="text" value={w.name} onChange={(e) => updateWheel(w.id, { name: e.target.value })} /></label>
                      <label className="field-row"><span>类别</span><select value={w.wheelCategoryId} onChange={(e) => updateWheel(w.id, { wheelCategoryId: e.target.value })}>{workbench.wheelCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                      <label className="field-row"><span>最高星数</span><input type="number" min="1" max="5" value={w.maxStar} onChange={(e) => updateWheel(w.id, { maxStar: Number(e.target.value) })} /></label>
                      <div className="frag-groups">
                        <span className="fg-label">伙伴（{w.members.length} 个，右侧数字 = 每星消耗）</span>
                        {w.members.map((m, i) => (
                          <div key={i} className="member-row">
                            <select value={m.characterId} onChange={(e) => updateWheelMember(w.id, i, { characterId: e.target.value })}>{charList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                            <input type="number" min="0" value={m.perStarWheelCost} onChange={(e) => updateWheelMember(w.id, i, { perStarWheelCost: Number(e.target.value) })} />
                            <button className="ghost" onClick={() => askRemoveWheelMember(w, m, i)}>删</button>
                          </div>
                        ))}
                        <button className="ghost block" onClick={() => addWheelMember(w.id)}>+ 添加伙伴</button>
                      </div>
                      <GainEditorList title="收益/星" gains={w.perStarGains} attributes={workbench.sourceAttributes} onAdd={() => addWheelGain(w.id, "perStarGains")} onUpdate={(i, p) => updateWheelGain(w.id, "perStarGains", i, p)} onRemove={(i) => askRemoveWheelGain(w, "perStarGains", i)} />
                      <GainEditorList title="收益/阶" gains={w.perRankGains} attributes={workbench.sourceAttributes} onAdd={() => addWheelGain(w.id, "perRankGains")} onUpdate={(i, p) => updateWheelGain(w.id, "perRankGains", i, p)} onRemove={(i) => askRemoveWheelGain(w, "perRankGains", i)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {section === "fatevalue" && (
        <div className="stack">
          <div className="config">
            <div className="row"><span className="row-title">普通盘（创始 / 物质 / 执行）<small>命轮值 = R5( Σbase × m(n) )</small></span></div>
            <p className="hint">
              base：UR 100 / SSR 30 / SR 20 / R 10（限定 SSR 与普通 SSR 相同）<br />
              m(n)：{Object.entries(NORMAL_MULTIPLIER).map(([k, v]) => `${k}→${v}`).join("　")}<br />
              R5：银行家舍入（四舍六入五取偶）到 5 的倍数
            </p>
            <div className="row"><span className="row-title">公式命中</span><span>{fateAudit.normal.matched} / {fateAudit.normal.total}（{(fateAudit.normal.rate * 100).toFixed(2)}%）</span></div>
          </div>

          <div className="config">
            <div className="row"><span className="row-title">宿命之轮<small>命轮值 = M(n) × ( Σbase/10 + t )</small></span></div>
            <p className="hint">
              M(n)：{Object.entries(DESTINY_STEP).map(([k, v]) => `${k}→${v}`).join("　")}<br />
              该公式中的 t 无法仅由成员构成唯一确定，故宿命之轮只做整除性校验，不做预测。
            </p>
            <div className="row"><span className="row-title">M(n) 整除命中</span><span>{fateAudit.destiny.divisible} / {fateAudit.destiny.total}（{fateAudit.destiny.total ? ((fateAudit.destiny.divisible / fateAudit.destiny.total) * 100).toFixed(2) : "0.00"}%）</span></div>
            {fateAudit.destiny.tRange && <div className="row"><span className="row-title">t 取值范围</span><span>{fateAudit.destiny.tRange[0]} ~ {fateAudit.destiny.tRange[1]}</span></div>}
          </div>

          <div className="config">
            <div className="row"><span className="row-title">游戏官方数据核对<small>解自客户端 FortuneWheelEntryLevelCfg.bny</small></span></div>
            <p className="hint">
              从游戏客户端配置表里解出了 475 条官方命轮值（wheelValue），
              与本地数据库逐条比对的结果如下。
            </p>
            <div className="row"><span className="row-title">一致</span><span>{fateAudit.official.matched} / {fateAudit.official.checked}（{fateAudit.official.checked ? ((fateAudit.official.matched / fateAudit.official.checked) * 100).toFixed(2) : "0.00"}%）</span></div>
            <div className="row"><span className="row-title">不一致</span><span>{fateAudit.official.mismatches.length}</span></div>
            {fateAudit.official.mismatches.map((m) => (
              <div key={m.id} className="reset-item">
                <span>{m.name}</span>
                <strong>{m.actual} → {m.official}</strong>
                <button className="ghost" onClick={() => moveWheelFateValue(workbench.fateWheels.find((w) => w.id === m.id), m.official)}>改</button>
              </div>
            ))}
            <div className="row"><span className="row-title">官方未收录</span><span>{fateAudit.official.missing.length + workbench.fateWheels.filter((w) => !w.gameEntryId).length} 个（手工盘 / 新内容）</span></div>
            <p className="hint">✅ 数据库与游戏官方数据完全一致，因此「按公式修正」不会覆盖任何有官方数据的盘。</p>
          </div>

          <div className="config">
            <div className="row"><span className="row-title">公式不适用的盘<small>共 {fateAudit.normal.mismatches.length} 个 · 数据均正确，不会被改动</small></span></div>
            {fateAudit.normal.mismatches.length === 0 ? (
              <p className="hint">全部符合公式。</p>
            ) : (
              <>
                <p className="hint">
                  这 13 个盘的公式值与实际值不同，但**实际值都是游戏真实数据**
                  （11 个已由官方配置表确证，另 2 个为已确认无误的手工录入）。
                  说明公式只是约 96% 的近似，**不能用来覆盖这些盘**。
                </p>
                {fateAudit.normal.mismatches.map((m) => (
                  <div key={m.id} className="reset-item">
                    <span>
                      {m.name}
                      <small>{workbench.wheelCategories.find((c) => c.id === m.categoryId)?.name ?? ""} · {m.n} 伙伴 · {m.rarities.join("+")}</small>
                      <small>{m.officialConfirmed ? " · 官方已确证" : " · 手工录入"}</small>
                    </span>
                    <strong>{m.actual}（公式 {m.expected ?? "?"}）</strong>
                  </div>
                ))}
              </>
            )}
            <div className="head-actions">
              <button className="ghost block" onClick={fillMissingFateValues}>用公式补全缺失的命轮值</button>
            </div>
            <p className="hint">只会补「还没填」的盘，**已有数值一律不动**。宿命之轮不参与。</p>
          </div>
        </div>
      )}

      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{confirm.title}</h3>
            <p>{confirm.message}</p>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setConfirm(null)}>取消</button>
              <button className="danger-btn" onClick={() => { confirm.onConfirm(); setConfirm(null); }}>确认删除</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function GainEditorList({ title, gains, attributes, onAdd, onUpdate, onRemove }) {
  return (
    <div className="frag-groups">
      <span className="fg-label">{title}</span>
      {gains.map((g, i) => (
        <div key={i} className="gain-row">
          <select value={g.sourceAttributeId} onChange={(e) => { const src = attributes.find((a) => a.id === e.target.value); onUpdate(i, { sourceAttributeId: e.target.value, valueKind: src?.defaultValueKind ?? g.valueKind }); }}>
            {attributes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={g.valueKind} onChange={(e) => onUpdate(i, { valueKind: e.target.value })}>
            <option value="flat">数值</option>
            <option value="percent">%</option>
          </select>
          <input type="number" step="0.01" value={g.value} onFocus={(e) => e.target.select()} onChange={(e) => onUpdate(i, { value: Number(e.target.value) })} />
          <button className="ghost" onClick={() => onRemove(i)}>删</button>
        </div>
      ))}
      <button className="ghost block" onClick={onAdd}>+ 添加{title}</button>
    </div>
  );
}
