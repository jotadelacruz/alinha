import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthBrand } from '../components/AuthBrand';
import { useAuth } from '../context/AuthContext';
import { apiPublic } from '../lib/api';
import { formatCpfCnpj } from '../lib/masks';

const BILLING_TYPES = [
  { key: 'PIX', label: 'PIX' },
  { key: 'BOLETO', label: 'Boleto' },
  { key: 'CREDIT_CARD', label: 'Cartão de crédito' },
];

const EMPTY_FORM = {
  name: '',
  email: '',
  password: '',
  cpfCnpj: '',
  billingType: 'PIX',
  phone: '',
  honeypot: '',
};

export default function AssinarPage() {
  const { signInWithEmail } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { invoiceUrl } = await apiPublic.post('/billing/signup-and-subscribe', form);
      try {
        await signInWithEmail(form.email, form.password);
      } catch {
        // best-effort: a assinatura já foi criada, não bloqueia o redirect por isso
      }
      window.location.href = invoiceUrl;
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <form onSubmit={handleSubmit} className="auth-form">
        <AuthBrand />
        <p>Assine o Alinha — R$ 98,90/mês, 14 dias grátis</p>

        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Nome completo"
          required
        />
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="E-mail"
          required
        />
        <input
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          placeholder="Senha"
          minLength={6}
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
        <label style={{ display: 'block', marginBottom: 8, fontSize: 13.5, color: 'var(--ink-soft)' }}>
          Forma de pagamento
        </label>
        <select value={form.billingType} onChange={(e) => setForm({ ...form, billingType: e.target.value })}>
          {BILLING_TYPES.map((bt) => (
            <option key={bt.key} value={bt.key}>
              {bt.label}
            </option>
          ))}
        </select>

        <input
          type="text"
          name="website"
          value={form.honeypot}
          onChange={(e) => setForm({ ...form, honeypot: e.target.value })}
          autoComplete="off"
          tabIndex={-1}
          aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }}
        />

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Aguarde…' : 'Assinar e criar conta'}
        </button>
        <Link to="/login" className="link" style={{ textAlign: 'center', fontSize: 12.5 }}>
          Já tem conta? Entrar
        </Link>
      </form>
    </div>
  );
}
