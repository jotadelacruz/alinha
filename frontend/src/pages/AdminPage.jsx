import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatBR } from '../lib/dateUtils';

export default function AdminPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => {
    reload();
  }, []);

  async function reload() {
    setLoading(true);
    try {
      setAccounts(await api.get('/admin/accounts'));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleStatus(account) {
    const newStatus = account.accountStatus === 'active' ? 'suspended' : 'active';
    const label = newStatus === 'suspended' ? 'suspender' : 'reativar';
    if (!confirm(`Tem certeza que quer ${label} a conta de ${account.name}?`)) return;

    setUpdatingId(account.id);
    try {
      await api.patch(`/admin/accounts/${account.id}/status`, { accountStatus: newStatus });
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) return <p>Carregando contas…</p>;

  return (
    <div>
      <header>
        <h2>Admin — Contratantes</h2>
      </header>
      {error && <p className="error">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>E-mail</th>
            <th>Cargo</th>
            <th>Desde</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.id}>
              <td>
                {a.name}
                {a.isAdmin && <span className="admin-badge">Admin</span>}
              </td>
              <td>{a.email}</td>
              <td>{a.role}</td>
              <td>{formatBR(a.createdAt.slice(0, 10))}</td>
              <td>
                <span className={`account-status-pill ${a.accountStatus}`}>
                  {a.accountStatus === 'active' ? 'Ativa' : 'Suspensa'}
                </span>
              </td>
              <td>
                {!a.isAdmin && (
                  <button onClick={() => toggleStatus(a)} disabled={updatingId === a.id}>
                    {a.accountStatus === 'active' ? 'Suspender' : 'Reativar'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
