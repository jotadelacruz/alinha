import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { applyColorTheme, applyTheme } from '../lib/theme';

const ProfileContext = createContext(null);

export function ProfileProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [suspendedMessage, setSuspendedMessage] = useState(null);

  const refreshProfile = useCallback(async () => {
    const p = await api.get('/profile');
    setProfile(p);
    applyTheme(p.settings.theme);
    applyColorTheme(p.settings.colorTheme);
    return p;
  }, []);

  useEffect(() => {
    refreshProfile()
      .catch((e) => {
        if (e.status === 403) setSuspendedMessage(e.message);
      })
      .finally(() => setLoading(false));
  }, [refreshProfile]);

  return (
    <ProfileContext.Provider value={{ profile, loading, suspendedMessage, refreshProfile, setProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile precisa estar dentro de <ProfileProvider>');
  return ctx;
}
