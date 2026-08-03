import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, type AuthUser } from '../lib/api';

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (fullName: string, email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const TOKEN_KEY = 'hbs_access_token';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }

    api.me(token)
      .then(setUser)
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    async login(email, password) {
      const result = await api.login({ email, password });
      localStorage.setItem(TOKEN_KEY, result.accessToken);
      setUser(result.user);
    },
    async register(fullName, email, password) {
      const result = await api.register({ fullName, email, password });
      localStorage.setItem(TOKEN_KEY, result.accessToken);
      setUser(result.user);
    },
    logout() {
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
    },
  }), [loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
