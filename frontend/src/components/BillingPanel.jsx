import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatCpfCnpj } from '../lib/masks';

const BILLING_TYPES = [
  { key: 'PIX', label: 'PIX' },
  { key: 'BOLETO', label: 'Boleto' },
  { key: 'CREDIT_CARD', label: 'Cartão de crédito' },
];

function daysRemaining(trialEndsAt) {
  if (!trialEndsAt) return null;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export default function BillingPanel() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', cpfCnpj: '', billingType: 'PIX', phone: '', couponCode: '' });

  useEffect(() => {
    api
      .get('/billing/status')
      .then(setStatus)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubscribe(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { invoiceUrl } = await api.post('/billing/subscribe', form);
      window.location.href = invoiceUrl;
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  if (loading) return <p>Carregando…</p>;
  if (error && !status) return <p className="error">{error}</p>;
  if (!status.billingEnrolled) {
    return <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Sua conta não está sujeita a cobrança.</p>;
  }

  const remaining = daysRemaining(status.trialEndsAt);
  const isActive = status.subscriptionStatus === 'active';

  return (
    <div>
      {isActive ? (
        <p>
          Assinatura ativa · R$ {status.planPrice.toFixed(2).replace('.', ',')}/mês
        </p>
      ) : (
        <p style={{ marginBottom: 16 }}>
          {status.subscriptionStatus === 'pending'
            ? 'Assinatura criada, aguardando confirmação do pagamento.'
            : remaining !== null
              ? `Faltam ${remaining} dia${remaining === 1 ? '' : 's'} do seu teste grátis.`
              : 'Teste grátis encerrado.'}{' '}
          Assine por R$ {status.planPrice.toFixed(2).replace('.', ',')}/mês para continuar usando o Alinha.
        </p>
      )}

      {!isActive && status.subscriptionStatus !== 'pending' && (
        <form onSubmit={handleSubscribe} className="settings-form">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nome completo"
            required
          />
          <input
            value={form.cpfCnpj}
            onChange={(e) => setForm({ ...form, cpfCnpj: formatCpfCnpj(e.target.value) })}
            placeholder="CPF ou CNPJ"
            required
          />
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="Telefone (opcional)"
          />
          <label style={{ display: 'block', marginBottom: 8 }}>Forma de pagamento</label>
          <select value={form.billingType} onChange={(e) => setForm({ ...form, billingType: e.target.value })}>
            {BILLING_TYPES.map((bt) => (
              <option key={bt.key} value={bt.key}>
                {bt.label}
              </option>
            ))}
          </select>
          <input
            value={form.couponCode}
            onChange={(e) => setForm({ ...form, couponCode: e.target.value })}
            placeholder="Cupom de desconto (opcional)"
          />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Aguarde…' : 'Assinar agora'}
          </button>
        </form>
      )}
    </div>
  );
}
