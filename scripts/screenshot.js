/**
 * scripts/screenshot.js —— 用真实浏览器渲染各页面并截图，输出到 docs/screenshots/
 * 用法：先启动后端（npm run start），再执行 npm run docs:shot
 * 说明：使用系统已安装的 Chrome / Edge，若均不存在则回退 Playwright 自带 chromium。
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
const BASE = process.env.SHOT_BASE || 'http://localhost:3001';

function findBrowser() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  const pw = path.join(os.homedir(), 'AppData/Local/ms-playwright');
  if (fs.existsSync(pw)) {
    for (const dir of fs.readdirSync(pw)) {
      if (!dir.startsWith('chromium-')) continue;
      const exe = path.join(pw, dir, 'chrome-win', 'chrome.exe');
      if (fs.existsSync(exe)) return exe;
    }
  }
  return null;
}

(async () => {
  let chromium;
  const candidates = [
    () => require('playwright').chromium,
    () => require('playwright-core').chromium,
    () =>
      require(path.join(os.homedir(), '.workbuddy/binaries/node/workspace/node_modules/playwright-core')).chromium
  ];
  for (const load of candidates) {
    try {
      chromium = load();
      break;
    } catch {}
  }
  if (!chromium) {
    console.error('未找到 playwright/playwright-core，请先执行：npm i -D playwright-core');
    process.exit(1);
  }

  const executablePath = findBrowser();
  if (!executablePath) {
    console.error('未找到可用浏览器，请安装 Chrome/Edge');
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath, headless: true });
  const token = await fetch(`${BASE}/api/auth/demo`).then((r) => r.json()).then((j) => j.data.token);
  // 动态取一条真实笔记 ID（重置种子后 ID 可能变化）
  const sampleId = await fetch(`${BASE}/api/notes/feed?limit=1`)
    .then((r) => r.json())
    .then((j) => j.data.notes[0].id);

  const shots = [
    { name: '01-home-mobile', url: '/', w: 390, h: 844 },
    { name: '02-detail-mobile', url: `/note/${sampleId}`, w: 390, h: 844 },
    { name: '03-search-mobile', url: '/search', w: 390, h: 844 },
    { name: '04-result-mobile', url: '/search?keyword=穿搭', w: 390, h: 844 },
    { name: '05-publish-mobile', url: '/publish', w: 390, h: 844 },
    { name: '06-messages-mobile', url: '/messages', w: 390, h: 844 },
    { name: '07-profile-mobile', url: '/me', w: 390, h: 844 },
    { name: '08-login-mobile', url: '/login', w: 390, h: 844, guest: true },
    { name: '09-home-desktop', url: '/', w: 1440, h: 900 },
    { name: '10-detail-desktop', url: `/note/${sampleId}`, w: 1440, h: 900 },
    { name: '11-search-desktop', url: '/search?keyword=穿搭', w: 1440, h: 900 },
    { name: '12-messages-desktop', url: '/messages', w: 1440, h: 900 },
    { name: '13-profile-desktop', url: '/me', w: 1440, h: 900 }
  ];

  for (const s of shots) {
    const ctx = await browser.newContext({
      viewport: { width: s.w, height: s.h },
      deviceScaleFactor: 2,
      isMobile: s.w < 500,
      hasTouch: s.w < 500
    });
    if (!s.guest) {
      await ctx.addInitScript(
        (t) => localStorage.setItem('rednote-auth', JSON.stringify({ state: { token: t, user: null, unread: 0 }, version: 0 })),
        token
      );
    }
    const page = await ctx.newPage();
    await page.goto(BASE + s.url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2200);
    await page.screenshot({ path: path.join(OUT, s.name + '.png') });
    console.log('✓', s.name);
    await ctx.close();
  }

  await browser.close();
  console.log('\n截图已输出到 docs/screenshots/');
})();
