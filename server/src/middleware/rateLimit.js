/**
 * 极简内存限流（零依赖）
 * 目的：挡住「撞库/爆破登录」和「脚本刷注册」——这两种是公网部署最容易被扫的入口。
 * 局限：单进程内存，重启即清空，多实例不共享；真上规模请换成 Redis / nginx limit_req。
 */
const HITS = new Map();
const MAX_KEYS = 5000;

function gc(now) {
  if (HITS.size <= MAX_KEYS) return;
  for (const [k, v] of HITS) if (now - v.start > 60 * 60 * 1000) HITS.delete(k);
}

/**
 * @param {object} opts
 * @param {number} opts.windowMs 统计窗口
 * @param {number} opts.max 窗口内允许次数
 * @param {(req) => string} [opts.keyOf] 额外维度（如用户名），避免同一 NAT 出口互相误伤
 */
export function rateLimit({ windowMs = 60_000, max = 60, keyOf } = {}) {
  return (req, res, next) => {
    const now = Date.now();
    gc(now);
    const key = `${req.ip || req.socket?.remoteAddress || 'unknown'}|${keyOf ? keyOf(req) : ''}`;
    let rec = HITS.get(key);
    if (!rec || now - rec.start > windowMs) {
      rec = { start: now, n: 0 };
      HITS.set(key, rec);
    }
    rec.n += 1;
    if (rec.n > max) {
      const retry = Math.max(1, Math.ceil((rec.start + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retry));
      return res.status(429).json({ code: 429, msg: `操作过于频繁，请 ${retry} 秒后再试`, data: null });
    }
    next();
  };
}

/** 测试用：清空计数，避免用例之间互相影响 */
export function resetRateLimit() {
  HITS.clear();
}

export default { rateLimit, resetRateLimit };
