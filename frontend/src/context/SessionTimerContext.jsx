import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useProfile } from './ProfileContext';

const SessionTimerContext = createContext(null);

export function SessionTimerProvider({ children }) {
  const { profile } = useProfile();
  const [session, setSession] = useState(null); // { clientId, clientName, time, startedAt, sessionDuration }
  const [now, setNow] = useState(Date.now());
  const [warningDismissed, setWarningDismissed] = useState(false);
  const notifiedRef = useRef(false);

  const startSession = useCallback((clientId, clientName, time, sessionDuration) => {
    notifiedRef.current = false;
    setWarningDismissed(false);
    setSession({ clientId, clientName, time, startedAt: Date.now(), sessionDuration: sessionDuration || null });
  }, []);

  const endSession = useCallback(() => {
    setSession(null);
  }, []);

  const dismissWarning = useCallback(() => setWarningDismissed(true), []);

  useEffect(() => {
    if (!session) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [session]);

  const defaultSessionDuration = profile?.settings?.agenda?.sessionDuration || 50;
  const sessionDuration = session ? session.sessionDuration || defaultSessionDuration : null;
  const elapsedSeconds = session ? Math.floor((now - session.startedAt) / 1000) : 0;
  const remaining = session ? sessionDuration * 60 - elapsedSeconds : null;
  const status = !session ? null : remaining <= 0 ? 'overtime' : remaining <= 300 ? 'warning' : 'normal';

  useEffect(() => {
    if (!session || status !== 'warning' || notifiedRef.current) return;
    notifiedRef.current = true;
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('Alinha — 5 minutos restantes', {
        body: `A sessão com ${session.clientName || 'o cliente'} está terminando em 5 minutos.`,
      });
    }
  }, [session, status]);

  return (
    <SessionTimerContext.Provider
      value={{
        session,
        sessionDuration,
        remaining,
        status,
        warningDismissed,
        startSession,
        endSession,
        dismissWarning,
      }}
    >
      {children}
    </SessionTimerContext.Provider>
  );
}

export function useSessionTimer() {
  const ctx = useContext(SessionTimerContext);
  if (!ctx) throw new Error('useSessionTimer precisa estar dentro de <SessionTimerProvider>');
  return ctx;
}
