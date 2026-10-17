/**
 * 本地占位图生成器（SVG）。
 * 目的：断网环境下 demo 依然有图；同时避免把二进制图片塞进 Git 仓库。
 * 种子固定 → 同一 note 每次生成完全一致，保证截图可复现。
 */
import fs from 'node:fs';
import path from 'node:path';
import { UPLOADS } from '../db.js';

const PALETTES = [
  ['#ff9a9e', '#fad0c4', '#fad0c4'],
  ['#a18cd1', '#fbc2eb', '#fbc2eb'],
  ['#84fab0', '#8fd3f4', '#8fd3f4'],
  ['#ffecd2', '#fcb69f', '#fcb69f'],
  ['#cfd9df', '#e2ebf0', '#e2ebf0'],
  ['#f6d365', '#fda085', '#fda085'],
  ['#96e6a1', '#d4fc79', '#d4fc79'],
  ['#5ee7df', '#b490ca', '#b490ca'],
  ['#c3cfe2', '#f5f7fa', '#f5f7fa'],
  ['#fddb92', '#d1fdff', '#d1fdff'],
  ['#9890e3', '#b1f4cf', '#b1f4cf'],
  ['#ebc0fd', '#d9ded8', '#d9ded8'],
  ['#f093fb', '#f5576c', '#f5576c'],
  ['#4facfe', '#00f2fe', '#00f2fe'],
  ['#43e97b', '#38f9d7', '#38f9d7'],
  ['#fa709a', '#fee140', '#fee140']
];

const MOTIFS = ['🌿', '🍜', '☕️', '🏔', '🌊', '🐈', '🎧', '🧋', '🌇', '🥐', '🚲', '📷', '🛋', '🍰', '🌸', '🎒', '🏕', '👟'];

function rng(seed) {
  let s = 0;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) s = (s * 31 + str.charCodeAt(i)) >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0xffffffff;
  };
}

export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 生成一张封面 SVG，返回可访问 URL（/uploads/seed/xxx.svg） */
export function makeCover(seed, w = 600, h = 800, motifIndex) {
  const file = `cover-${hashSeed(seed)}.svg`;
  const full = path.join(UPLOADS, 'seed', file);
  if (fs.existsSync(full)) return `/uploads/seed/${file}`;

  const rand = rng(seed);
  const palette = PALETTES[hashSeed(seed) % PALETTES.length];
  const motif = MOTIFS[motifIndex ?? hashSeed('m' + seed) % MOTIFS.length];
  const blobs = Array.from({ length: 3 }, () => ({
    cx: Math.round(rand() * w),
    cy: Math.round(rand() * h),
    r: Math.round((0.18 + rand() * 0.3) * Math.min(w, h)),
    o: (0.12 + rand() * 0.22).toFixed(2)
  }));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette[0]}"/>
      <stop offset="100%" stop-color="${palette[1]}"/>
    </linearGradient>
    <filter id="b"><feGaussianBlur stdDeviation="${Math.round(Math.min(w, h) * 0.06)}"/></filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  ${blobs.map((b) => `<circle cx="${b.cx}" cy="${b.cy}" r="${b.r}" fill="#ffffff" opacity="${b.o}" filter="url(#b)"/>`).join('\n  ')}
  <text x="50%" y="${Math.round(h * 0.46)}" font-size="${Math.round(Math.min(w, h) * 0.34)}" text-anchor="middle" dominant-baseline="central">${motif}</text>
</svg>`;
  fs.writeFileSync(full, svg, 'utf8');
  return `/uploads/seed/${file}`;
}

/** 生成头像 SVG（渐变底 + 首字） */
export function makeAvatar(seed, char = '红') {
  const file = `avatar-${hashSeed(seed)}.svg`;
  const full = path.join(UPLOADS, 'seed', file);
  if (fs.existsSync(full)) return `/uploads/seed/${file}`;
  const palette = PALETTES[hashSeed(seed) % PALETTES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
  <defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${palette[0]}"/><stop offset="100%" stop-color="${palette[1]}"/>
  </linearGradient></defs>
  <rect width="120" height="120" rx="60" fill="url(#a)"/>
  <text x="60" y="62" font-size="52" font-family="PingFang SC,Microsoft YaHei,sans-serif" fill="#fff" text-anchor="middle" dominant-baseline="central">${char}</text>
</svg>`;
  fs.writeFileSync(full, svg, 'utf8');
  return `/uploads/seed/${file}`;
}

export default { makeCover, makeAvatar, hashSeed };
