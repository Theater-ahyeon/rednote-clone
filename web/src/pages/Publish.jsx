import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/index.js';
import Icon from '../components/Icon.jsx';
import { toast } from '../components/Toast.jsx';
import useUserStore from '../store/user.js';

const MAX = 9;

export default function Publish() {
  const navigate = useNavigate();
  const token = useUserStore((s) => s.token);
  const fileRef = useRef(null);

  const [images, setImages] = useState([]);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [topics, setTopics] = useState([]);
  const [location, setLocation] = useState('');
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [topicOpen, setTopicOpen] = useState(false);
  const [topicText, setTopicText] = useState('');
  const [locOpen, setLocOpen] = useState(false);
  const [locText, setLocText] = useState('');

  if (!token) {
    return (
      <div className="empty">
        <span className="empty-emoji">✍️</span>
        登录后即可发布笔记
        <div style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={() => navigate('/login', { state: { from: '/publish' } })}>
            去登录
          </button>
        </div>
      </div>
    );
  }

  const pick = (e) => {
    const files = Array.from(e.target.files || []).slice(0, MAX - images.length);
    if (!files.length) return;
    setUploading(true);
    api
      .uploadMulti(files)
      .then((list) => {
        setImages((prev) => [...prev, ...list].slice(0, MAX));
        toast(`已添加 ${list.length} 张图片`);
      })
      .catch((err) => toast(err.message || '上传失败'))
      .finally(() => {
        setUploading(false);
        e.target.value = '';
      });
  };

  const remove = (i) => {
    const img = images[i];
    setImages((prev) => prev.filter((_, k) => k !== i));
    // 顺手把服务端文件删掉：只在前端移除会留下一堆没人引用的孤儿图
    if (img?.url?.startsWith('/uploads/')) api.deleteUpload(img.url).catch(() => {});
  };

  const publish = async () => {
    if (!images.length && !desc.trim()) return toast('至少上传一张图片或写点内容');
    setPosting(true);
    try {
      const note = await api.publish({ title: title.trim(), content: desc.trim(), images, topics, location });
      toast('发布成功');
      navigate(`/note/${note.id}`, { replace: true });
    } catch (e) {
      toast(e.message || '发布失败');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="publish">
      <div className="publish-grid">
        {images.map((img, i) => (
          <div className="publish-cell" key={img.url + i}>
            <img src={img.url} alt="" />
            <span className="del" onClick={() => remove(i)}>
              ×
            </span>
          </div>
        ))}
        {images.length < MAX && (
          <div className="publish-add" onClick={() => fileRef.current?.click()}>
            <Icon name="camera" size={26} color="#999" />
            <span>{uploading ? '上传中…' : `${images.length}/${MAX}`}</span>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={pick} />

      <input
        className="publish-title"
        placeholder="填写标题会有更多赞哦～"
        value={title}
        maxLength={30}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="publish-desc"
        placeholder={'添加正文，说说你的真实感受\n#话题 可让更多人看到'}
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
      />

      {topics.length > 0 && (
        <div className="chips" style={{ padding: '8px 0' }}>
          {topics.map((t) => (
            <span className="tag tag-red" key={t} onClick={() => setTopics((p) => p.filter((x) => x !== t))}>
              #{t} ×
            </span>
          ))}
        </div>
      )}

      <div className="publish-divider" />

      <div className="publish-row" onClick={() => setTopicOpen(true)}>
        <Icon name="fire" size={18} color="#999" />
        <span className="r-label">添加话题</span>
        <span className="r-value">{topics.length ? topics.map((t) => `#${t}`).join(' ') : '选填'}</span>
        <Icon name="back" size={16} color="#ccc" style={{ transform: 'rotate(180deg)' }} />
      </div>
      <div className="publish-row" onClick={() => setLocOpen(true)}>
        <Icon name="location" size={18} color="#999" />
        <span className="r-label">添加地点</span>
        <span className="r-value">{location || '选填'}</span>
        <Icon name="back" size={16} color="#ccc" style={{ transform: 'rotate(180deg)' }} />
      </div>
      <div className="publish-row">
        <Icon name="user" size={18} color="#999" />
        <span className="r-label">谁可以看</span>
        <span className="r-value">公开可见</span>
      </div>

      <div className="publish-bottom">
        <button className="btn btn-ghost" onClick={() => navigate(-1)}>
          存草稿
        </button>
        <button className="btn btn-primary" disabled={posting} onClick={publish}>
          {posting ? '发布中…' : '发布笔记'}
        </button>
      </div>

      {topicOpen && (
        <InputSheet
          title="添加话题"
          placeholder="输入话题名，如：露营"
          value={topicText}
          onChange={setTopicText}
          onCancel={() => { setTopicOpen(false); setTopicText(''); }}
          onConfirm={() => {
            const v = topicText.trim().replace(/^#/, '');
            if (v && !topics.includes(v)) setTopics((p) => [...p, v]);
            setTopicOpen(false);
            setTopicText('');
          }}
        />
      )}
      {locOpen && (
        <InputSheet
          title="添加地点"
          placeholder="输入地点，如：深圳·光明农场"
          value={locText}
          onChange={setLocText}
          onCancel={() => { setLocOpen(false); setLocText(''); }}
          onConfirm={() => {
            setLocation(locText.trim());
            setLocOpen(false);
            setLocText('');
          }}
        />
      )}
    </div>
  );
}

function InputSheet({ title, placeholder, value, onChange, onCancel, onConfirm }) {
  return (
    <div className="sheet-mask" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">{title}</div>
        <div className="modal-body">
          <div className="field">
            <input autoFocus placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
          </div>
        </div>
        <div className="modal-foot">
          <button onClick={onCancel}>取消</button>
          <button className="confirm" onClick={onConfirm}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
