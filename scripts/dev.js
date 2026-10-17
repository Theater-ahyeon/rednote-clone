/**
 * scripts/dev.js —— 同时拉起后端（:3001）与前端开发服务器（:5173）
 * 用法：npm run dev
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const isWin = process.platform === 'win32';

function run(cwd, cmd, args, label) {
  const p = spawn(cmd, args, { cwd, stdio: 'inherit', shell: isWin });
  p.on('exit', (code) => console.log(`[${label}] 退出，code=${code}`));
  return p;
}

console.log('启动后端 :3001 与 前端 :5173 ...');
run(path.join(root, 'server'), 'npm', ['run', 'dev'], 'server');
setTimeout(() => run(path.join(root, 'web'), 'npm', ['run', 'dev'], 'web'), 1200);
