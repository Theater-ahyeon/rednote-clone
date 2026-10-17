import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/index.js';
import Icon from '../components/Icon.jsx';
import { Waterfall } from '../components/NoteCard.jsx';
import { useColumns, useReachBottom } from '../components/hooks.js';
import useUserStore from '../store/user.js';
import { toast } from '../components/Toast.jsx';

const TABS = [
  { key: 'recommend', label: '发现' },
  { key: 'following', label: '关注' },
  { key: 'nearby', label: '附近' }
];

export default function Home() {
  const navigate = useNavigate();
  const cols = useColumns();
  const token = useUserStore((s) => s.token);
  const [tab, setTab] = useState('recommend');
  const [channels, setChannels] = useState(['推荐']);
  const [channel, setChannel] = useState('推荐');
  const [notes, setNotes] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  useEffect(() => {
    api.channels().then((d) => setChannels(d.list?.length ? d.list : ['推荐'])).catch(() => {});
  }, []);

  const load = useCallback(
    async (reset = false) => {
      if (loading) return;
      if ((tab === 'following' || tab === 'nearby') && !token) {
        setNotes([]);
        setHasMore(false);
        return;
      }
      setLoading(true);
      try {
        const d = await api.feed({
          tab,
          cursor: reset ? undefined : cursor || undefined,
          limit: 20
        });
        setNotes((prev) => (reset ? d.notes : dedupe([...prev, ...d.notes])));
        setCursor(d.nextCursor);
        setHasMore(d.hasMore);
      } catch (e) {
        toast(e.message || '加载失败');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tab, cursor, loading, token]
  );

  useEffect(() => {
    setNotes([]);
    setCursor(null);
    setHasMore(true);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, token]);

  useReachBottom(() => {
    if (hasMore && !loading) load();
  }, [hasMore, loading, notes.length]);

  const visible = channel === '推荐' ? notes : notes.filter((n) => (n.topics || []).includes(channel));

  const onTab = (key) => {
    if ((key === 'following' || key === 'nearby') && !token) {
      toast('请先登录');
      navigate('/login', { state: { from: '/' } });
      return;
    }
    setTab(key);
  };

  const startY = useRef(0);
  const onTouchStart = (e) => (startY.current = e.touches[0].clientY);
  const onTouchMove = (e) => {
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 60 && window.scrollY === 0 && !refreshing) {
      e.preventDefault(); // 阻止浏览器自带的下拉回弹，避免双重滚动
      setRefreshing(true);
      setCursor(null);
      load(true);
    }
  };

  return (
    <div className="page-with-tabbar" onTouchStart={onTouchStart} onTouchMove={onTouchMove}>
      {/* 顶部：发现 / 关注 / 附近 */}
      <div className="navbar center">
        <div className="nav-left">
          <Icon name="menu" size={22} onClick={() => toast('侧边菜单：演示版未展开')} />
        </div>
        <div className="home-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={'home-tab' + (tab === t.key ? ' active' : '')} onClick={() => onTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="nav-right">
          <Icon name="search" size={22} onClick={() => navigate('/search')} />
        </div>
      </div>

      {/* 频道条 */}
      <div className="channel-bar">
        <div className="channel-scroll">
          {channels.map((c) => (
            <button key={c} className={'channel-item' + (channel === c ? ' active' : '')} onClick={() => setChannel(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {(tab === 'following' || tab === 'nearby') && !token ? (
        <NeedLogin onLogin={() => navigate('/login')} />
      ) : visible.length === 0 && !loading ? (
        <div className="empty">
          <span className="empty-emoji">🫧</span>
          暂无内容，换个频道看看
        </div>
      ) : (
        <>
          <Waterfall
            notes={visible}
            cols={cols}
            onCardClick={(n) => navigate(`/note/${n.id}`)}
            onUserClick={(u) => u?.id && navigate(`/user/${u.id}`)}
          />
          <div className="loading-more">{loading ? '正在加载…' : hasMore ? '' : '— 没有更多了 —'}</div>
        </>
      )}

      {refreshing && <div className="loading-more">刷新中…</div>}
    </div>
  );
}

function NeedLogin({ onLogin }) {
  return (
    <div className="empty">
      <span className="empty-emoji">🔑</span>
      登录后查看该频道内容
      <div style={{ marginTop: 16 }}>
        <button className="btn btn-primary" onClick={onLogin}>
          立即登录
        </button>
      </div>
    </div>
  );
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((n) => (seen.has(n.id) ? false : seen.add(n.id)));
}
