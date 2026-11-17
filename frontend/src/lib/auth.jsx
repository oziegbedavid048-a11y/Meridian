import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { clearPersonalData } from './safety.js';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api('/auth/me/');
      setUser(data.user);
      return data.user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback(async (email, password, remember) => {
    const data = await api('/auth/login/', { method: 'POST', body: { email, password, remember } });
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (email, password, emailConsent, verificationToken) => {
    const data = await api('/auth/register/', {
      method: 'POST',
      body: { email, password, email_consent: emailConsent, verification_token: verificationToken },
    });
    setUser(data.user);
    return data.user;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api('/auth/logout/', { method: 'POST' });
    } finally {
      clearPersonalData();
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, refresh, signIn, register, signOut, setUser }),
    [user, loading, refresh, signIn, register, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
