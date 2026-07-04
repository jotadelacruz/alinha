import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatBR, isoDate } from '../lib/dateUtils';

const TODAY = new Date();
const CURRENT_MONTH_ISO = isoDate(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1));

function fmtBRL(v) {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const STATUS_LABEL = { pago: 'Pago', parcial: 'Parcial', aberto: 'Em aberto' };

const BILL_CATEGORIES = [
  'Aluguel',
  'Água',
  'Luz',
  'Internet',
  'Telefone',
  'Material de consultório',
  'Supervisão',
  'Assinaturas/Software',
  'Impostos',
  'Outros',
];

const CATEGORY_ICONS = {
  Aluguel: '🏠',
  Água: '💧',
  Luz: '⚡',
  Internet: '🌐',
  Telefone: '☎️',
  'Material de consultório': '🗂️',
  Supervisão: '🎓',
  'Assinaturas/Software': '💳',
  Impostos: '🧾',
  Outros: '📦',
};

const MONTH_LABELS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const EMPTY_PAYMENT_FORM = { amount: '', paymentDate: isoDate(TODAY), paymentMethod: 'PIX' };
const EMPTY_BILL_FORM = { name: '', category: 'Outros', amount: '', dueDate: isoDate(TODAY), isFixed: false };

export default function FinanceiroPage() {
  const [tab, setTab] = useState('por-cliente');
  const [clients, setClients] = useState([]);
  const [finances, setFinances] = useState({});
  const [summary, setSummary] = useState(null);
  const [bills, setBills] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState('');
  const [payingClientId, setPayingClientId] = useState(null);
  const [paymentForm, setPaymentForm] = useState(EMPTY_PAYMENT_FORM);
  const [showBillForm, setShowBillForm] = useState(false);
  const [billForm, setBillForm] = useState(EMPTY_BILL_FORM);
  const [monthlyHistory, setMonthlyHistory] = useState([]);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    try {
      const [clientList, summaryData, billList, txList] = await Promise.all([
        api.get('/clients'),
        api.get('/finance/summary', { month_iso: CURRENT_MONTH_ISO }),
        api.get('/bills'),
        api.get('/payment-transactions', { reference_month_iso: CURRENT_MONTH_ISO }),
      ]);
      setClients(clientList);
      setSummary(summaryData);
      setBills(billList);
      setTransactions(txList);

      const finPairs = await Promise.all(
        clientList.map((c) =>
          api
            .get(`/finance/client/${c.id}`, { month_iso: CURRENT_MONTH_ISO })
            .then((fin) => [c.id, fin])
        )
      );
      setFinances(Object.fromEntries(finPairs));

      const months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - (5 - i), 1);
        return { iso: isoDate(d), label: MONTH_LABELS_SHORT[d.getMonth()] };
      });
      const history = await Promise.all(
        months.map(async (m) => {
          const txs = await api.get('/payment-transactions', { reference_month_iso: m.iso });
          const total = txs.reduce((sum, t) => sum + t.amount, 0);
          return { ...m, total };
        })
      );
      setMonthlyHistory(history);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleSessionsChange(client, sessions) {
    try {
      await api.put('/payments', {
        clientId: client.id,
        referenceMonthIso: CURRENT_MONTH_ISO,
        sessions: Number(sessions) || 0,
        status: 'aberto',
      });
      const fin = await api.get(`/finance/client/${client.id}`, { month_iso: CURRENT_MONTH_ISO });
      setFinances((prev) => ({ ...prev, [client.id]: fin }));
      const summaryData = await api.get('/finance/summary', { month_iso: CURRENT_MONTH_ISO });
      setSummary(summaryData);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleRegisterPayment(e, client) {
    e.preventDefault();
    try {
      await api.post('/payment-transactions', {
        clientId: client.id,
        referenceMonthIso: CURRENT_MONTH_ISO,
        amount: Number(paymentForm.amount),
        paymentDate: paymentForm.paymentDate,
        paymentMethod: paymentForm.paymentMethod,
      });
      setPayingClientId(null);
      setPaymentForm(EMPTY_PAYMENT_FORM);
      await loadAll();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDeleteTransaction(id) {
    if (!confirm('Excluir este recebimento?')) return;
    await api.delete(`/payment-transactions/${id}`);
    await loadAll();
  }

  async function handleCreateBill(e) {
    e.preventDefault();
    try {
      await api.post('/bills', { ...billForm, amount: Number(billForm.amount), status: 'a-pagar' });
      setBillForm(EMPTY_BILL_FORM);
      setShowBillForm(false);
      await loadAll();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleMarkBillPaid(bill) {
    await api.patch(`/bills/${bill.id}/status`, { status: 'pago' });
    await loadAll();
  }

  async function handleDeleteBill(bill) {
    if (!confirm('Excluir esta conta?')) return;
    await api.delete(`/bills/${bill.id}`);
    await loadAll();
  }

  return (
    <div>
      <h2>Financeiro</h2>
      {error && <p className="error">{error}</p>}

      {summary && (
        <div className="kpi-row">
          <div className="kpi-card">
            <div>Recebido no mês</div>
            <strong>{fmtBRL(summary.totalRecebido)}</strong>
          </div>
          <div className="kpi-card">
            <div>Em aberto</div>
            <strong>{fmtBRL(summary.totalAberto)}</strong>
          </div>
          <div className="kpi-card">
            <div>Sessões</div>
            <strong>{summary.totalSessoes}</strong>
          </div>
          <div className="kpi-card">
            <div>Ticket médio</div>
            <strong>{fmtBRL(summary.ticketMedio)}</strong>
          </div>
        </div>
      )}

      <div className="fin-summary">
        <div className="card chart-card">
          <h3>Recebimentos — últimos 6 meses</h3>
          <div className="bars">
            {monthlyHistory.map((m, i) => {
              const max = Math.max(...monthlyHistory.map((x) => x.total), 1);
              const heightPct = Math.max(4, Math.round((m.total / max) * 100));
              return (
                <div key={i} className="bar-group">
                  <div className={`bar ${i === monthlyHistory.length - 1 ? 'filled' : ''}`} style={{ height: `${heightPct}%` }} title={fmtBRL(m.total)} />
                  <div className="bar-label">{m.label}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card" style={{ padding: 22 }}>
          <h3 style={{ fontSize: 15, marginBottom: 16 }}>Contas a receber pendentes do mês</h3>
          <div className="open-list">
            {Object.values(finances)
              .filter((fin) => fin.balance > 0)
              .map((fin) => {
                const client = clients.find((c) => c.id === fin.clientId);
                return (
                  <div key={fin.clientId} className="open-item">
                    <div>
                      <div className="name">{client ? client.name : 'Cliente'}</div>
                      <div className="since">{fin.status === 'parcial' ? 'Pagamento parcial' : 'Em aberto'}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="amt">{fmtBRL(fin.balance)}</div>
                      <button onClick={() => setPayingClientId(fin.clientId)}>Registrar</button>
                    </div>
                  </div>
                );
              })}
            {Object.values(finances).filter((fin) => fin.balance > 0).length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--ink-soft)', textAlign: 'center' }}>Nenhuma pendência no momento 🎉</p>
            )}
          </div>
        </div>
      </div>

      <div className="tabs">
        <button onClick={() => setTab('por-cliente')} disabled={tab === 'por-cliente'}>
          Por cliente
        </button>
        <button onClick={() => setTab('contas-pagar')} disabled={tab === 'contas-pagar'}>
          Contas a pagar
        </button>
        <button onClick={() => setTab('historico')} disabled={tab === 'historico'}>
          Histórico
        </button>
      </div>

      {tab === 'por-cliente' && (
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Sessões no mês</th>
              <th>Devido</th>
              <th>Recebido</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => {
              const fin = finances[c.id];
              return (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      key={fin ? fin.sessions : 'loading'}
                      defaultValue={fin ? fin.sessions : 0}
                      style={{ width: 60 }}
                      onBlur={(e) => handleSessionsChange(c, e.target.value)}
                    />
                  </td>
                  <td>{fin ? fmtBRL(fin.due) : '—'}</td>
                  <td>{fin ? fmtBRL(fin.received) : '—'}</td>
                  <td>{fin ? STATUS_LABEL[fin.status] : '—'}</td>
                  <td>
                    <button onClick={() => setPayingClientId(c.id)}>Registrar recebimento</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {payingClientId && (
        <form
          className="payment-form"
          onSubmit={(e) => handleRegisterPayment(e, clients.find((c) => c.id === payingClientId))}
        >
          <h4>Registrar recebimento — {clients.find((c) => c.id === payingClientId)?.name}</h4>
          <input
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Valor recebido"
            value={paymentForm.amount}
            onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
            required
          />
          <input
            type="date"
            value={paymentForm.paymentDate}
            onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
          />
          <select
            value={paymentForm.paymentMethod}
            onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
          >
            <option>PIX</option>
            <option>Dinheiro</option>
            <option>Cartão</option>
            <option>Transferência</option>
            <option>Outro</option>
          </select>
          <button type="submit">Registrar</button>
          <button type="button" onClick={() => setPayingClientId(null)}>
            Cancelar
          </button>
        </form>
      )}

      {tab === 'contas-pagar' && (
        <div>
          <button onClick={() => setShowBillForm((v) => !v)}>{showBillForm ? 'Cancelar' : 'Nova conta'}</button>
          {showBillForm && (
            <form onSubmit={handleCreateBill} className="bill-form">
              <input
                placeholder="Nome"
                value={billForm.name}
                onChange={(e) => setBillForm({ ...billForm, name: e.target.value })}
                required
              />
              <select
                value={billForm.category}
                onChange={(e) => setBillForm({ ...billForm, category: e.target.value })}
              >
                {BILL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_ICONS[cat]} {cat}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                placeholder="Valor"
                value={billForm.amount}
                onChange={(e) => setBillForm({ ...billForm, amount: e.target.value })}
                required
              />
              <input
                type="date"
                value={billForm.dueDate}
                onChange={(e) => setBillForm({ ...billForm, dueDate: e.target.value })}
              />
              <label>
                <input
                  type="checkbox"
                  checked={billForm.isFixed}
                  onChange={(e) => setBillForm({ ...billForm, isFixed: e.target.checked })}
                />
                Conta fixa (recorrente mensal)
              </label>
              <button type="submit">Salvar</button>
            </form>
          )}
          <table>
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Nome</th>
                <th>Vencimento</th>
                <th>Valor</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id}>
                  <td>{CATEGORY_ICONS[b.category] || '📦'}</td>
                  <td>{b.name}</td>
                  <td>{formatBR(b.dueDate)}</td>
                  <td>{fmtBRL(b.amount)}</td>
                  <td>{b.status}</td>
                  <td>
                    {b.status !== 'pago' && <button onClick={() => handleMarkBillPaid(b)}>Marcar pago</button>}
                    <button onClick={() => handleDeleteBill(b)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'historico' && (
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Data</th>
              <th>Forma</th>
              <th>Valor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => {
              const client = clients.find((c) => c.id === t.clientId);
              return (
                <tr key={t.id}>
                  <td>{client ? client.name : 'Cliente removido'}</td>
                  <td>{formatBR(t.paymentDate)}</td>
                  <td>{t.paymentMethod}</td>
                  <td>{fmtBRL(t.amount)}</td>
                  <td>
                    <button onClick={() => handleDeleteTransaction(t.id)}>Excluir</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
