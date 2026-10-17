/**
 * scripts/android-icon.js —— 零依赖生成安卓启动图标（品牌红底 #ff2442 + 白色心形）
 * 直接覆写 web/android/app/src/main/res/mipmap-* 下的 ic_launcher(.png/_round.png)
 * 用法：node scripts/android-icon.js
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const RES = path.join(__dirname, '..', 'web', 'android', 'app', 'src', 'main', 'res');
const RED = [255, 36, 66];

// ---------- 极简 PNG 编码器 ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** rgba Uint8Array(w*h*4) → PNG Buffer */
function encodePNG(rgba, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---------- 绘制 ----------
function drawIcon(size, round) {
  const px = Buffer.alloc(size * size * 4);
  const r = size / 2;
  const set = (x, y, c) => {
    const i = (y * size + x) * 4;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
    px[i + 3] = c[3];
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 圆角矩形 / 圆形底
      const dx = Math.abs(x + 0.5 - r);
      const dy = Math.abs(y + 0.5 - r);
      const radius = round ? r : size * 0.22;
      const qx = Math.max(dx - (r - radius), 0);
      const qy = Math.max(dy - (r - radius), 0);
      const outside = Math.hypot(qx, qy) > radius;
      if (outside) {
        set(x, y, [0, 0, 0, 0]);
        continue;
      }
      let color = [...RED, 255];
      // 白色心形（隐式方程），中心偏上
      const nx = (x + 0.5 - r) / (size * 0.3);
      const ny = -(y + 0.5 - r * 0.94) / (size * 0.3);
      const v = Math.pow(nx * nx + ny * ny - 0.36, 3) - nx * nx * ny * ny * ny;
      if (v < 0) color = [255, 255, 255, 255];
      set(x, y, color);
    }
  }
  return encodePNG(px, size, size);
}

const SIZES = { 'mipmap-mdpi': 48, 'mipmap-hdpi': 72, 'mipmap-xhdpi': 96, 'mipmap-xxhdpi': 144, 'mipmap-xxxhdpi': 192 };

let n = 0;
for (const [dir, size] of Object.entries(SIZES)) {
  const out = path.join(RES, dir);
  if (!fs.existsSync(out)) continue;
  fs.writeFileSync(path.join(out, 'ic_launcher.png'), drawIcon(size, false));
  fs.writeFileSync(path.join(out, 'ic_launcher_round.png'), drawIcon(size, true));
  fs.writeFileSync(path.join(out, 'ic_launcher_foreground.png'), drawIcon(size, false));
  n += 3;
  console.log(`✓ ${dir} ${size}x${size}`);
}
console.log(`\n已生成 ${n} 个图标，重新 Build 即可看到新图标。`);

module.exports = { drawIcon, encodePNG };
