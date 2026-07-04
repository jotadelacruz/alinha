import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { colorFor, initials } from '../lib/avatar';
import { useProfile } from '../context/ProfileContext';
import { formatBR, isoDate } from '../lib/dateUtils';

const EMPTY_RECORD_FORM = {
  date: isoDate(new Date()),
  complaint: '',
  interventions: '',
  observations: '',
  plan: '',
  freeNotes: '',
};

function PasswordGate({ hasPassword, targetLabel, onUnlock, onCancel }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!password) {
      setError('Digite uma senha.');
      return;
    }
    setLoading(true);
    try {
      if (!hasPassword) {
        if (password.length < 4) {
          setError('Use ao menos 4 caracteres.');
          setLoading(false);
          return;
        }
        if (password !== confirm) {
          setError('As senhas não coincidem.');
          setLoading(false);
          return;
        }
        await api.post('/profile/prontuario-password', { password });
        onUnlock();
      } else {
        const { valid } = await api.post('/profile/prontuario-password/verify', { password });
        if (!valid) {
          setError('Senha incorreta. Tente novamente.');
          setLoading(false);
          return;
        }
        onUnlock();
      }
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  return (
    <div className="password-gate">
      <h2>{hasPassword ? 'Acesso protegido' : 'Criar senha de acesso'}</h2>
      <p>
        {hasPassword
          ? `Digite a senha para abrir ${targetLabel}.`
          : `Esta é a primeira vez que você acessa os Prontuários. Defina uma senha para proteger ${targetLabel}.`}
      </p>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          placeholder={hasPassword ? 'Digite a senha' : 'Crie sua senha'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {!hasPassword && (
          <input
            type="password"
            placeholder="Confirme a senha"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        )}
        {error && <p className="password-error">{error}</p>}
        <button type="button" onClick={onCancel}>
          Voltar
        </button>
        <button type="submit" disabled={loading}>
          {hasPassword ? 'Desbloquear' : 'Criar senha e continuar'}
        </button>
      </form>
    </div>
  );
}

function ClientProntuario({ client, hasPassword, onPasswordCreated, onBack }) {
  const [unlocked, setUnlocked] = useState(false);
  const [records, setRecords] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_RECORD_FORM);
  const [error, setError] = useState('');

  useEffect(() => {
    if (unlocked) reload();
  }, [unlocked]);

  async function reload() {
    try {
      setRecords(await api.get('/session-records', { client_id: client.id }));
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      await api.post('/session-records', { ...form, clientId: client.id });
      setForm(EMPTY_RECORD_FORM);
      setShowForm(false);
      await reload();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Excluir este registro de sessão?')) return;
    await api.delete(`/session-records/${id}`);
    await reload();
  }

  if (!unlocked) {
    return (
      <PasswordGate
        hasPassword={hasPassword}
        targetLabel={`o prontuário de ${client.name.split(' ')[0]}`}
        onUnlock={() => {
          if (!hasPassword) onPasswordCreated();
          setUnlocked(true);
        }}
        onCancel={onBack}
      />
    );
  }

  return (
    <div>
      <button onClick={onBack}>← Voltar</button>
      <h3>{client.name}</h3>
      <button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancelar' : 'Nova sessão'}</button>
      {error && <p className="error">{error}</p>}

      {showForm && (
        <form onSubmit={handleCreate} className="record-form">
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <textarea
            placeholder="Queixa"
            value={form.complaint}
            onChange={(e) => setForm({ ...form, complaint: e.target.value })}
          />
          <textarea
            placeholder="Intervenções"
            value={form.interventions}
            onChange={(e) => setForm({ ...form, interventions: e.target.value })}
          />
          <textarea
            placeholder="Observações"
            value={form.observations}
            onChange={(e) => setForm({ ...form, observations: e.target.value })}
          />
          <textarea placeholder="Plano" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} />
          <textarea
            placeholder="Notas livres"
            value={form.freeNotes}
            onChange={(e) => setForm({ ...form, freeNotes: e.target.value })}
          />
          <button type="submit">Salvar</button>
        </form>
      )}

      <div className="record-list">
        {records.length === 0 && <p>Nenhum registro de sessão ainda.</p>}
        {records.map((r) => (
          <div key={r.id} className="record-card">
            <strong>{formatBR(r.date)}</strong>
            {r.complaint && <p>Queixa: {r.complaint}</p>}
            {r.interventions && <p>Intervenções: {r.interventions}</p>}
            {r.observations && <p>Observações: {r.observations}</p>}
            {r.plan && <p>Plano: {r.plan}</p>}
            {r.freeNotes && <p>Notas: {r.freeNotes}</p>}
            <button onClick={() => handleDelete(r.id)}>Excluir</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProntuariosPage() {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [error, setError] = useState('');
  const { profile, refreshProfile } = useProfile();

  useEffect(() => {
    reload();
  }, []);

  async function reload() {
    try {
      setClients(await api.get('/clients'));
    } catch (e) {
      setError(e.message);
    }
  }

  if (selectedClient && profile) {
    return (
      <ClientProntuario
        client={selectedClient}
        hasPassword={profile.settings.hasProntuarioPassword}
        onPasswordCreated={refreshProfile}
        onBack={() => setSelectedClient(null)}
      />
    );
  }

  const filtered = clients.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <h2>Prontuários</h2>
      {error && <p className="error">{error}</p>}
      <input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="client-grid">
        {filtered.map((c) => (
          <div key={c.id} className="client-card" onClick={() => setSelectedClient(c)}>
            <div className="client-top">
              <div className="client-avatar" style={{ background: colorFor(c.name) }}>
                {initials(c.name)}
              </div>
              <div>
                <div className="client-name">
                  <span style={{ marginRight: 6 }} aria-hidden="true">
                    📋
                  </span>
                  {c.name}
                </div>
                <div className="client-since">Cliente desde {formatBR(c.since)}</div>
              </div>
            </div>
            <div className="client-footer">
              <span className={`client-status ${c.status}`}>{c.status === 'ativo' ? 'Ativo' : 'Em pausa'}</span>
              <span className="next-session">Ver prontuário →</span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p>Nenhum cliente encontrado.</p>}
      </div>
    </div>
  );
}
