import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/global.css';

// Android（Capacitor）/ Windows（Electron）以 file:// 加载产物时 history 路由不可用，
// 因此这里按协议自动切换 HashRouter，保证三端复用同一份构建产物都能正常跳转。
const isFile = window.location.protocol === 'file:';
const Router = isFile ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
);
