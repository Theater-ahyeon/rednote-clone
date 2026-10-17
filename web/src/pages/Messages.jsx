import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/index.js';
import Icon from '../components/Icon.jsx';
import { toast } from '../components/Toast.jsx';
import useUserStore from '../store/user.js';

const BOX_ICON = { likes: '❤️', follows: '👤', comments: '💬' };
const BOX_BG = { likes: '#fff1f3', follows: '#eef4ff', comments: '#f1fbf3' };

export default function Messages() {
  const { box } = useParams();
  const navigate = useNavigate();
  const token = useUserStore((s) => s.token);
  const refreshUnread = useUserStore((s) => s.refreshUnread);
  const [boxes, setBoxes] = useState([]);
  const [list, setList] = useState([]);

  useEffect(() => {
    if (!token) return;
    api.messageBoxes().then((d) => setBoxes(d.boxes)).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token || !box) return;
    api
      .messageList(box)
      .then((d) => setList(d.list))
      .catch(() => {});
    refreshUnread();
  }, [token, box]);

  if (!token) {
    return (
      <div className="empty">
        <span className="empty-emoji">🔔</span>
        登录后查看消息
        <div style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={() => navigate('/login', { state: { from: '/messages' } })}>
            去登录
          </button>
        </div>
      </div>
    );
  }

  if (box) {
    return (
      <div className="page-with-tabbar">
        <div className="navbar">
          <div className="nav-left">
            <Icon name="back" size={22} onClick={() => navigate('/messages')} />
          </div>
          <div className="nav-title" style={{ fontWeight: 600, marginLeft: 8 }}>
            {BOX_ICON[box]} {boxes.find((b) => b.key === box)?.title || '消息'}
          </div>
        </div>
        <div className="msg-list">
          {list.length === 0 ? (
            <div className="empty">
              <span className="empty-emoji">🫧</span>
              暂无消息
            </div>
          ) : (
            list.map((m) => (
              <div className="msg-detail-item" key={m.id}>
                <img className="avatar" src={m.user.avatar} alt="" onClick={() => navigate(`/user/${m.user.id}`)} style={{ cursor: 'pointer' }} />
                <div className="md-main">
                  <div className="md-name">{m.user.nickname}</div>
                  <div className="md-text">{m.content}</div>
                  <div className="md-time">{m.time}</div>
                </div>
                {m.noteCover && <img className="m-cover" src={m.noteCover.url} alt="" onClick={() => navigate(`/note/${m.noteId}`)} />}
                {box === 'follows' && (
                  <button className="btn btn-sm btn-primary md-btn" onClick={() => navigate(`/user/${m.user.id}`)}>
                    去看看
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  const total = boxes.reduce((s, b) => s + b.unread, 0);
  return (
    <div className="page-with-tabbar">
      <div className="navbar center">
        <div className="nav-title">消息</div>
        <div className="nav-right">
          <span style={{ fontSize: 13, color: '#999' }} onClick={() => api.readAll().then(() => { refreshUnread(); api.messageBoxes().then((d) => setBoxes(d.boxes)); toast('已全部已读'); })}>
            全部已读
          </span>
        </div>
      </div>
      <div className="msg-list">
        {boxes.map((b) => (
          <div className="msg-item" key={b.key} onClick={() => navigate(`/messages/${b.key}`)}>
            <div className="msg-icon" style={{ background: BOX_BG[b.key] }}>
              {b.icon}
            </div>
            <div className="m-main">
              <div className="m-title">{b.title}</div>
              <div className="m-sub">
                {b.lastMessage ? `${b.lastMessage.nickname}：${b.lastMessage.content}` : '暂无新消息'}
              </div>
            </div>
            <div className="m-right">
              <div className="m-time">{b.lastMessage?.time || ''}</div>
              {b.unread > 0 && <div className="m-badge">{b.unread}</div>}
            </div>
          </div>
        ))}
        {boxes.length === 0 && (
          <div className="empty">
            <span className="empty-emoji">🫧</span>
            暂无消息
          </div>
        )}
      </div>
      {total > 0 && (
        <div className="loading-more">共 {total} 条未读消息</div>
      )}
    </div>
  );
}
