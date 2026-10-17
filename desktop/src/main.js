/**
 * RedNote Clone —— Windows 桌面端主进程
 * - 开发：REDNOTE_DEV_URL 指向 Vite 开发服务器（:5173）
 * - 生产：加载 electron-builder extraResources 打进去的 web/（即前端构建产物）
 * - 数据：复用本机 localhost:3001 的后端服务（先启动 npm run start -w server）
 */
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

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
    // 打包后：extraResources 里的 web/；开发时：仓库内的 web/dist
    const indexHtml = app.isPackaged
      ? path.join(process.resourcesPath, 'web', 'index.html')
      : path.join(__dirname, '..', '..', 'web', 'dist', 'index.html');
    win.loadFile(indexHtml);
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
  // 生产模式下探测一次后端，不通则直接展示引导页
  if (!DEV_URL) {
    fetch(`${API_URL}/api/health`)
      .then((r) => (r.ok ? createWindow() : showBackendMissing()))
      .catch(() => showBackendMissing());
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
