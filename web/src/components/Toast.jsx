import { create } from 'zustand';

let seq = 0;
export const useToastStore = create((set) => ({
  items: [],
  push(msg, duration = 1800) {
    const id = ++seq;
    set((s) => ({ items: [...s.items, { id, msg }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), duration);
  }
}));

export function toast(msg, duration) {
  useToastStore.getState().push(msg, duration);
}

export function ToastHost() {
  const items = useToastStore((s) => s.items);
  if (!items.length) return null;
  return (
    <div className="toast-wrap">
      {items.map((i) => (
        <div className="toast" key={i.id}>
          {i.msg}
        </div>
      ))}
    </div>
  );
}

export default toast;
