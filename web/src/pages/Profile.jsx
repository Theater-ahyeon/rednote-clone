import { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import api from '../api/index.js';
import Icon from '../components/Icon.jsx';
import { Waterfall } from '../components/NoteCard.jsx';
import { useColumns, useReachBottom } from '../components/hooks.js';
import useUserStore from '../store/user.js';
import { toast } from '../components/Toast.jsx';

const TABS = [
  { key: 'notes', label: '笔记' },
  { key: 'collects', label: '收藏' },
  { key: 'likes', label: '赞过' }
];

export default function Profile() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const cols = useColumns();
  const me = useUserStore((s) => s.user);
  const token = useUserStore((s) => s.token);
  const patchUser = useUserStore((s) => s.patchUser);

  const selfMode = location.pathname === '/me';
  const uid = selfMode ? me?.id : Number(id);

  const [user, setUser] = useState(null);
  const [notes, setNotes] = useState([]);
  const [tab, setTab] = useState('notes');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ nickname: '', bio: '', gender: 'unknown', ipLocation: '广东' });

  useEffect(() => {
    if (!uid) return;
    api
      .user(uid)
      .then((u) => {
        setUser(u);
        setForm({ nickname: u.nickname, bio: u.bio, gender: u.gender, ipLocation: u.ipLocation });
      })
      .catch((e) => toast(e.message || '用户不存在'));
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    api.userNotes(uid, { tab }).then((d) => setNotes(d.notes)).catch(() => setNotes([]));
  }, [uid, tab]);

  const follow = async () => {
    if (!token) return navigate('/login', { state: { from: `/user/${uid}` } });
    const r = await api.follow(uid);
    setUser((u) => ({ ...u, isFollowing: r.isFollowing, followerCount: r.followerCount }));
    toast(r.isFollowing ? '关注成功' : '已取消关注');
  };

  const save = async () => {
    try {
      const u = await api.updateMe(form);
      setUser((prev) => ({ ...prev, ...u }));
      patchUser(u);
      setEditing(false);
      toast('资料已更新');
    } catch (e) {
      toast(e.message);
    }
  };

  if (!user) return <div className="empty">加载中…</div>;
  const isSelf = user.isSelf || (me && me.id === user.id);

  return (
    <div className="page-with-tabbar">
      <div className="navbar">
        <div className="nav-left">
          <Icon name="back" size={22} onClick={() => navigate(-1)} />
        </div>
        <div className="nav-title" style={{ fontWeight: 600, marginLeft: 8 }}>
          {user.nickname}
        </div>
        <div className="nav-right">
          <Icon name="more" size={22} onClick={() => toast(isSelf ? '设置：演示版未展开' : '举报/拉黑：演示版未展开')} />
        </div>
      </div>

      <div className="profile-head">
        <div className="profile-top">
          <img className="avatar avatar-lg" src={user.avatar} alt="" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{user.nickname}</div>
            <div className="profile-id">小红书号：{100000 + user.id}</div>
            <div className="profile-id">IP 属地：{user.ipLocation}</div>
          </div>
        </div>

        {user.bio && <div className="profile-bio">{user.bio}</div>}

        <div className="profile-stats" onClick={() => navigate(`/user/${user.id}/following`)}>
          <div className="s-item">
            <span className="s-num">{user.followingCount}</span>关注
          </div>
          <div className="s-item" onClick={(e) => { e.stopPropagation(); navigate(`/user/${user.id}/followers`); }}>
            <span className="s-num">{user.followerCount}</span>粉丝
          </div>
          <div className="s-item">
            <span className="s-num">{user.likeCollectCount}</span>获赞与收藏
          </div>
        </div>

        <div className="profile-actions">
          {isSelf ? (
            <>
              <button className="btn btn-ghost" onClick={() => setEditing(true)}>
                编辑资料
              </button>
              <button className="btn btn-ghost" onClick={() => toast('设置：演示版未展开')}>
                设置
              </button>
            </>
          ) : (
            <>
              <button className={'btn ' + (user.isFollowing ? 'btn-ghost' : 'btn-primary')} onClick={follow}>
                {user.isFollowing ? '已关注' : '关注'}
              </button>
              <button className="btn btn-ghost" onClick={() => toast('私信功能：演示版未接入')}>
                发私信
              </button>
            </>
          )}
        </div>

        <div className="profile-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={'pt' + (tab === t.key ? ' on' : '')} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {notes.length === 0 ? (
        <div className="empty">
          <span className="empty-emoji">📭</span>
          {tab === 'notes' ? '还没有发布过笔记' : tab === 'collects' ? '还没有收藏' : '还没有点赞'}
        </div>
      ) : (
        <Waterfall
          notes={notes}
          cols={cols}
          onCardClick={(n) => navigate(`/note/${n.id}`)}
          onUserClick={(u) => u?.id && navigate(`/user/${u.id}`)}
        />
      )}

      {editing && (
        <div className="modal-mask" onClick={() => setEditing(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">编辑资料</div>
            <div className="modal-body">
              <div className="field">
                <span style={{ width: 52, color: '#999' }}>昵称</span>
                <input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
              </div>
              <div className="field">
                <span style={{ width: 52, color: '#999' }}>简介</span>
                <input value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
              </div>
              <div className="field">
                <span style={{ width: 52, color: '#999' }}>属地</span>
                <input value={form.ipLocation} onChange={(e) => setForm({ ...form, ipLocation: e.target.value })} />
              </div>
              <div className="field" style={{ borderBottom: 'none' }}>
                <span style={{ width: 52, color: '#999' }}>性别</span>
                {['female', 'male', 'unknown'].map((g) => (
                  <button
                    key={g}
                    className={'tag' + (form.gender === g ? ' tag-red' : '')}
                    onClick={() => setForm({ ...form, gender: g })}
                  >
                    {g === 'female' ? '女' : g === 'male' ? '男' : '保密'}
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-foot">
              <button onClick={() => setEditing(false)}>取消</button>
              <button className="confirm" onClick={save}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
