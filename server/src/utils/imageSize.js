/**
 * 轻量图片尺寸解析（不引入 sharp / image-size 依赖）
 * 支持 PNG / JPEG / GIF / WebP / SVG，用于瀑布流在图片加载前就算出卡片高度。
 */
import fs from 'node:fs';

function pngSize(buf) {
  if (buf.length < 24) return null;
  // 签名 89 50 4E 47 0D 0A 1A 0A，紧随 IHDR
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function gifSize(buf) {
  if (buf.slice(0, 3).toString('ascii') !== 'GIF') return null;
  return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
}

function webpSize(buf) {
  const riff = buf.slice(0, 4).toString('ascii');
  const webp = buf.slice(8, 12).toString('ascii');
  if (riff !== 'RIFF' || webp !== 'WEBP') return null;
  const fmt = buf.slice(12, 16).toString('ascii');
  if (fmt === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (fmt === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
  }
  if (fmt === 'VP8X') {
    const w = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    return { w, h };
  }
  return null;
}

function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < buf.length - 9) {
    if (buf[offset] !== 0xff) { offset++; continue; }
    const marker = buf[offset + 1];
    // SOF0 ~ SOF15（除 C4/CC 外）
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(offset + 5), w: buf.readUInt16BE(offset + 7) };
    }
    const len = buf.readUInt16BE(offset + 2);
    if (len <= 0) return null;
    offset += 2 + len;
    if (marker === 0xda /* SOS */) break;
  }
  return null;
}

function svgSize(buf) {
  const head = buf.slice(0, 4096).toString('utf8');
  const vb = head.match(/viewBox\s*=\s*["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/);
  if (vb) return { w: Math.round(+vb[1]), h: Math.round(+vb[2]) };
  const w = head.match(/\swidth\s*=\s*["'](\d+)/);
  const h = head.match(/\sheight\s*=\s*["'](\d+)/);
  if (w && h) return { w: +w[1], h: +h[1] };
  return null;
}

export function imageSize(file) {
  try {
    const buf = fs.readFileSync(file);
    return pngSize(buf) || jpegSize(buf) || gifSize(buf) || webpSize(buf) || svgSize(buf) || null;
  } catch {
    return null;
  }
}

export default imageSize;
