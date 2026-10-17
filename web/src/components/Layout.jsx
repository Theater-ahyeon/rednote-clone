import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import Icon from './Icon.jsx';
import useUserStore from '../store/user.js';
import { useIsDesktop } from './hooks.js';

const TABS = [
  { to: '/', label: '首页', icon: 'home', exact: true },
  { to: '/shop', label: '购物', icon: 'compass' },
  { to: '/messages', label: '消息', icon: 'bell' },
  { to: '/me', label: '我', icon: 'user' }
];

/** 全屏页面不显示底部导航（与官方一致）：发布 / 登录 / 笔记详情 */
function hideTabbar(pathname) {
  return pathname === '/publish' || pathname === '/login' || pathname.startsWith('/note/');
}

export function TabBar() {
  const unread = useUserStore((s) => s.unread);
  const { pathname } = useLocation();
  if (hideTabbar(pathname)) return null;
  return (
    <nav className="tabbar">
      <TabItem {...TABS[0]} />
      <TabItem {...TABS[1]} />
      <div className="tabbar-plus">
        <NavLink to="/publish" className="plus-btn" aria-label="发布">
          <Icon name="plus" size={18} color="#fff" stroke={2.6} />
        </NavLink>
      </div>
      <TabItem {...TABS[2]} badge={unread} />
      <TabItem {...TABS[3]} />
    </nav>
  );
}

function TabItem({ to, label, icon, exact, badge }) {
  return (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) => 'tabbar-item' + (isActive ? ' active' : '')}
    >
      <Icon name={icon} size={22} stroke={1.6} />
      <span>{label}</span>
      {badge > 0 && <span className="dot">{badge > 99 ? '99+' : badge}</span>}
    </NavLink>
  );
}

const DESK_NAV = [
  { to: '/', label: '发现', icon: 'home', exact: true },
  { to: '/search', label: '搜索', icon: 'search' },
  { to: '/publish', label: '发布', icon: 'edit' },
  { to: '/messages', label: '通知', icon: 'bell', badgeKey: 'unread' },
  { to: '/me', label: '我', icon: 'user' }
];

export function SideBar() {
  const user = useUserStore((s) => s.user);
  const unread = useUserStore((s) => s.unread);
  const navigate = useNavigate();
  return (
    <aside className="desk-sidebar">
      <div className="desk-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
        <span className="logo-badge">书</span>
        <span>小红书</span>
      </div>
      <div className="desk-nav">
        {DESK_NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.exact}
            className={({ isActive }) => 'desk-nav-item' + (isActive ? ' active' : '')}
          >
            <Icon name={n.icon} size={20} stroke={1.6} />
            <span>{n.label}</span>
            {n.badgeKey && unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
          </NavLink>
        ))}
      </div>
      <div className="desk-user">
        <img className="avatar avatar-sm" src={user?.avatar} alt="" onClick={() => navigate('/me')} style={{ cursor: 'pointer' }} />
        <div style={{ minWidth: 0 }}>
          <div className="u-name">{user ? user.nickname : '未登录'}</div>
          <div className="u-id">{user ? `小红书号：${100000 + user.id}` : '点击登录体验完整功能'}</div>
        </div>
      </div>
    </aside>
  );
}

/** 桌面端右上角搜索入口（移动端在首页顶部，桌面端在搜索页隐藏） */
export function DeskTopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  if (!isDesktop || location.pathname === '/search') return null;
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        background: '#fff',
        borderBottom: '1px solid var(--line)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px'
      }}
    >
      <div style={{ marginLeft: 'auto' }}>
        <div className="search-input" style={{ width: 260, cursor: 'pointer' }} onClick={() => navigate('/search')}>
          <Icon name="search" size={16} color="#999" />
          <span className="ph">搜索小红书</span>
        </div>
      </div>
    </div>
  );
}
