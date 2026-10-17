import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../api/index.js';

export const useUserStore = create(
  persist(
    (set, get) => ({
      token: '',
      user: null,
      unread: 0,

      setAuth({ token, user }) {
        set({ token, user });
      },
      logout() {
        set({ token: '', user: null, unread: 0 });
      },
      patchUser(patch) {
        set({ user: { ...get().user, ...patch } });
      },

      async login(username, password) {
        const data = await api.login(username, password);
        set({ token: data.token, user: data.user });
        return data.user;
      },
      async register(username, password, nickname) {
        const data = await api.register(username, password, nickname);
        set({ token: data.token, user: data.user });
        return data.user;
      },
      async demoLogin() {
        const data = await api.demoLogin();
        set({ token: data.token, user: data.user });
        return data.user;
      },
      async refreshMe() {
        if (!get().token) return null;
        try {
          const user = await api.me();
          set({ user });
          return user;
        } catch {
          set({ token: '', user: null });
          return null;
        }
      },
      async refreshUnread() {
        if (!get().token) return 0;
        try {
          const { count } = await api.unread();
          set({ unread: count });
          return count;
        } catch {
          return 0;
        }
      }
    }),
    { name: 'rednote-auth', partialize: (s) => ({ token: s.token, user: s.user }) }
  )
);

export const useIsLogin = () => !!useUserStore((s) => s.token);

export default useUserStore;
