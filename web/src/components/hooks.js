import { useEffect, useState } from 'react';

/** 响应式列数：移动端 2 列（与官方一致），平板 3 列，桌面 4~5 列 */
export function useColumns() {
  const [cols, setCols] = useState(() => calc(window.innerWidth));
  useEffect(() => {
    const onResize = () => setCols(calc(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return cols;
}

function calc(w) {
  if (w >= 1600) return 5;
  if (w >= 1200) return 4;
  if (w >= 1024) return 3;
  if (w >= 720) return 3;
  return 2;
}

export function useIsDesktop() {
  const [d, setD] = useState(() => window.innerWidth >= 1024);
  useEffect(() => {
    const onResize = () => setD(window.innerWidth >= 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return d;
}

/** 触底加载更多 */
export function useReachBottom(cb, deps = []) {
  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      if (doc.scrollHeight - window.scrollY - window.innerHeight < 600) cb();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
