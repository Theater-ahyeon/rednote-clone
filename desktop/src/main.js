/**
 * RedNote Clone —— Windows 桌面端主进程
 * - 开发：REDNOTE_DEV_URL 指向 Vite 开发服务器（:5173）
 * - 生产：加载 electron-builder extraResources 打进去的 web/（即前端构建产物）
 * - 数据：复用本机 localhost:3001 的后端服务（先启动 npm run start -w server）
 */
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

/**
 * 兼容性开关（默认开启，均可用环境变量覆盖）：
 * 1. in-process-gpu / disable-gpu-sandbox：部分机器（虚拟显示适配器、远程桌面、
 *    无交互桌面会话）独立 GPU 进程会直接崩溃（0xC0000005 → FATAL）导致秒退；
 * 2. no-sandbox：上述受限环境下渲染进程沙箱初始化会挂起（页面白屏、CDP 无响应）。
 *    本应用只加载本地 file:// 资源 + 本机 localhost API，关闭渲染沙箱的收益大于风险；
 *    如需恢复沙箱可设 REDNOTE_KEEP_SANDBOX=1。
 */
app.commandLine.appendSwitch('in-process-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');
if (process.env.REDNOTE_KEEP_SANDBOX !== '1') app.commandLine.appendSwitch('no-sandbox');
// 默认保留硬件加速；只有明确要排障时才关（之前 REDNOTE_ENABLE_GPU=1 反而调用了 disable，语义是反的）
if (process.env.REDNOTE_DISABLE_GPU === '1') app.disableHardwareAcceleration();

const DEBUG = process.env.REDNOTE_DEBUG;
const log = (m) => {
  if (DEBUG) fs.appendFileSync(path.join(os.tmpdir(), 'rednote-debug.log'), `${new Date().toISOString()} ${m}\n`);
};
log(`main.js loaded, isPackaged=${app.isPackaged}, hwAccel=${process.env.REDNOTE_DISABLE_GPU === '1' ? 'off' : 'on'}`);

const DEV_URL = process.env.REDNOTE_DEV_URL || '';
const API_URL = process.env.REDNOTE_API_URL || 'http://localhost:3001';

function createWindow() {
  const win = new BrowserWindow({
    width: 430,
    height: 932,
    minWidth: 380,
    minHeight: 640,
    title: '小红书',
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../resources/icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  Menu.setApplicationMenu(null);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (DEV_URL) {
    win.loadURL(DEV_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // 必须加载 dist-native（base:'./'），不能用 web/dist（base:'/'）：
    // file:// 下 /assets/xxx.js 会被解析成 file:///E:/assets/xxx.js → 全 404 → 白屏
    const indexHtml = app.isPackaged
      ? path.join(process.resourcesPath, 'web', 'index.html')
      : path.join(__dirname, '..', '..', 'web', 'dist-native', 'index.html');
    log(`loading ${indexHtml} exists=${fs.existsSync(indexHtml)}`);
    if (fs.existsSync(indexHtml)) {
      win.loadFile(indexHtml);
    } else {
      win.loadURL(
        'data:text/html;charset=utf-8,' +
          encodeURIComponent(
            `<body style="font-family:PingFang SC,Microsoft YaHei;padding:40px;background:#fff">
              <h2 style="color:#ff2442">🟥 缺少客户端构建产物</h2>
              <p style="color:#666">桌面端需要 <code>web/dist-native</code>（相对路径构建），当前不存在：</p>
              <pre style="background:#f5f5f5;padding:12px;border-radius:8px">npm --prefix web run build:native</pre>
              <p style="color:#999">或者在开发时设置 REDNOTE_DEV_URL=http://localhost:5173 直连 Vite。</p>
            </body>`
          )
      );
    }
    log('load call finished');
  }

  // 后端未启动时给出明确提示页
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (!isMain) return;
    win.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          `<body style="font-family:PingFang SC,Microsoft YaHei;padding:40px;background:#fff">
            <h2 style="color:#ff2442">🟥 无法加载小红书</h2>
            <p>错误码 ${code}：${desc}</p>
            <p style="color:#666">请先启动后端服务：</p>
            <pre style="background:#f5f5f5;padding:12px;border-radius:8px">cd server
npm install
npm run seed   # 首次需要写入演示数据
npm start      # 默认 http://localhost:3001</pre>
            <p style="color:#999">启动后重启本应用即可。</p>
          </body>`
        )
    );
  });

  return win;
}

app.whenReady().then(() => {
  log('whenReady fired');
  // 生产模式下探测一次后端，不通则直接展示引导页
  if (!DEV_URL) {
    fetch(`${API_URL}/api/health`)
      .then((r) => {
        log(`health ok=${r.ok}`);
        if (r.ok) createWindow();
        else showBackendMissing();
      })
      .catch((e) => {
        log(`health failed: ${e.message}`);
        showBackendMissing();
      });
  } else {
    createWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function showBackendMissing() {
  const win = new BrowserWindow({
    width: 430,
    height: 932,
    title: '小红书',
    autoHideMenuBar: true,
    backgroundColor: '#ffffff'
  });
  win.loadURL(
    'data:text/html;charset=utf-8,' +
      encodeURIComponent(
        `<body style="font-family:PingFang SC,Microsoft YaHei;padding:40px;background:#fff">
          <h2 style="color:#ff2442">🟥 后端服务未启动</h2>
          <p>桌面客户端需要本机后端提供数据（${API_URL}）。</p>
          <pre style="background:#f5f5f5;padding:12px;border-radius:8px">cd server
npm install
npm run seed   # 首次需要写入演示数据
npm start</pre>
          <p style="color:#999">启动后重启本应用即可。</p>
        </body>`
      )
  );
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
