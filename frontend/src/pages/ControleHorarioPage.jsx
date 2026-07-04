import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { isoDate } from '../lib/dateUtils';

const TODAY_ISO = isoDate(new Date());

function formatClock(totalSeconds) {
  const sign = totalSeconds < 0 ? '-' : '';
  const abs = Math.abs(totalSeconds);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function ControleHorarioPage() {
  const [clients, setClients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [sessionDuration, setSessionDuration] = useState(50);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null); // { clientId, time, startedAt }
  const [now, setNow] = useState(Date.now());
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const notifiedRef = useRef(false);

  useEffect(() => {
    async function load() {
      try {
        const [clientList, apptList, profile] = await Promise.all([
          api.get('/clients'),
          api.get('/appointments', { from_iso: TODAY_ISO, to_iso: TODAY_ISO }),
          api.get('/profile'),
        ]);
        setClients(clientList);
        setAppointments([...apptList].sort((a, b) => a.time.localeCompare(b.time)));
        setSessionDuration(profile.settings.agenda.sessionDuration || 50);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [session]);

  const client = session ? clients.find((c) => c.id === session.clientId) : null;
  const elapsedSeconds = session ? Math.floor((now - session.startedAt) / 1000) : 0;
  const totalSeconds = sessionDuration * 60;
  const remaining = totalSeconds - elapsedSeconds;
  const status = remaining <= 0 ? 'overtime' : remaining <= 300 ? 'warning' : 'normal';

  useEffect(() => {
    if (!session) {
      notifiedRef.current = false;
      return;
    }
    if (status === 'warning' && !notifiedRef.current) {
      notifiedRef.current = true;
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('Alinha — 5 minutos restantes', {
          body: `A sessão com ${client ? client.name : 'o cliente'} está terminando em 5 minutos.`,
        });
      }
    }
  }, [status, session, client]);

  function requestNotificationPermission() {
    Notification.requestPermission().then(setNotifPermission);
  }

  function startSession(clientId, time) {
    notifiedRef.current = false;
    setSession({ clientId, time, startedAt: Date.now() });
  }

  function endSession() {
    setSession(null);
  }

  if (loading) return <p>Carregando…</p>;

  return (
    <div>
      <h2>Controle de horário</h2>
      {error && <p className="error">{error}</p>}

      {notifPermission === 'default' && (
        <div className="timer-permission-banner card" style={{ padding: 16 }}>
          <strong>Ativar avisos de horário</strong>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0 12px' }}>
            Permita notificações para ser avisado quando a sessão estiver chegando ao fim, mesmo em outra aba.
          </p>
          <button onClick={requestNotificationPermission}>Ativar notificações</button>
        </div>
      )}

      {!session && (
        <>
          {appointments.length === 0 ? (
            <div className="timer-empty">
              <h3>Nenhuma consulta hoje</h3>
              <p>Não há sessões agendadas para hoje.</p>
            </div>
          ) : (
            <div className="timer-idle-list">
              {appointments.map((a) => {
                const c = clients.find((cl) => cl.id === a.clientId);
                return (
                  <div key={a.id} className="timer-idle-item" onClick={() => startSession(a.clientId, a.time)}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{c ? c.name : 'Cliente removido'}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{a.time}</div>
                    </div>
                    <button onClick={(e) => (e.stopPropagation(), startSession(a.clientId, a.time))}>
                      Iniciar consulta
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {session && (
        <div className={`timer-card ${status}`}>
          <div className="timer-client-name">{client ? client.name : 'Cliente'}</div>
          <div className="timer-client-meta">
            Sessão das {session.time} · {sessionDuration} min
          </div>
          <div className="timer-display">{formatClock(remaining)}</div>
          <div className="timer-status-label">
            {status === 'overtime' ? 'Tempo excedido' : status === 'warning' ? 'Faltam menos de 5 minutos' : 'Em andamento'}
          </div>
          <div className="timer-actions">
            <button onClick={endSession}>Finalizar sessão</button>
          </div>
        </div>
      )}
    </div>
  );
}
