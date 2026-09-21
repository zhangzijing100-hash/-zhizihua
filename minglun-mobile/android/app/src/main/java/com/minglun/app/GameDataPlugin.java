package com.minglun.app;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

import rikka.shizuku.Shizuku;

/**
 * 读游戏写的调试日志。
 *
 * 游戏里执行 printfortunewheel 后，日志面板点「保存」会把结果写成
 *   /sdcard/Android/data/&lt;包名&gt;/files/DebugLog/Debug-&lt;时间&gt;.log
 * 这个目录普通 App 读不到（Android 11+ 的 Android/data 限制），所以借
 * Shizuku 以 shell 身份跑 ls / cat。
 */
@CapacitorPlugin(name = "GameData")
public class GameDataPlugin extends Plugin {

    private static final String SHIZUKU_PKG = "moe.shizuku.privileged.api";
    private static final int PERMISSION_REQUEST_CODE = 4001;
    private static final long CMD_TIMEOUT_SEC = 15;

    /** 列出所有渠道服里最新的若干份日志（按修改时间倒序） */
    private static final String LIST_LOGS =
            "ls -t /sdcard/Android/data/*/files/DebugLog/Debug-*.log 2>/dev/null";

    private PluginCall pendingPermissionCall;

    // ---------------------------------------------------------------- 权限

    private boolean shizukuInstalled() {
        try {
            getContext().getPackageManager().getPackageInfo(SHIZUKU_PKG, 0);
            return true;
        } catch (Throwable t) {
            return false;
        }
    }

    private boolean shizukuRunning() {
        try {
            return Shizuku.pingBinder();
        } catch (Throwable t) {
            return false;
        }
    }

    private boolean shizukuGranted() {
        try {
            return Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED;
        } catch (Throwable t) {
            return false;
        }
    }

    /** 返回第一个不满足的条件；都满足返回 null */
    private String failCode() {
        if (!shizukuInstalled()) return "NEED_SHIZUKU_INSTALL";
        if (!shizukuRunning()) return "NEED_SHIZUKU_START";
        if (!shizukuGranted()) return "NEED_SHIZUKU_PERMISSION";
        return null;
    }

    private static String hint(String code) {
        switch (code) {
            case "NEED_SHIZUKU_INSTALL": return "没装 Shizuku";
            case "NEED_SHIZUKU_START": return "Shizuku 没在运行";
            case "NEED_SHIZUKU_PERMISSION": return "没有 Shizuku 权限";
            default: return "Shizuku 不可用";
        }
    }

    @PluginMethod
    public void probe(PluginCall call) {
        JSObject o = new JSObject();
        o.put("installed", shizukuInstalled());
        o.put("running", shizukuRunning());
        o.put("granted", shizukuGranted());
        int version = 0;
        try { version = Shizuku.getVersion(); } catch (Throwable ignored) { }
        o.put("version", version);
        call.resolve(o);
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        String code = failCode();
        if (!"NEED_SHIZUKU_PERMISSION".equals(code) && code != null) {
            call.reject(hint(code), code);
            return;
        }
        if (code == null) { call.resolve(); return; }
        try {
            if (Shizuku.isPreV11() || Shizuku.shouldShowRequestPermissionRationale()) {
                call.reject("请到 Shizuku 里手动给栀子花授权", "NEED_SHIZUKU_PERMISSION");
                return;
            }
            Shizuku.addRequestPermissionResultListener(listener);
            pendingPermissionCall = call;
            Shizuku.requestPermission(PERMISSION_REQUEST_CODE);
        } catch (Throwable t) {
            call.reject(String.valueOf(t.getMessage()), "NEED_SHIZUKU_PERMISSION");
        }
    }

    private final Shizuku.OnRequestPermissionResultListener listener =
            new Shizuku.OnRequestPermissionResultListener() {
                @Override
                public void onRequestPermissionResult(int requestCode, int grantResult) {
                    if (requestCode != PERMISSION_REQUEST_CODE) return;
                    PluginCall pending = pendingPermissionCall;
                    pendingPermissionCall = null;
                    if (pending == null) return;
                    if (grantResult == PackageManager.PERMISSION_GRANTED) pending.resolve();
                    else pending.reject("没有拿到 Shizuku 权限", "NEED_SHIZUKU_PERMISSION");
                }
            };

    @PluginMethod
    public void openShizuku(PluginCall call) {
        JSObject o = new JSObject();
        boolean opened = false;
        try {
            Intent it = getContext().getPackageManager().getLaunchIntentForPackage(SHIZUKU_PKG);
            if (it != null) {
                it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(it);
                opened = true;
            }
        } catch (Throwable ignored) { }
        o.put("opened", opened);
        call.resolve(o);
    }

    // ---------------------------------------------------------------- 读日志

    /** 以 shell 身份跑一条命令，返回 stdout+stderr */
    private static java.lang.reflect.Method NEW_PROCESS;

    /**
     * Shizuku 13.1.5 把 newProcess 改成了 private，公开 API 里只剩 bindUserService。
     * 这个类在 App 自己的类路径上（不是 framework 类），所以反射不受 hidden-api 限制。
     * 失败时抛出来，由调用方转成给用户看的提示。
     */
    private static Process newShellProcess(String cmd) throws Exception {
        if (NEW_PROCESS == null) {
            java.lang.reflect.Method m = Shizuku.class.getDeclaredMethod(
                    "newProcess", String[].class, String[].class, String.class);
            m.setAccessible(true);
            NEW_PROCESS = m;
        }
        Object p = NEW_PROCESS.invoke(null, new String[]{"sh", "-c", cmd}, null, null);
        if (!(p instanceof Process)) throw new Exception("Shizuku 返回了非 Process");
        return (Process) p;
    }

    private String runShell(String cmd) throws Exception {
        Process p;
        try {
            p = newShellProcess(cmd);
        } catch (Throwable t) {
            throw new Exception("Shizuku 起进程失败: " + t.getMessage());
        }
        if (p == null) throw new Exception("Shizuku 返回了空进程");

        final ByteArrayOutputStream out = new ByteArrayOutputStream();
        Thread t1 = pump(p.getInputStream(), out);
        Thread t2 = pump(p.getErrorStream(), out);

        // 注意：不能用 Process.waitFor(timeout) —— 它的默认实现会调 exitValue()，
        // 而 ShizukuRemoteProcess 在进程未退出时抛的是 RuntimeException("process hasn't exited")，
        // 不是标准的 IllegalThreadStateException，会把 waitFor 直接炸掉。
        // 改成以「stdout 读到 EOF」作为结束判据（shell 命令退出时管道自然关闭）。
        t1.join(CMD_TIMEOUT_SEC * 1000);
        if (t1.isAlive()) {
            p.destroy();
            throw new Exception("命令超时（" + CMD_TIMEOUT_SEC + "s）");
        }
        t2.join(1500);
        try { p.waitFor(); } catch (Throwable ignored) { }
        synchronized (out) { return out.toString("UTF-8"); }
    }

    private Thread pump(final InputStream in, final ByteArrayOutputStream out) {
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                byte[] buf = new byte[8192];
                try {
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        synchronized (out) { out.write(buf, 0, n); }
                    }
                } catch (Throwable ignored) { }
            }
        });
        t.setDaemon(true);
        t.start();
        return t;
    }

    @PluginMethod
    public void readFortuneLog(PluginCall call) {
        String code = failCode();
        if (code != null) {
            call.reject(hint(code), code);
            return;
        }
        try {
            String listing = runShell(LIST_LOGS + " | head -20");
            List<String> candidates = new ArrayList<>();
            for (String line : listing.split("\n")) {
                String s = line.trim();
                if (!s.isEmpty()) candidates.add(s);
            }

            JSArray arr = new JSArray();
            for (String c : candidates) arr.put(c);

            JSObject o = new JSObject();
            o.put("candidates", arr);

            if (candidates.isEmpty()) {
                o.put("path", JSObject.NULL);
                o.put("name", JSObject.NULL);
                o.put("text", "");
                call.resolve(o);
                return;
            }

            String newest = candidates.get(0);
            // 用 base64 传，免得日志里的制表符/引号被 shell 或 JSON 折腾
            String b64 = runShell("base64 " + quote(newest));
            String text;
            try {
                text = new String(Base64.decode(b64.replaceAll("\\s", ""), Base64.DEFAULT), StandardCharsets.UTF_8);
            } catch (Throwable t) {
                text = b64;
            }

            o.put("path", newest);
            o.put("name", newest.substring(newest.lastIndexOf('/') + 1));
            o.put("text", text);
            call.resolve(o);
        } catch (Throwable t) {
            call.reject(String.valueOf(t.getMessage()), "READ_FAILED");
        }
    }

    private static String quote(String s) {
        return "'" + s.replace("'", "'\\''") + "'";
    }

    // ================================================================
    //  控制台自动化
    //
    //  游戏里那个调试控制台的打开方式是一个 30 段方向序列手势，打开后
    //  可以输命令、执行、保存日志。这里把它整条做成可程序化的。
    //  坐标以 1920×1080 为参考，按实际逻辑分辨率等比缩放。
    // ================================================================

    private static final int REF_W = 1920, REF_H = 1080;
    private static final int P_SEARCH_X = 576, P_SEARCH_Y = 40;      // 工具条上的放大镜
    private static final int P_INPUT_X = 441, P_INPUT_Y = 740;       // 「输入命令」输入框
    private static final int P_EXEC_X = 774, P_EXEC_Y = 740;         // 「执行」
    private static final int P_SAVE_X = 1836, P_SAVE_Y = 823;        // 日志面板右下角 ⬇（保存）
    // 面板打开时这块是浅灰表格底；关着时是游戏画面（深蓝）。用平均亮度判别。
    private static final int PROBE_X = 600, PROBE_Y = 200, PROBE_W = 250, PROBE_H = 400;

    private int dispW() {
        android.util.DisplayMetrics dm = getContext().getResources().getDisplayMetrics();
        return dm.widthPixels;
    }

    private int dispH() {
        android.util.DisplayMetrics dm = getContext().getResources().getDisplayMetrics();
        return dm.heightPixels;
    }

    private int sx(int x) { return Math.round(x * dispW() / (float) REF_W); }

    private int sy(int y) { return Math.round(y * dispH() / (float) REF_H); }

    private static void sleepMs(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException ignored) { }
    }

    /** 跑一条 shell 命令，等它结束 */
    private String sh(String cmd) throws Exception {
        return runShell(cmd);
    }

    private void tapRef(int x, int y) throws Exception {
        sh("input tap " + sx(x) + " " + sy(y));
        sleepMs(500);
    }

    /** 30 段方向序列手势。角度必须落在游戏那边的 5 个 90° 扇区循环里。 */
    private List<int[]> gesturePath() {
        final double[] DIRS = {135, -45, 175, 45, -135};
        final int SEG = 30, OUT1 = 80, OUT2 = 140, TURN = 100;
        List<double[]> pts = new ArrayList<>();
        pts.add(new double[]{0, 0});
        double ox = 0, oy = 0;
        for (int i = 0; i < SEG; i++) {
            double d = DIRS[i % 5];
            double ux = Math.cos(Math.toRadians(d)), uy = Math.sin(Math.toRadians(d));
            pts.add(new double[]{ox + OUT1 * ux, oy + OUT1 * uy});
            pts.add(new double[]{ox + OUT2 * ux, oy + OUT2 * uy});
            if (i < SEG - 1) {
                double nd = DIRS[(i + 1) % 5];
                ox += TURN * Math.cos(Math.toRadians(nd));
                oy += TURN * Math.sin(Math.toRadians(nd));
                pts.add(new double[]{ox, oy});
            }
        }
        double minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
        for (double[] p : pts) {
            minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
            minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
        }
        int W = dispW(), H = dispH();
        double dx = (W - (maxX - minX)) / 2 - minX, dy = (H - (maxY - minY)) / 2 - minY;
        List<int[]> out = new ArrayList<>();
        for (double[] p : pts) out.add(new int[]{(int) Math.round(p[0] + dx), (int) Math.round(p[1] + dy)});
        return out;
    }

    /** 发一次手势（切换控制台工具条的显示状态） */
    private void sendGesture() throws Exception {
        List<int[]> path = gesturePath();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < path.size(); i++) {
            int[] p = path.get(i);
            sb.append("input motionevent ").append(i == 0 ? "DOWN " : "MOVE ")
              .append(p[0]).append(' ').append(p[1]).append("; sleep 0.05; ");
        }
        int[] last = path.get(path.size() - 1);
        sb.append("input motionevent UP ").append(last[0]).append(' ').append(last[1]).append(';');
        sh(sb.toString());
        sleepMs(1200);
    }

    /** 截图并算某块区域的平均亮度（0..255）。用 android.graphics 解码，走 App 进程。 */
    private double regionAvg(int rx, int ry, int rw, int rh) throws Exception {
        String png = sh("screencap -p | base64");
        byte[] raw = Base64.decode(png.replaceAll("\\s", ""), Base64.DEFAULT);
        android.graphics.Bitmap bmp = android.graphics.BitmapFactory.decodeByteArray(raw, 0, raw.length);
        if (bmp == null) throw new Exception("截图解码失败");
        int x = Math.max(0, sx(rx)), y = Math.max(0, sy(ry));
        int w = Math.min(bmp.getWidth() - x, sx(rw)), h = Math.min(bmp.getHeight() - y, sy(rh));
        if (w <= 0 || h <= 0) { bmp.recycle(); throw new Exception("探测区域超出屏幕"); }
        long sum = 0; int n = 0;
        for (int j = y; j < y + h; j += 4) {
            for (int i = x; i < x + w; i += 4) {
                int c = bmp.getPixel(i, j);
                sum += ((c >> 16 & 0xff) + (c >> 8 & 0xff) + (c & 0xff)) / 3;
                n++;
            }
        }
        bmp.recycle();
        return n == 0 ? 0 : (double) sum / n;
    }

    /** 装了的游戏渠道服包名（zulong 家的） */
    @PluginMethod
    public void listGamePackages(PluginCall call) {
        String code = failCode();
        if (code != null) { call.reject(hint(code), code); return; }
        try {
            // 不过 grep，直接在 Java 里过滤，免得 toybox 的 grep 参数差异
            String out = sh("pm list packages");
            JSArray arr = new JSArray();
            for (String line : out.split("\n")) {
                String s = line.trim();
                if (s.startsWith("package:")) s = s.substring("package:".length()).trim();
                if (s.startsWith("com.zulong")) arr.put(s);
            }
            JSObject o = new JSObject();
            o.put("packages", arr);
            o.put("raw", out.length() > 400 ? out.substring(0, 400) : out);
            call.resolve(o);
        } catch (Throwable t) {
            call.reject(String.valueOf(t.getMessage()), "LIST_FAILED");
        }
    }

    @PluginMethod
    public void automationInfo(PluginCall call) {
        JSObject o = new JSObject();
        o.put("width", dispW());
        o.put("height", dispH());
        o.put("refWidth", REF_W);
        o.put("refHeight", REF_H);
        o.put("scaleX", dispW() / (double) REF_W);
        o.put("scaleY", dispH() / (double) REF_H);
        call.resolve(o);
    }

    /** 取一块矩形里「偏亮像素」的占比，参数是屏幕宽高的百分比 */
    private double lightIn(android.graphics.Bitmap bmp, double x0, double y0, double x1, double y1) {
        int W = bmp.getWidth(), H = bmp.getHeight();
        int ax = Math.max(0, (int) (W * x0)), ay = Math.max(0, (int) (H * y0));
        int bx = Math.min(W, (int) (W * x1)), by = Math.min(H, (int) (H * y1));
        long lit = 0, total = 0;
        for (int y = ay; y < by; y += 6) {
            for (int x = ax; x < bx; x += 6) {
                int c = bmp.getPixel(x, y);
                int b = ((c >> 16 & 0xff) + (c >> 8 & 0xff) + (c & 0xff)) / 3;
                if (b > 160) lit++;
                total++;
            }
        }
        return total == 0 ? 0 : (double) lit / total;
    }

    /**
     * 调试用：把几个候选区域的亮度占比都打出来，方便按机型定阈值。
     * 全部是「屏幕宽高百分比」，跟分辨率无关。
     */
    @PluginMethod
    public void consoleProbe(PluginCall call) {
        String code = failCode();
        if (code != null) { call.reject(hint(code), code); return; }
        try {
            String png = sh("screencap -p | base64");
            byte[] raw = Base64.decode(png.replaceAll("\\s", ""), Base64.DEFAULT);
            android.graphics.Bitmap bmp = android.graphics.BitmapFactory.decodeByteArray(raw, 0, raw.length);
            if (bmp == null) throw new Exception("截图解码失败");
            JSObject o = new JSObject();
            o.put("all", lightIn(bmp, 0, 0, 1, 1));
            o.put("topStrip", lightIn(bmp, 0, 0, 1, 0.05));        // 顶部工具条
            o.put("leftBlock", lightIn(bmp, 0.15, 0.10, 0.42, 0.90)); // 左侧面板区
            o.put("bottomBar", lightIn(bmp, 0.15, 0.66, 0.45, 0.72)); // 命令行输入框那一条
            o.put("width", bmp.getWidth());
            o.put("height", bmp.getHeight());
            bmp.recycle();
            call.resolve(o);
        } catch (Throwable t) {
            call.reject(String.valueOf(t.getMessage()), "PROBE_FAILED");
        }
    }

    /** 切到游戏 */
    @PluginMethod
    public void launchGame(PluginCall call) {
        String pkg = call.getString("packageName");
        if (pkg == null || pkg.isEmpty()) { call.reject("缺少 packageName"); return; }
        String code = failCode();
        if (code != null) { call.reject(hint(code), code); return; }
        try {
            sh("monkey -p " + pkg + " -c android.intent.category.LAUNCHER 1");
            sleepMs(2500);
            call.resolve();
        } catch (Throwable t) {
            call.reject(String.valueOf(t.getMessage()), "LAUNCH_FAILED");
        }
    }

    /** 切回栀子花 */
    @PluginMethod
    public void backToApp(PluginCall call) {
        String code = failCode();
        if (code != null) { call.reject(hint(code), code); return; }
        try {
            sh("am start -n " + getContext().getPackageName() + "/.MainActivity");
            call.resolve();
        } catch (Throwable t) {
            call.reject(String.valueOf(t.getMessage()), "LAUNCH_FAILED");
        }
    }

    /**
     * 命令行面板打开时，屏幕上会有一大块浅灰的表格底。
     * 这里统计「整屏里偏亮的像素占比」——跟分辨率无关，比抠某一块区域稳。
     * 采样步长 8px，返回 0..1。
     */
    private double lightRatio() throws Exception {
        String png = sh("screencap -p | base64");
        byte[] raw = Base64.decode(png.replaceAll("\\s", ""), Base64.DEFAULT);
        android.graphics.Bitmap bmp = android.graphics.BitmapFactory.decodeByteArray(raw, 0, raw.length);
        if (bmp == null) throw new Exception("截图解码失败");
        int W = bmp.getWidth(), H = bmp.getHeight();
        long lit = 0, total = 0;
        for (int y = 0; y < H; y += 8) {
            for (int x = 0; x < W; x += 8) {
                int c = bmp.getPixel(x, y);
                int b = ((c >> 16 & 0xff) + (c >> 8 & 0xff) + (c & 0xff)) / 3;
                if (b > 160) lit++;
                total++;
            }
        }
        bmp.recycle();
        return total == 0 ? 0 : (double) lit / total;
    }

    /** 命令行面板算「开着」的亮度比例阈值 */
    private static final double LIGHT_OPEN = 0.10;

    /**
     * 打开 / 关闭游戏里的调试命令行。
     *
     * 注意：**调用方要先把游戏切到前台**，否则手势会发到栀子花自己身上。
     * 每次调用只做一个动作（不循环），避免来回横跳。
     *
     * 返回 {ok, open, light, lightBefore, changed, steps}
     */
    @PluginMethod
    public void setConsole(PluginCall call) {
        Boolean wantOpen = call.getBoolean("open", Boolean.FALSE);
        final boolean open = wantOpen != null && wantOpen;
        String code = failCode();
        if (code != null) { call.reject(hint(code), code); return; }
        JSArray steps = new JSArray();
        try {
            double before = lightRatio();
            boolean isOpen = before > LIGHT_OPEN;
            steps.put("起始亮度比例 " + String.format(java.util.Locale.US, "%.3f", before) + (isOpen ? "（判定为开着）" : "（判定为关着）"));

            boolean changed = false;
            if (open != isOpen) {
                sendGesture();
                steps.put("发了一次手势");
                if (open) {
                    tapRef(P_SEARCH_X, P_SEARCH_Y);
                    steps.put("点了工具条上的放大镜");
                }
                sleepMs(900);
                changed = true;
            } else {
                steps.put("状态已经是目标状态，没动手势");
            }

            double after = changed ? lightRatio() : before;
            steps.put("结束亮度比例 " + String.format(java.util.Locale.US, "%.3f", after));

            JSObject o = new JSObject();
            o.put("ok", true);
            o.put("open", after > LIGHT_OPEN);
            o.put("light", after);
            o.put("lightBefore", before);
            o.put("changed", changed);
            o.put("steps", steps);
            call.resolve(o);
        } catch (Throwable t) {
            JSObject o = new JSObject();
            o.put("ok", false);
            o.put("reason", String.valueOf(t.getMessage()));
            o.put("steps", steps);
            call.resolve(o);
        }
    }
}
