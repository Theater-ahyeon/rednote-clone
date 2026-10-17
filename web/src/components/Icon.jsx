import React from 'react';

/**
 * 图标集：全部手绘 SVG，风格对齐小红书（线性 / 2px 描边）
 */
const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm3.5-12.5-2.1 5-5 2.1 2.1-5z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm5.6-.4L21 21',
  bell: 'M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6zm0 18a2.5 2.5 0 0 0 2.5-2.5h-5A2.5 2.5 0 0 0 12 21z',
  user: 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-4 0-7.5 2.4-7.5 5.2V21h15v-1.8C19.5 16.4 16 14 12 14z',
  heart: 'M12 20.3 4.7 13a4.8 4.8 0 0 1 6.8-6.8l.5.5.5-.5a4.8 4.8 0 1 1 6.8 6.8z',
  heartFill: 'M12 20.3 4.7 13a4.8 4.8 0 0 1 6.8-6.8l.5.5.5-.5a4.8 4.8 0 1 1 6.8 6.8z',
  star: 'M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.9l6-.8z',
  starFill: 'M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.9l6-.8z',
  comment: 'M20 12a8 8 0 1 1-3.2-6.4L20 4l-.8 3.4A7.9 7.9 0 0 1 20 12zm-8 4.5c-5 0-9-2.9-9-4.5 0-1.6 4-4.5 9-4.5s9 2.9 9 4.5-4 4.5-9 4.5z',
  back: 'M15 5l-7 7 7 7',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  plus: 'M12 5v14M5 12h14',
  camera: 'M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zm8 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  location: 'M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  close: 'M6 6l12 12M18 6 6 18',
  menu: 'M4 7h16M4 12h16M4 17h16',
  edit: 'M4 20h4l10-10-4-4L4 16zM14 6l4 4',
  fire: 'M12 22c3.9 0 6.5-2.5 6.5-6 0-4.5-4.5-6-4.5-10 0 0-2.5 1.5-2.5 4.5C11.5 8 9 8 9 11c0 1.5 1 2.5 1 2.5S8.5 14 7.5 12.5 5.5 15 5.5 16c0 3.5 2.6 6 6.5 6z',
};

const FILLED = new Set(['heartFill', 'starFill', 'home', 'user', 'more', 'fire']);

export default function Icon({ name, size = 20, color = 'currentColor', stroke = 1.8, className = '', style, ...rest }) {
  const d = PATHS[name];
  if (!d) return null;
  const filled = FILLED.has(name);
  return (
    <svg
      className={`icon ${className}`}
      style={{ width: size, height: size, ...style }}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...rest}
    >
      <path
        d={d}
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
      />
    </svg>
  );
}

export { PATHS };
