import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { isoDate } from '../lib/dateUtils';

const TODAY = new Date();
const TODAY_ISO = isoDate(TODAY);

function fmtBRL(v) {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const WEEKDAY_LABELS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MONTH_LABELS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export default function ResumoPage() {
  const [clients, setClients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [bills, setBills] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [clientList, apptList, billList] = await Promise.all([
          api.get('/clients'),
          api.get('/appointments', { from_iso: TODAY_ISO, to_iso: TODAY_ISO }),
          api.get('/bills'),
        ]);
        setClients(clientList);
        setAppointments(apptList);
        setBills(billList);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function clientById(id) {
    return clients.find((c) => c.id === id);
  }

  const todayAppointments = [...appointments].sort((a, b) => a.time.localeCompare(b.time));
  const todayBills = bills.filter((b) => b.dueDate === TODAY_ISO);
  const faturamentoHoje = todayAppointments.reduce((sum, a) => {
    const client = clientById(a.clientId);
    return sum + (client ? client.value : 0);
  }, 0);

  const dateLabel = `${WEEKDAY_LABELS[TODAY.getDay()]}, ${TODAY.getDate()} de ${MONTH_LABELS[TODAY.getMonth()]}`;

  if (loading) return <p>Carregando resumo…</p>;

  return (
    <div>
      <header>
        <div>
          <h2>Resumo</h2>
          <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 4, marginBottom: 0 }}>{dateLabel}</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}

      <div className="kpi-row">
        <div className="kpi-card">
          <div>Consultas hoje</div>
          <strong>{todayAppointments.length}</strong>
        </div>
        <div className="kpi-card">
          <div>Faturamento hoje</div>
          <strong>{fmtBRL(faturamentoHoje)}</strong>
        </div>
        <div className="kpi-card">
          <div>Contas a pagar hoje</div>
          <strong>{todayBills.length}</strong>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12 }}>Consultas de hoje</h3>
        {todayAppointments.length === 0 && <p style={{ color: 'var(--ink-soft)', fontSize: 13.5 }}>Nenhuma consulta hoje.</p>}
        {todayAppointments.map((a) => {
          const client = clientById(a.clientId);
          return (
            <div key={a.id} className="appt-row">
              <strong>{a.time}</strong> — {client ? client.name : 'Cliente removido'} ·{' '}
              {a.status === 'pending' ? 'A confirmar' : 'Confirmada'} · {a.modality}
            </div>
          );
        })}
      </div>

      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ marginBottom: 12 }}>Contas a pagar hoje</h3>
        {todayBills.length === 0 && (
          <p style={{ color: 'var(--ink-soft)', fontSize: 13.5 }}>Nenhuma conta vencendo hoje 🎉</p>
        )}
        {todayBills.map((b) => (
          <div key={b.id} className="appt-row">
            <strong>{fmtBRL(b.amount)}</strong> — {b.name} ({b.category})
          </div>
        ))}
      </div>
    </div>
  );
}
