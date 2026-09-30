// App 内嵌的使用指南。图片放在 src/assets/guide/，以后换图直接替换同名文件即可。
import img1 from "../../assets/guide/shizuku-1.png";
import img2 from "../../assets/guide/shizuku-2.png";
import img3 from "../../assets/guide/shizuku-3.png";
import img4 from "../../assets/guide/shizuku-4.png";
import plan1 from "../../assets/guide/plan-1.jpg";
import con1 from "../../assets/guide/console-1.png";
import con2 from "../../assets/guide/console-2.png";
import con3 from "../../assets/guide/console-3.png";

export const GUIDE_STEPS = [
  {
    title: "1. 装好 Shizuku，打开它",
    text: "没装的话去 GitHub 下（手机上也放了 Shizuku-v13.6.0.apk）。打开后看到「通过无线调试启动」这张卡片，点里面的「分步骤指南」。",
    images: [img1],
  },
  {
    title: "2. 先开「开发者选项」",
    text: "设置 → 关于手机 → 连点「版本号」7 次，就会多出「开发者选项」。进去把「USB 调试」也打开。",
    images: [img2],
  },
  {
    title: "3. 打开「无线调试」，拿配对码",
    text: "开发者选项 → 无线调试 → 打开开关 → 点「使用配对码配对设备」，会弹出一个 6 位配对码和 IP 端口，先别关。",
    images: [img3],
  },
  {
    title: "4. 从通知栏把配对码填给 Shizuku",
    text: "下拉通知栏，找到 Shizuku 的通知「已找到配对服务」，点「输入配对码」，把刚才那 6 位填进去。",
    images: [img4],
  },
  {
    title: "5. 回 Shizuku 点「启动」",
    text: "配对完成后回到 Shizuku，点「启动」。看到「已运行」就成了。",
    images: [],
  },
];

/** 命令行那一段的图文步骤 */
export const CONSOLE_STEPS = [
  {
    title: "① 先在游戏里进命轮界面",
    text: "游戏里打开「命运之轮」→「命轮方案」，确认自己在命轮相关的界面里。命令只有在命轮界面才能用，否则会提示「当前命轮界面未打开」。",
    images: [plan1],
  },
  {
    title: "② 回到栀子花，点「打开」",
    text: "「资源」页 → 读取面板 → 🖥 游戏命令行 → 点「打开」。App 会自动切到游戏、发那个手势把命令行调出来。",
    images: [],
  },
  {
    title: "③ 点工具条上的放大镜 🔍",
    text: "命令行只会先露出顶上一条工具条。点最左边那个放大镜，完整的命令行面板才会展开。",
    images: [con1],
  },
  {
    title: "④ 在底部输入命令，点「执行」",
    text: "在左下角「输入命令」那个框里敲 printfortunewheel，然后点右边的「执行」。",
    images: [con2],
  },
  {
    title: "⑤ 在弹出的日志面板里点右下角的 ⬇",
    text: "执行完会弹出日志面板（左边列着几次记录，右边是内容）。点右下角那个下载样子的按钮，就会把结果存成文件。",
    images: [con3],
  },
  {
    title: "⑥ 回栀子花点「开始读取」",
    text: "App 会自动找到最新那份日志、解析成每个伙伴的命轮数量，给你一张可以改的表。",
    images: [],
  },
];

/** 命令行使用警告（App 里多处复用这份文案） */
export const CONSOLE_WARNING = [
  "只读取数据（在命令行执行 printfortunewheel 看库存）不会封号 —— 本工具只做这一件事。",
  "不要滥用命令行：别用它改数据、刷货币、刷道具、跳关卡、改等级。那属于修改游戏数据，有封号风险。",
  "因滥用命令行导致的一切后果（封号、回档、追责）由使用者自负，本工具与作者概不负责。",
];

/** 指南正文（放在弹层里） */
export function GuideBody() {
  return (
    <div className="guide-body">
      <h2 className="guide-h2">一、装 Shizuku（只做一次）</h2>
      {GUIDE_STEPS.map((s, i) => (
        <div key={i} className="guide-step">
          <h3>{s.title}</h3>
          <p>{s.text}</p>
          {s.images.map((src, j) => (
            <img key={j} src={src} alt={s.title} className="guide-img" />
          ))}
        </div>
      ))}

      <h2 className="guide-h2">二、用命令行读命轮库存</h2>

      <div className="guide-warn">
        <b>⚠️ 用之前先看清楚</b>
        <ul>
          {CONSOLE_WARNING.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      </div>

      {CONSOLE_STEPS.map((s, i) => (
        <div key={i} className="guide-step">
          <h3>{s.title}</h3>
          <p>{s.text}</p>
          {s.images.map((src, j) => (
            <img key={j} src={src} alt={s.title} className="guide-img" />
          ))}
        </div>
      ))}

      <p className="tip">
        手机重启后 Shizuku 会停，要重新做第 3、4、5 步。
        栀子花在需要权限时会提示你。
      </p>
    </div>
  );
}
