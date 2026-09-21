// 求解 Worker：HiGHS 的 solve() 是同步阻塞调用，放在主线程会让界面假死、
// 「取消」按钮也点不动。放进 Worker 后主线程保持响应，取消 = terminate() 立即生效。
import { solveWorkbench } from "./solver.js";

self.onmessage = async (event) => {
  const message = event.data ?? {};
  if (message.type !== "solve") return;
  const { requestId, workbench, userPlan } = message;
  try {
    const result = await solveWorkbench(workbench, userPlan, (progress) => {
      self.postMessage({ type: "progress", requestId, message: progress });
    });
    self.postMessage({ type: "result", requestId, result });
  } catch (error) {
    self.postMessage({ type: "error", requestId, message: error instanceof Error ? error.message : String(error) });
  }
};
