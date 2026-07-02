import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const EMPTY_FORM = {
  name: '',
  phone: '',
  email: '',
  frequency: 'Semanal',
  day: '-',
  time: '-',
  modality: 'Presencial',
  value: 210,
  status: 'ativo',
  notes: '',
};

export default function ClientesPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    reload();
  }, []);

  async function reload() {
    setLoading(true);
    try {
      setClients(await api.get('/clients'));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      await api.post('/clients', form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await reload();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Excluir este cliente?')) return;
    await api.delete(`/clients/${id}`);
    await reload();
  }

  if (loading) return <p>Carregando clientes…</p>;

  return (
    <div>
      <header>
        <h2>Clientes</h2>
        <button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancelar' : 'Novo cliente'}</button>
      </header>

      {error && <p className="error">{error}</p>}

      {showForm && (
        <form onSubmit={handleCreate} className="client-form">
          <input
            placeholder="Nome"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <input placeholder="Telefone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input
            placeholder="Valor da sessão"
            type="number"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
            required
          />
          <button type="submit">Salvar</button>
        </form>
      )}

      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Frequência</th>
            <th>Valor</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.frequency}</td>
              <td>R$ {c.value}</td>
              <td>{c.status}</td>
              <td>
                <button onClick={() => handleDelete(c.id)}>Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
