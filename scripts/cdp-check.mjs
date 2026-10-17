const port = process.argv[2] || 9556;
const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = list.find((t) => t.type === 'page');
if (!page) {
  console.log('NO PAGE TARGET');
  process.exit(0);
}
console.log('page url:', page.url);
const sock = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const myId = ++id;
    const onMsg = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id === myId) {
        sock.removeEventListener('message', onMsg);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      }
    };
    sock.addEventListener('message', onMsg);
    sock.send(JSON.stringify({ id: myId, method, params }));
  });
sock.addEventListener('open', async () => {
  try {
    const expr = 'document.readyState + " | " + document.title + " | root:" + (document.getElementById("root") ? document.getElementById("root").children.length : -1)';
    const st = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    console.log('STATE:', st.result.value);
    if (process.argv[3] === 'shot') {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const fs = await import('node:fs');
      const out = process.argv[4];
      fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
      console.log('screenshot saved:', out, fs.statSync(out).size, 'bytes');
    }
  } catch (e) {
    console.log('ERR:', e.message);
  }
  process.exit(0);
});
setTimeout(() => {
  console.log('TIMEOUT: renderer unresponsive');
  process.exit(1);
}, 12000);
