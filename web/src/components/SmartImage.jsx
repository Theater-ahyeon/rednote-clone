import { useEffect, useRef, useState } from 'react';

/**
 * 图片组件
 * - 支持「远程图失败 → 本地 SVG 兜底」（断网演示场景）
 * - 骨架占位 + 懒加载，避免瀑布流空白闪烁
 */
export default function SmartImage({ src, fallback, alt = '', ratio, className = '', style, onClick }) {
  const [loaded, setLoaded] = useState(false);
  const [cur, setCur] = useState(src || fallback);
  const ref = useRef(null);

  useEffect(() => {
    setCur(src || fallback);
    setLoaded(false);
  }, [src, fallback]);

  useEffect(() => {
    if (!ref.current) return;
    if (ref.current.complete && ref.current.naturalWidth > 0) setLoaded(true);
  }, [cur]);

  return (
    <div
      className={className}
      style={{ position: 'relative', overflow: 'hidden', background: '#f2f2f2', ...(ratio ? { aspectRatio: String(ratio) } : null), ...style }}
      onClick={onClick}
    >
      {!loaded && <div style={{ position: 'absolute', inset: 0 }} className="skeleton" />}
      <img
        ref={ref}
        src={cur}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (fallback && cur !== fallback) setCur(fallback);
          else setLoaded(true);
        }}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: loaded ? 1 : 0,
          transition: 'opacity .25s',
          display: 'block'
        }}
      />
    </div>
  );
}
