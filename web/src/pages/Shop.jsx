import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';

/** 官方第二个 Tab「购物」在本项目中为占位页：核心功能聚焦社区笔记链路 */
export default function Shop() {
  const navigate = useNavigate();
  return (
    <div className="page-with-tabbar">
      <div className="navbar center">
        <div className="nav-title">购物</div>
      </div>
      <div className="empty" style={{ paddingTop: 120 }}>
        <span className="empty-emoji">🛍️</span>
        <div style={{ fontSize: 16, color: '#333', marginBottom: 8 }}>购物频道</div>
        <div style={{ fontSize: 13, lineHeight: '20px' }}>
          本仿写项目聚焦「内容社区」核心链路，
          <br />
          电商交易部分未接入，可在首页/搜索查看笔记内容。
        </div>
        <div style={{ marginTop: 20 }}>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            回到首页
          </button>
        </div>
      </div>
      <div style={{ textAlign: 'center', marginTop: -20 }}>
        <Icon name="compass" size={90} color="#f2f2f2" stroke={1} />
      </div>
    </div>
  );
}
