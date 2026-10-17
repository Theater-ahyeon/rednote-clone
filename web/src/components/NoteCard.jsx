import { useMemo } from 'react';
import SmartImage from './SmartImage.jsx';
import Icon from './Icon.jsx';

function fmtCount(n) {
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  return String(n ?? 0);
}

/** 单张笔记卡片（对应小红书 noteCard） */
export default function NoteCard({ note, onClick, onUserClick }) {
  const cover = note.cover || note.images?.[0] || {};
  const ratio = cover.w && cover.h ? `${cover.w} / ${cover.h}` : '3 / 4';
  const liked = note.interactInfo?.liked;

  return (
    <article className="note-card" onClick={() => onClick?.(note)}>
      <div style={{ position: 'relative' }}>
        <SmartImage
          className="note-cover"
          src={cover.url}
          fallback={cover.fallback}
          alt={note.title}
          ratio={ratio}
        />
        {(note.images?.length || 0) > 1 && <span className="multi-tag">{note.images.length}图</span>}
      </div>
      <div className="note-body">
        <div className="note-title">{note.title || note.desc}</div>
        <div className="note-foot">
          <img
            className="avatar-xs"
            src={note.user?.avatar}
            alt=""
            onClick={(e) => {
              e.stopPropagation();
              onUserClick?.(note.user);
            }}
          />
          <span className="nickname">{note.user?.nickname}</span>
          <span className="likes">
            <Icon name={liked ? 'heartFill' : 'heart'} size={13} color={liked ? '#ff2442' : '#999'} />
            {fmtCount(note.interactInfo?.likedCount)}
          </span>
        </div>
      </div>
    </article>
  );
}

/** 瀑布流：按封面宽高比做「最短列优先」分列，避免 CSS column 的竖排缺陷 */
export function Waterfall({ notes, cols, onCardClick, onUserClick }) {
  const columns = useMemo(() => {
    const buckets = Array.from({ length: cols }, () => ({ list: [], h: 0 }));
    for (const n of notes) {
      const cover = n.cover || n.images?.[0] || {};
      const ar = cover.h && cover.w ? cover.h / cover.w : 1.333;
      const titleLines = (n.title || n.desc || '').length > 22 ? 2 : 1;
      const est = ar + (titleLines * 20 + 34) / 200; // 归一化估算高度
      let min = 0;
      for (let i = 1; i < cols; i++) if (buckets[i].h < buckets[min].h) min = i;
      buckets[min].list.push(n);
      buckets[min].h += est;
    }
    return buckets.map((b) => b.list);
  }, [notes, cols]);

  return (
    <div className="waterfall">
      {columns.map((col, i) => (
        <div className="waterfall-col" key={i}>
          {col.map((n) => (
            <NoteCard key={n.id} note={n} onClick={onCardClick} onUserClick={onUserClick} />
          ))}
        </div>
      ))}
    </div>
  );
}

export { fmtCount };
