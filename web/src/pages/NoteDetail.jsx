import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../api/index.js';
import Icon from '../components/Icon.jsx';
import SmartImage from '../components/SmartImage.jsx';
import { toast } from '../components/Toast.jsx';
import useUserStore from '../store/user.js';
import { fmtCount } from '../components/NoteCard.jsx';

export default function NoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const token = useUserStore((s) => s.token);
  const me = useUserStore((s) => s.user);

  const [note, setNote] = useState(null);
  const [related, setRelated] = useState([]);
  const [idx, setIdx] = useState(0);
  const [comments, setComments] = useState([]);
  const [inputOpen, setInputOpen] = useState(false);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const touchX = useRef(0);

  useEffect(() => {
    setIdx(0);
    api
      .noteDetail(id)
      .then((d) => {
        setNote(d.note);
        setRelated(d.relatedNotes || []);
      })
      .catch((e) => {
        toast(e.message || '笔记不存在');
        navigate('/');
      });
    api.comments(id).then((d) => setComments(d.comments)).catch(() => {});
  }, [id]);

  const requireLogin = useCallback(() => {
    if (!token) {
      toast('请先登录');
      navigate('/login', { state: { from: `/note/${id}` } });
      return false;
    }
    return true;
  }, [token, navigate, id]);

  const toggleLike = async () => {
    if (!requireLogin() || !note) return;
    try {
      const r = await api.like(note.id);
      setNote((n) => ({ ...n, interactInfo: { ...n.interactInfo, liked: r.liked, likedCount: r.likedCount } }));
    } catch (e) {
      toast(e.message);
    }
  };

  const toggleCollect = async () => {
    if (!requireLogin() || !note) return;
    try {
      const r = await api.collect(note.id);
      setNote((n) => ({ ...n, interactInfo: { ...n.interactInfo, collected: r.collected, collectedCount: r.collectedCount } }));
      toast(r.collected ? '已收藏' : '已取消收藏');
    } catch (e) {
      toast(e.message);
    }
  };

  const toggleFollow = async () => {
    if (!requireLogin() || !note) return;
    const u = note.user;
    try {
      const r = await api.follow(u.id);
      setNote((n) => ({
        ...n,
        user: { ...n.user, isFollowing: r.isFollowing, followerCount: r.followerCount }
      }));
      toast(r.isFollowing ? `已关注 ${u.nickname}` : '已取消关注');
    } catch (e) {
      toast(e.message);
    }
  };

  const sendComment = async () => {
    if (!requireLogin()) return;
    const content = text.trim();
    if (!content) return toast('说点什么吧');
    try {
      const c = await api.postComment(id, content, replyTo?.id);
      if (replyTo) {
        setComments((list) =>
          list.map((x) => (x.id === replyTo.parentId || x.id === replyTo.id ? { ...x, subComments: [...(x.subComments || []), { ...c, subComments: [] }] } : x))
        );
      } else {
        setComments((list) => [c, ...list]);
      }
      setNote((n) => ({ ...n, interactInfo: { ...n.interactInfo, commentCount: n.interactInfo.commentCount + 1 } }));
      setText('');
      setInputOpen(false);
      setReplyTo(null);
      toast('评论成功');
    } catch (e) {
      toast(e.message);
    }
  };

  const likeComment = async (cid) => {
    if (!requireLogin()) return;
    try {
      const r = await api.likeComment(id, cid);
      setComments((list) => mapComment(list, cid, (c) => ({ ...c, liked: r.liked, likeCount: r.likeCount })));
    } catch (e) {
      toast(e.message);
    }
  };

  if (!note) {
    return (
      <div style={{ minHeight: '100vh', background: '#fff' }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 120, margin: '12px 16px' }} />
        ))}
      </div>
    );
  }

  const images = note.images || [];
  const info = note.interactInfo || {};
  const isSelf = me && note.user?.id === me.id;

  const media = (
    <div className="detail-media">
      <div
        className="slide"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (dx > 40) setIdx((i) => Math.max(0, i - 1));
          if (dx < -40) setIdx((i) => Math.min(images.length - 1, i + 1));
        }}
      >
        {images.length ? (
          <img src={images[idx]?.url} alt="" onError={(e) => { if (images[idx]?.fallback) e.target.src = images[idx].fallback; }} />
        ) : (
          <div style={{ minHeight: 340, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 90, background: 'linear-gradient(135deg,#ffe3e8,#f6f7fb)' }}>
            📝
          </div>
        )}
      </div>
      {images.length > 1 && (
        <div className="detail-dots">
          {images.map((_, i) => (
            <i key={i} className={i === idx ? 'on' : ''} />
          ))}
        </div>
      )}
      <div className="detail-float">
        <button className="icon-btn" onClick={() => navigate(-1)}>
          <Icon name="back" size={18} color="#fff" />
        </button>
        {!isSelf && (
          <>
            <img
              className="avatar avatar-sm"
              src={note.user?.avatar}
              alt=""
              style={{ marginLeft: 10, border: '1px solid rgba(255,255,255,.6)' }}
              onClick={() => navigate(`/user/${note.user.id}`)}
            />
            <span className="u-name">{note.user?.nickname}</span>
            <button className={'follow-chip' + (note.user?.isFollowing ? ' on' : '')} onClick={toggleFollow}>
              {note.user?.isFollowing ? '已关注' : '关注'}
            </button>
          </>
        )}
      </div>
    </div>
  );

  const body = (
    <>
      <div className="detail-body">
        <h1 className="detail-title">{note.title}</h1>
        {note.desc && <div className="detail-desc">{note.desc}</div>}
        {(note.topics || []).length > 0 && (
          <div className="detail-topics">
            {note.topics.map((t) => (
              <Link key={t} to={`/search?keyword=${encodeURIComponent(t)}`} className="topic-link">
                #{t}
              </Link>
            ))}
          </div>
        )}
        <div className="detail-meta">
          <span>{new Date(note.createdAt).toLocaleDateString('zh-CN')}</span>
          {note.location && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Icon name="location" size={12} color="#999" />
              {note.location}
            </span>
          )}
        </div>
      </div>

      {/* 作者条 */}
      <div className="author-bar">
        <img className="avatar" src={note.user?.avatar} alt="" onClick={() => navigate(`/user/${note.user?.id}`)} style={{ cursor: 'pointer' }} />
        <div className="a-info" onClick={() => navigate(`/user/${note.user?.id}`)}>
          <div className="a-name">{note.user?.nickname}</div>
          <div className="a-sub">
            {fmtCount(note.user?.followerCount || 0)} 粉丝 · {fmtCount(note.user?.likeCollectCount || 0)} 获赞与收藏
          </div>
        </div>
        {!isSelf && (
          <button className={'follow-chip' + (note.user?.isFollowing ? ' on' : '')} onClick={toggleFollow}>
            {note.user?.isFollowing ? '已关注' : '关注'}
          </button>
        )}
      </div>

      {/* 评论 */}
      <div className="comment-section">
        <div className="comment-head">共 {info.commentCount ?? comments.length} 条评论</div>
        {comments.length === 0 && <div style={{ padding: '20px 0', color: '#999', fontSize: 13 }}>还没有评论，来抢占前排～</div>}
        {comments.map((c) => (
          <CommentItem key={c.id} c={c} onLike={likeComment} onReply={(cc) => { setReplyTo(cc); setInputOpen(true); }} />
        ))}
      </div>

      {related.length > 0 && (
        <>
          <div className="section-title">相关推荐</div>
          <div className="waterfall">
            {[0, 1].map((col) => (
              <div className="waterfall-col" key={col}>
                {related.filter((_, i) => i % 2 === col).map((n) => (
                  <a key={n.id} href={`#/note/${n.id}`} onClick={() => navigate(`/note/${n.id}`)}>
                    <SmartImage
                      className="note-cover"
                      src={n.cover?.url}
                      fallback={n.cover?.fallback}
                      ratio={n.cover?.w && n.cover?.h ? `${n.cover.w} / ${n.cover.h}` : '3 / 4'}
                    />
                    <div className="note-title" style={{ padding: '6px 4px 10px' }}>{n.title}</div>
                  </a>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );

  return (
    <>
      <div className="detail">
        <div className="detail-layout">
          <div className="detail-left">{media}</div>
          <div className="detail-right">
            {body}
            <div className="detail-bar">
              <div className="fake-input" onClick={() => (requireLogin() ? setInputOpen(true) : null)}>
                说点什么...
              </div>
              <button className={'act' + (info.liked ? ' on' : '')} onClick={toggleLike}>
                <Icon name={info.liked ? 'heartFill' : 'heart'} size={22} color={info.liked ? '#ff2442' : '#333'} />
                {fmtCount(info.likedCount)}
              </button>
              <button className={'act' + (info.collected ? ' on' : '')} onClick={toggleCollect}>
                <Icon name={info.collected ? 'starFill' : 'star'} size={22} color={info.collected ? '#ffb400' : '#333'} />
                {fmtCount(info.collectedCount)}
              </button>
              <button className="act" onClick={() => (requireLogin() ? setInputOpen(true) : null)}>
                <Icon name="comment" size={22} />
                {fmtCount(info.commentCount)}
              </button>
            </div>
          </div>
        </div>
      </div>

      {inputOpen && (
        <>
          <div className="sheet-mask" onClick={() => { setInputOpen(false); setReplyTo(null); }} />
          <div className="comment-input-bar">
            <input
              autoFocus
              value={text}
              placeholder={replyTo ? `回复 @${replyTo.user?.nickname}：` : '说点什么...'}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendComment()}
            />
            <button className="send" onClick={sendComment}>
              发送
            </button>
          </div>
        </>
      )}
    </>
  );
}

function CommentItem({ c, onLike, onReply }) {
  return (
    <div className="comment-item">
      <img className="avatar avatar-sm" src={c.user?.avatar} alt="" />
      <div className="c-main">
        <div className="c-name">{c.user?.nickname}</div>
        <div className="c-text">{c.content}</div>
        <div className="c-meta">
          <span>{c.createTime}</span>
          {c.ipLocation && <span>{c.ipLocation}</span>}
          <span onClick={() => onReply(c)}>回复</span>
          <span className={'c-like' + (c.liked ? ' on' : '')} onClick={() => onLike(c.id)}>
            <Icon name={c.liked ? 'heartFill' : 'heart'} size={14} color={c.liked ? '#ff2442' : '#999'} />
            {c.likeCount > 0 ? c.likeCount : '赞'}
          </span>
        </div>
        {(c.subComments || []).length > 0 && (
          <div className="comment-sub">
            {c.subComments.slice(0, 3).map((s) => (
              <div className="comment-item" key={s.id} style={{ padding: '6px 0' }}>
                <img className="avatar" src={s.user?.avatar} alt="" style={{ width: 24, height: 24 }} />
                <div className="c-main">
                  <div className="c-name">{s.user?.nickname}</div>
                  <div className="c-text" style={{ fontSize: 14 }}>{s.content}</div>
                  <div className="c-meta">
                    <span>{s.createTime}</span>
                    <span onClick={() => onReply({ ...s, parentId: c.id })}>回复</span>
                    <span className={'c-like' + (s.liked ? ' on' : '')} onClick={() => onLike(s.id)}>
                      <Icon name={s.liked ? 'heartFill' : 'heart'} size={14} color={s.liked ? '#ff2442' : '#999'} />
                      {s.likeCount > 0 ? s.likeCount : '赞'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function mapComment(list, cid, fn) {
  return list.map((c) => {
    if (c.id === cid) return fn(c);
    if (c.subComments?.length) return { ...c, subComments: mapComment(c.subComments, cid, fn) };
    return c;
  });
}
