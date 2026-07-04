import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { TIME_SLOTS, WEEK_DAYS, addDays, formatBR, isoDate, mondayOf } from '../lib/dateUtils';
import { confirmationMessage, whatsappLink } from '../lib/whatsapp';

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const TODAY_ISO = isoDate(TODAY);
const ROW_HEIGHT = 64;

const EMPTY_FORM = { clientId: '', dateIso: '', time: '08:00', modality: 'Presencial', status: 'confirmed' };

export default function AgendaPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [view, setView] = useState('grade'); // 'grade' | 'lista'
  const [clients, setClients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null);

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
    setForm({ ...EMPTY_FORM, clientId: clients[0].id, dateIso: dateIso || fromISO, time: time || '08:00' });
    setShowForm(true);
  }

  async function handleCreate(e) {
    e.preventDefault();
    const conflict = appointments.some((a) => a.dateIso === form.dateIso && a.time === form.time);
    if (conflict) {
      setError('Já existe uma consulta nesse horário');
      return;
    }
    try {
      await api.post('/appointments', form);
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

  function apptClass(a) {
    if (a.modality === 'Online') return 'online';
    return a.status === 'pending' ? 'pending' : 'confirmed';
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
            {TIME_SLOTS.map((t) => (
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
            {TIME_SLOTS.map((t) => (
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
                {TIME_SLOTS.map((t) => {
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
                  const rowIndex = TIME_SLOTS.indexOf(a.time);
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
                    <div key={a.id} className="appt-row" onClick={() => setSelected(a)}>
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

      {selected && (
        <div className="appt-detail">
          <h4>{clientById(selected.clientId)?.name}</h4>
          <p>
            {formatBR(selected.dateIso)} às {selected.time}
          </p>
          <div>
            <button onClick={() => handleStatusChange(selected, 'confirmed')}>Marcar confirmada</button>
            <button onClick={() => handleStatusChange(selected, 'pending')}>Marcar a confirmar</button>
          </div>
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
              Confirmar por WhatsApp
            </a>
          ) : (
            <p className="whatsapp-no-phone">Cadastre o telefone do cliente para confirmar por WhatsApp.</p>
          )}
          <button onClick={() => handleDelete(selected)}>Cancelar esta consulta</button>
          {selected.recurrenceId && (
            <button onClick={() => handleDeleteSeries(selected)}>Cancelar série recorrente futura</button>
          )}
          <button onClick={() => setSelected(null)}>Fechar</button>
        </div>
      )}
    </div>
  );
}
