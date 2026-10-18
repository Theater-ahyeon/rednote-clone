import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/index.js';
import Icon from '../components/Icon.jsx';
import useUserStore from '../store/user.js';
import { toast } from '../components/Toast.jsx';

/** /user/:id/followers 与 /user/:id/following 共用 */
export default function UserList() {
  const { id, type } = useParams();
  const navigate = useNavigate();
  const token = useUserStore((s) => s.token);
  const [users, setUsers] = useState([]);
  const [followSet, setFollowSet] = useState({});

  useEffect(() => {
    const fn = type === 'followers' ? api.followers : api.following;
    fn(id)
      .then((d) => {
        setUsers(d.users);
        setFollowSet(Object.fromEntries(d.users.map((u) => [u.id, u.isFollowing])));
      })
      .catch(() => {});
  }, [id, type]);

  const toggle = async (uid) => {
    if (!token) return navigate('/login', { state: { from: `/user/${id}/${type}` } });
    const r = await api.follow(uid);
    setFollowSet((s) => ({ ...s, [uid]: r.isFollowing }));
    toast(r.isFollowing ? '关注成功' : '已取消关注');
  };

  return (
    <div className="page-with-tabbar">
      <div className="navbar">
        <div className="nav-left">
          <Icon name="back" size={22} onClick={() => navigate(-1)} />
        </div>
        <div className="nav-title" style={{ fontWeight: 600, marginLeft: 8 }}>
          {type === 'followers' ? '粉丝' : '关注'}
        </div>
      </div>
      {users.length === 0 ? (
        <div className="empty">
          <span className="empty-emoji">🫧</span>
          暂无{type === 'followers' ? '粉丝' : '关注'}
        </div>
      ) : (
        users.map((u) => (
          <div className="user-row" key={u.id}>
            <img className="avatar" src={u.avatar} alt="" onClick={() => navigate(`/user/${u.id}`)} style={{ cursor: 'pointer' }} />
            <div className="ur-main" onClick={() => navigate(`/user/${u.id}`)}>
              <div className="ur-name">{u.nickname}</div>
              <div className="ur-bio">{u.bio || `红薯号：${100000 + u.id}`}</div>
            </div>
            {!u.isSelf && (
              <button className={'btn btn-sm ' + (followSet[u.id] ? 'btn-ghost' : 'btn-primary')} onClick={() => toggle(u.id)}>
                {followSet[u.id] ? '已关注' : '关注'}
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}
