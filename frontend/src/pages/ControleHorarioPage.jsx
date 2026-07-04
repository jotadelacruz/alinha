import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useProfile } from '../context/ProfileContext';
import { useSessionTimer } from '../context/SessionTimerContext';
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
  const { profile } = useProfile();
  const { session, startSession, endSession } = useSessionTimer();
  const [clients, setClients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const defaultSessionDuration = profile?.settings?.agenda?.sessionDuration || 50;

  useEffect(() => {
    async function load() {
      try {
        const [clientList, apptList] = await Promise.all([
          api.get('/clients'),
          api.get('/appointments', { from_iso: TODAY_ISO, to_iso: TODAY_ISO }),
        ]);
        setClients(clientList);
        setAppointments([...apptList].sort((a, b) => a.time.localeCompare(b.time)));
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
  const sessionDuration = session?.sessionDuration || defaultSessionDuration;
  const elapsedSeconds = session ? Math.floor((now - session.startedAt) / 1000) : 0;
  const totalSeconds = sessionDuration * 60;
  const remaining = totalSeconds - elapsedSeconds;
  const status = remaining <= 0 ? 'overtime' : remaining <= 300 ? 'warning' : 'normal';

  function requestNotificationPermission() {
    Notification.requestPermission().then(setNotifPermission);
  }

  function handleStart(clientId, time) {
    const c = clients.find((cl) => cl.id === clientId);
    startSession(clientId, c?.name, time, c?.sessionDuration);
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
                  <div key={a.id} className="timer-idle-item" onClick={() => handleStart(a.clientId, a.time)}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{c ? c.name : 'Cliente removido'}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{a.time}</div>
                    </div>
                    <button onClick={(e) => (e.stopPropagation(), handleStart(a.clientId, a.time))}>
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
          <div className="timer-client-name">{client ? client.name : session.clientName || 'Cliente'}</div>
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
