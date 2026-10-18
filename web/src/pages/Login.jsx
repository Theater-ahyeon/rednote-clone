import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useUserStore from '../store/user.js';
import { toast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useUserStore((s) => s.login);
  const register = useUserStore((s) => s.register);
  const demoLogin = useUserStore((s) => s.demoLogin);
  const refreshUnread = useUserStore((s) => s.refreshUnread);

  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);

  const from = location.state?.from || '/';

  const submit = async () => {
    if (!username.trim()) return toast('请输入用户名');
    if (password.length < 6) return toast('密码至少 6 位');
    setLoading(true);
    try {
      if (mode === 'login') await login(username.trim(), password);
      else await register(username.trim(), password, nickname.trim() || username.trim());
      await refreshUnread();
      toast(mode === 'login' ? '登录成功' : '注册成功');
      navigate(from, { replace: true });
    } catch (e) {
      toast(e.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  const demo = async () => {
    setLoading(true);
    try {
      await demoLogin();
      await refreshUnread();
      toast('已登录体验账号 demo');
      navigate(from, { replace: true });
    } catch (e) {
      toast(e.message || '体验账号不可用，请执行 npm run seed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <div className="login-logo">
        RedNote Clone <Icon name="fire" size={22} color="#ff2442" />
      </div>
      <div className="login-slogan">{mode === 'login' ? '欢迎回来，记录此刻的生活' : '加入 RedNote Clone，发现你感兴趣的生活'}</div>

      <div className="login-form">
        <div className="field">
          <span className="prefix">账号</span>
          <input placeholder="请输入用户名" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="field">
          <span className="prefix">密码</span>
          <input
            type="password"
            placeholder="请输入密码（至少 6 位）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
        {mode === 'register' && (
          <div className="field">
            <span className="prefix">昵称</span>
            <input placeholder="展示给别人的名字" value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </div>
        )}

        <div style={{ marginTop: 28 }}>
          <button className="btn btn-primary btn-block" disabled={loading} onClick={submit}>
            {mode === 'login' ? '登 录' : '注 册'}
          </button>
        </div>

        <div className="login-tip" onClick={demo} style={{ cursor: 'pointer', marginTop: 14 }}>
          <b>一键体验</b>：用种子账号 demo / 123456 直接登录（演示环境可用，生产部署默认关闭）
        </div>

        <div className="login-switch" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? (
            <>
              还没有账号？<span>立即注册</span>
            </>
          ) : (
            <>
              已有账号？<span>去登录</span>
            </>
          )}
        </div>

        <div className="login-agree">
          登录即代表同意《用户协议》和《隐私政策》。本项目为技术学习用途的仿写实现，与小红书官方无任何关联。
        </div>
      </div>
    </div>
  );
}
