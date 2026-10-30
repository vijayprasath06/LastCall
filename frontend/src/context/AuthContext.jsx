/* AuthContext.jsx — JWT auth state + persistence */
import { createContext, useContext, useState, useCallback } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('egpp_user');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  const login = useCallback(async (identifier, password) => {
    const isEmail = identifier.includes('@');
    const payload = {
      password,
      ...(isEmail ? { email: identifier } : { phone: identifier })
    };
    const { data } = await api.post('/auth/login', payload);
    localStorage.setItem('egpp_access_token', data.accessToken);
    localStorage.setItem('egpp_refresh_token', data.refreshToken);
    localStorage.setItem('egpp_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    if (data.accessToken) {
      // Consumer: auto-logged in
      localStorage.setItem('egpp_access_token', data.accessToken);
      localStorage.setItem('egpp_refresh_token', data.refreshToken);
      localStorage.setItem('egpp_user', JSON.stringify(data.user));
      setUser(data.user);
    }
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    localStorage.clear();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get('/users/me');
      localStorage.setItem('egpp_user', JSON.stringify(data.user));
      setUser(data.user);
    } catch { /* ignore */ }
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, logout, refreshUser, isLoggedIn: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
