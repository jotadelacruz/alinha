import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const SessionTimerContext = createContext(null);

export function SessionTimerProvider({ children }) {
  const [session, setSession] = useState(null); // { clientId, clientName, time, startedAt, sessionDuration }
  const notifiedRef = useRef(false);

  const startSession = useCallback((clientId, clientName, time, sessionDuration) => {
    notifiedRef.current = false;
    setSession({ clientId, clientName, time, startedAt: Date.now(), sessionDuration: sessionDuration || null });
  }, []);

  const endSession = useCallback(() => {
    setSession(null);
  }, []);

  useEffect(() => {
    if (!session) {
      notifiedRef.current = false;
      return;
    }
    const interval = setInterval(() => {
      if (!session.sessionDuration || notifiedRef.current) return;
      const elapsedSeconds = Math.floor((Date.now() - session.startedAt) / 1000);
      const remaining = session.sessionDuration * 60 - elapsedSeconds;
      if (remaining <= 300 && remaining > 0) {
        notifiedRef.current = true;
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('Alinha — 5 minutos restantes', {
            body: `A sessão com ${session.clientName || 'o cliente'} está terminando em 5 minutos.`,
          });
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [session]);

  return (
    <SessionTimerContext.Provider value={{ session, startSession, endSession }}>
      {children}
    </SessionTimerContext.Provider>
  );
}

export function useSessionTimer() {
  const ctx = useContext(SessionTimerContext);
  if (!ctx) throw new Error('useSessionTimer precisa estar dentro de <SessionTimerProvider>');
  return ctx;
}
