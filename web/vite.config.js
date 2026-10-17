import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const TARGET = process.env.API_TARGET || 'http://localhost:3001';

export default defineConfig({
  // 网页版用绝对根路径（history 路由子路径下资源不会解析错）
  // Android / Windows 客户端构建时用 --base=./（见 package.json 的 build:native / sync）
  base: '/',
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: TARGET, changeOrigin: true },
      '/uploads': { target: TARGET, changeOrigin: true }
    }
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: TARGET, changeOrigin: true },
      '/uploads': { target: TARGET, changeOrigin: true }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 1200
  }
});
