import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { SideBar, TabBar, DeskTopBar } from './components/Layout.jsx';
import { ToastHost } from './components/Toast.jsx';
import useUserStore from './store/user.js';

import Home from './pages/Home.jsx';
import NoteDetail from './pages/NoteDetail.jsx';
import Search from './pages/Search.jsx';
import Publish from './pages/Publish.jsx';
import Messages from './pages/Messages.jsx';
import Profile from './pages/Profile.jsx';
import UserList from './pages/UserList.jsx';
import Login from './pages/Login.jsx';
import Shop from './pages/Shop.jsx';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  const refreshMe = useUserStore((s) => s.refreshMe);
  const refreshUnread = useUserStore((s) => s.refreshUnread);
  const token = useUserStore((s) => s.token);

  useEffect(() => {
    if (token) {
      refreshMe();
      refreshUnread();
    }
  }, [token]);

  return (
    <div className="app">
      <SideBar />
      <div className="app-main">
        <DeskTopBar />
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/note/:id" element={<NoteDetail />} />
          <Route path="/search" element={<Search />} />
          <Route path="/publish" element={<Publish />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/messages/:box" element={<Messages />} />
          <Route path="/me" element={<Profile />} />
          <Route path="/user/:id" element={<Profile />} />
          <Route path="/user/:id/:type" element={<UserList />} />
          <Route path="/login" element={<Login />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <TabBar />
      </div>
      <ToastHost />
    </div>
  );
}
