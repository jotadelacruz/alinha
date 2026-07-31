import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useProfile } from '../context/ProfileContext';
import { useSessionTimer } from '../context/SessionTimerContext';
import { WEEK_DAYS, addDays, buildTimeSlots, formatBR, isoDate, mondayOf, weekdayNameOf } from '../lib/dateUtils';
import { confirmationMessage, whatsappLink } from '../lib/whatsapp';

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const TODAY_ISO = isoDate(TODAY);
const ROW_HEIGHT = 64;

const RECURRENCE_OPTIONS = [
  { key: 'none', label: 'Não repetir' },
  { key: 'Semanal', label: 'Semanal' },
  { key: 'Quinzenal', label: 'Quinzenal' },
  { key: 'Mensal', label: 'Mensal' },
];

const EMPTY_FORM = {
  clientId: '',
  dateIso: '',
  time: '08:00',
  modality: 'Presencial',
  status: 'confirmed',
  recurrence: 'none',
};

export default function AgendaPage() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { startSession } = useSessionTimer();
  const [weekOffset, setWeekOffset] = useState(0);
  const [view, setView] = useState('grade'); // 'grade' | 'lista'
  const [clients, setClients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null);

  const timeSlots = useMemo(
    () => buildTimeSlots(profile?.settings?.agenda?.workStart, profile?.settings?.agenda?.workEnd),
    [profile]
  );

  const monday = useMemo(() => addDays(mondayOf(TODAY), weekOffset * 7), [weekOffset]);
  const weekDates = useMemo(() => WEEK_DAYS.map((_, i) => addDays(monday, i)), [monday]);
  const fromISO = isoDate(weekDates[0]);
  const toISO = isoDate(weekDates[weekDates.length - 1]);

  useEffect(() => {
    reload();
  }, [fromISO, toISO]);

  useEffect(() => {
    api.get('/clients').then(setClients).catch((e) => setError(e.message));
  }, []);

  async function reload() {
    setLoading(true);
    try {
      setAppointments(await api.get('/appointments', { from_iso: fromISO, to_iso: toISO }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function clientById(id) {
    return clients.find((c) => c.id === id);
  }

  function openNewForm(dateIso, time) {
    if (clients.length === 0) {
      setError('Cadastre um cliente primeiro');
      return;
    }
    setForm({ ...EMPTY_FORM, clientId: clients[0].id, dateIso: dateIso || fromISO, time: time || timeSlots[0] });
    setShowForm(true);
  }

  async function handleCreate(e) {
    e.preventDefault();
    const conflict = appointments.some((a) => a.dateIso === form.dateIso && a.time === form.time);
    if (conflict) {
      setError('Já existe uma consulta nesse horário');
      return;
    }
    const weekDay = weekdayNameOf(form.dateIso);
    if (form.recurrence !== 'none' && !weekDay) {
      setError('Recorrência só é possível para dias de semana (segunda a sexta).');
      return;
    }
    try {
      await api.post('/appointments', form);
      if (form.recurrence !== 'none') {
        const c = clientById(form.clientId);
        await api.put(`/clients/${c.id}`, {
          ...c,
          frequency: form.recurrence,
          day: weekDay,
          time: form.time,
        });
      }
      setShowForm(false);
      setError('');
      await reload();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleStatusChange(appt, status) {
    await api.patch(`/appointments/${appt.id}/status`, { status });
    setSelected(null);
    await reload();
  }

  async function handleDelete(appt) {
    if (!confirm('Cancelar esta consulta?')) return;
    await api.delete(`/appointments/${appt.id}`);
    setSelected(null);
    await reload();
  }

  async function handleDeleteSeries(appt) {
    if (!confirm('Cancelar toda a série recorrente futura?')) return;
    await api.delete(`/appointments/recurrence/${appt.recurrenceId}`, { from_date_iso: isoDate(TODAY) });
    setSelected(null);
    await reload();
  }

  function handleStartSession(appt) {
    const client = clientById(appt.clientId);
    startSession(appt.clientId, client?.name, appt.time, client?.sessionDuration);
    navigate('/app/controle-horario');
  }

  function apptClass(a) {
    if (a.status !== 'pending') return 'confirmed';
    const daysUntil = Math.round((new Date(a.dateIso) - TODAY) / 86400000);
    return daysUntil <= 1 ? 'urgent' : 'pending';
  }

  const grouped = {};
  [...appointments]
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso) || a.time.localeCompare(b.time))
    .forEach((a) => {
      (grouped[a.dateIso] = grouped[a.dateIso] || []).push(a);
    });

  return (
    <div>
      <header>
        <h2>Agenda</h2>
        <button onClick={() => openNewForm()}>Nova consulta</button>
      </header>

      {error && <p className="error">{error}</p>}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="appt-detail modal-card" onClick={(e) => e.stopPropagation()}>
            <h4>{clientById(selected.clientId)?.name}</h4>
            <p>
              {formatBR(selected.dateIso)} às {selected.time}
            </p>
            {clientById(selected.clientId)?.phone ? (
              <a
                className="whatsapp-confirm-btn"
                href={whatsappLink(
                  clientById(selected.clientId).phone,
                  confirmationMessage(clientById(selected.clientId).name, selected.dateIso, selected.time)
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2a10 10 0 00-8.6 15L2 22l5.2-1.4A10 10 0 1012 2zm0 18.2a8.1 8.1 0 01-4.2-1.2l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8.9-.1.2-.3.2-.6.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.1.2-.3.2-.4.1-.2 0-.3 0-.4 0-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.4c.1.2 1.6 2.5 4 3.5.6.2 1 .4 1.3.5.6.2 1.1.2 1.5.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.2-.5-.3z" />
                </svg>
                Confirmar por WhatsApp
              </a>
            ) : (
              <p className="whatsapp-no-phone">Cadastre o telefone do cliente para confirmar por WhatsApp.</p>
            )}
            <div>
              <button onClick={() => handleStatusChange(selected, 'confirmed')}>Marcar confirmada</button>
              <button onClick={() => handleStatusChange(selected, 'pending')}>Marcar a confirmar</button>
            </div>
            {selected.dateIso === TODAY_ISO && (
              <button onClick={() => handleStartSession(selected)}>Iniciar consulta</button>
            )}
            <button onClick={() => handleDelete(selected)}>Cancelar esta consulta</button>
            {selected.recurrenceId && (
              <button onClick={() => handleDeleteSeries(selected)}>Cancelar série recorrente futura</button>
            )}
            <button onClick={() => setSelected(null)}>Fechar</button>
          </div>
        </div>
      )}

      <div className="week-nav">
        <button onClick={() => setWeekOffset((v) => v - 1)}>← Semana anterior</button>
        <button onClick={() => setWeekOffset(0)}>Hoje</button>
        <button onClick={() => setWeekOffset((v) => v + 1)}>Próxima semana →</button>
        <span>
          {formatBR(isoDate(weekDates[0]))} a {formatBR(isoDate(weekDates[weekDates.length - 1]))}
        </span>
        <div className="view-toggle">
          <button className={view === 'grade' ? 'active' : ''} onClick={() => setView('grade')}>
            Grade
          </button>
          <button className={view === 'lista' ? 'active' : ''} onClick={() => setView('lista')}>
            Lista
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="appt-form">
          <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={form.dateIso}
            onChange={(e) => setForm({ ...form, dateIso: e.target.value })}
            required
          />
          <select value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })}>
            {timeSlots.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value })}>
            <option value="Presencial">Presencial</option>
            <option value="Online">Online</option>
          </select>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="confirmed">Confirmada</option>
            <option value="pending">Aguardando confirmação</option>
          </select>
          <label className="appt-form-recurrence">
            Recorrência
            <select value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>
              {RECURRENCE_OPTIONS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
            {form.recurrence !== 'none' && (
              <span className="client-form-section-hint">
                Isso também atualiza a frequência e o dia/horário fixo do cliente em Clientes.
              </span>
            )}
          </label>
          <button type="submit">Agendar</button>
          <button type="button" onClick={() => setShowForm(false)}>
            Cancelar
          </button>
        </form>
      )}

      {loading ? (
        <p>Carregando agenda…</p>
      ) : view === 'grade' ? (
        <div className="week-grid">
          <div className="head"></div>
          {weekDates.map((d, i) => {
            const dISO = isoDate(d);
            return (
              <div key={dISO} className={`head ${dISO === TODAY_ISO ? 'today' : ''}`}>
                <div className="dow">{WEEK_DAYS[i].slice(0, 3)}</div>
                <div className="dnum">{d.getDate()}</div>
              </div>
            );
          })}

          <div className="time-col">
            {timeSlots.map((t) => (
              <div key={t} className="time-cell">
                {t}
              </div>
            ))}
          </div>

          {weekDates.map((d) => {
            const dISO = isoDate(d);
            const dayAppts = grouped[dISO] || [];
            return (
              <div key={dISO} className="day-col">
                {timeSlots.map((t) => {
                  const occupied = dayAppts.some((a) => a.time === t);
                  return (
                    <div
                      key={t}
                      className="slot"
                      onClick={() => !occupied && openNewForm(dISO, t)}
                      title={occupied ? undefined : `Agendar em ${formatBR(dISO)} às ${t}`}
                    />
                  );
                })}
                {dayAppts.map((a) => {
                  const client = clientById(a.clientId);
                  const rowIndex = timeSlots.indexOf(a.time);
                  if (rowIndex === -1) return null;
                  return (
                    <button
                      key={a.id}
                      className={`appt-block ${apptClass(a)}`}
                      style={{ top: rowIndex * ROW_HEIGHT + 4, height: ROW_HEIGHT - 8 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(a);
                      }}
                    >
                      <div className="name">{client ? client.name : 'Cliente removido'}</div>
                      <div className="time">
                        {a.time}
                        {a.modality === 'Online' ? ' · Online' : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="agenda-list">
          {weekDates.map((d, i) => {
            const dISO = isoDate(d);
            const items = grouped[dISO];
            if (!items) return null;
            return (
              <div key={dISO}>
                <h4>
                  {WEEK_DAYS[i]}-feira, {d.getDate()}
                  {dISO === TODAY_ISO ? ' — hoje' : ''}
                </h4>
                {items.map((a) => {
                  const cl = clientById(a.clientId);
                  return (
                    <div key={a.id} className={`appt-row ${apptClass(a)}`} onClick={() => setSelected(a)}>
                      <strong>{a.time}</strong> — {cl ? cl.name : 'Cliente removido'} ·{' '}
                      {a.status === 'pending' ? 'A confirmar' : 'Confirmada'} · {a.modality}
                      {a.recurrenceId ? ' · recorrente' : ''}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {Object.keys(grouped).length === 0 && <p>Nenhuma consulta agendada nesta semana.</p>}
        </div>
      )}
    </div>
  );
}
