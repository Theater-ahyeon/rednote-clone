import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/index.js';
import Icon from '../components/Icon.jsx';
import { Waterfall } from '../components/NoteCard.jsx';
import { useColumns, useReachBottom } from '../components/hooks.js';
import useUserStore from '../store/user.js';
import { toast } from '../components/Toast.jsx';

const SORTS = [
  { key: 'general', label: '综合' },
  { key: 'time', label: '最新' },
  { key: 'hot', label: '最热' }
];

export default function Search() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const cols = useColumns();
  const token = useUserStore((s) => s.token);

  const keyword = params.get('keyword') || '';
  const [text, setText] = useState(keyword);
  const [history, setHistory] = useState([]);
  const [hot, setHot] = useState([]);
  const [suggest, setSuggest] = useState([]);
  const [notes, setNotes] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [sort, setSort] = useState('general');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    api.hot().then((d) => setHot(d.list)).catch(() => {});
    if (token) api.searchHistory().then((d) => setHistory(d.list)).catch(() => {});
  }, [token]);

  useEffect(() => {
    setText(keyword);
    if (keyword) doSearch(keyword, 1, sort, true);
    else {
      setNotes([]);
      setHasMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword]);

  useEffect(() => {
    if (!text || text === keyword) return setSuggest([]);
    const t = setTimeout(() => {
      api.suggest(text).then((d) => setSuggest(d.list)).catch(() => {});
    }, 220);
    return () => clearTimeout(t);
  }, [text, keyword]);

  const doSearch = async (kw, p = 1, s = sort, reset = false) => {
    setLoading(true);
    try {
      const d = await api.searchNotes({ keyword: kw, page: p, sort: s === 'hot' ? 'hot' : undefined });
      setNotes((prev) => (reset || p === 1 ? d.notes : [...prev, ...d.notes]));
      setPage(p);
      setHasMore(d.hasMore);
      setSuggest([]);
      if (token) api.searchHistory().then((r) => setHistory(r.list)).catch(() => {});
    } catch (e) {
      toast(e.message);
    } finally {
      setLoading(false);
    }
  };

  useReachBottom(() => {
    if (hasMore && !loading && keyword) doSearch(keyword, page + 1, sort);
  }, [hasMore, loading, page, keyword, sort]);

  const submit = (kw) => {
    const v = (kw ?? text).trim();
    if (!v) return toast('输入点什么吧');
    setParams({ keyword: v });
  };

  const clearHistory = async () => {
    await api.clearHistory().catch(() => {});
    setHistory([]);
    toast('已清空搜索历史');
  };

  const changeSort = (s) => {
    setSort(s);
    if (keyword) doSearch(keyword, 1, s, true);
  };

  return (
    <div className="page-with-tabbar">
      <div className="search-bar">
        <Icon name="back" size={22} onClick={() => navigate(-1)} />
        <div className="search-input">
          <Icon name="search" size={16} color="#999" />
          <input
            ref={inputRef}
            value={text}
            placeholder="搜索小红书"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          {text && (
            <Icon
              name="close"
              size={15}
              color="#bbb"
              onClick={() => {
                setText('');
                setSuggest([]);
                if (keyword) setParams({}); // 清空后回到热搜页
              }}
            />
          )}
        </div>
        <button className="search-btn" onClick={() => submit()}>
          搜索
        </button>
      </div>

      {suggest.length > 0 ? (
        <div className="suggest-list">
          {suggest.map((s) => (
            <div className="suggest-item" key={s} onClick={() => submit(s)}>
              <Icon name="search" size={15} color="#999" />
              <span>{s}</span>
            </div>
          ))}
        </div>
      ) : keyword ? (
        <>
          <div className="result-filter">
            {SORTS.map((s) => (
              <button key={s.key} className={'f' + (sort === s.key ? ' on' : '')} onClick={() => changeSort(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
          {notes.length === 0 && !loading ? (
            <div className="empty">
              <span className="empty-emoji">🔍</span>
              没有找到「{keyword}」相关笔记
            </div>
          ) : (
            <>
              <Waterfall notes={notes} cols={cols} onCardClick={(n) => navigate(`/note/${n.id}`)} onUserClick={(u) => u?.id && navigate(`/user/${u.id}`)} />
              <div className="loading-more">{loading ? '正在加载…' : hasMore ? '' : '— 没有更多了 —'}</div>
            </>
          )}
        </>
      ) : (
        <>
          {history.length > 0 && (
            <>
              <div className="section-title">
                搜索历史
                <span className="more" onClick={clearHistory}>
                  清空
                </span>
              </div>
              <div className="chips">
                {history.map((h) => (
                  <button className="tag" key={h} onClick={() => submit(h)}>
                    {h}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="section-title">小红书热搜榜</div>
          <div className="hot-list">
            {hot.map((h) => (
              <div className="hot-item" key={h.keyword} onClick={() => submit(h.keyword)}>
                <span className={'rank' + (h.rank <= 3 ? ' top' : '')}>{h.rank}</span>
                <span className="kw">{h.keyword}</span>
                {h.tag && (
                  <span className={'hot-tag' + (h.tag === '新' ? ' new' : h.tag === '爆' ? ' boom' : '')}>{h.tag}</span>
                )}
                <span className="heat">{(h.heat / 10000).toFixed(1)}万</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
