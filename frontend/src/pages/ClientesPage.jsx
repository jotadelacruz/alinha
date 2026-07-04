import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { downloadImportTemplate, exportClientsCSV, parseCSV, parseClientRows } from '../lib/csv';

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
  const [showImport, setShowImport] = useState(false);
  const [importResult, setImportResult] = useState(null); // { valid, skipped, headerError }
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

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

  function handleFileSelected(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Selecione um arquivo .csv');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCSV(String(ev.target.result));
      setImportResult(parseClientRows(rows));
    };
    reader.readAsText(file, 'UTF-8');
  }

  async function handleConfirmImport() {
    if (!importResult || importResult.valid.length === 0) return;
    setImporting(true);
    let successCount = 0;
    let errorCount = 0;
    for (const clientData of importResult.valid) {
      try {
        await api.post('/clients', clientData);
        successCount++;
      } catch {
        errorCount++;
      }
    }
    setImporting(false);
    setShowImport(false);
    setImportResult(null);
    await reload();
    setError(errorCount > 0 ? `${successCount} importados, ${errorCount} com erro` : '');
  }

  if (loading) return <p>Carregando clientes…</p>;

  return (
    <div>
      <header>
        <h2>Clientes</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowImport((v) => !v)}>{showImport ? 'Cancelar importação' : 'Importar planilha'}</button>
          <button onClick={() => exportClientsCSV(clients)}>Exportar planilha</button>
          <button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancelar' : 'Novo cliente'}</button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {showImport && (
        <div className="card" style={{ padding: 20, marginBottom: 16, maxWidth: 560 }}>
          <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginBottom: 14 }}>
            Use o modelo de planilha para garantir que as colunas fiquem certas, preencha com seus clientes e envie o
            arquivo abaixo.
          </p>
          <button onClick={downloadImportTemplate} style={{ marginBottom: 14 }}>
            Baixar modelo de planilha
          </button>
          <input type="file" accept=".csv" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelected} />
          <div
            onClick={() => fileInputRef.current.click()}
            style={{
              border: '2px dashed var(--line)',
              borderRadius: 12,
              padding: 28,
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>Clique para escolher o arquivo .csv</div>
          </div>

          {importResult && (
            <div style={{ marginTop: 16 }}>
              {importResult.headerError ? (
                <p className="error">
                  Não encontramos a coluna "Nome" na planilha. Confira se está usando o modelo correto.
                </p>
              ) : (
                <>
                  <p style={{ fontSize: 13, marginBottom: 8 }}>
                    <strong style={{ color: 'var(--sage)' }}>{importResult.valid.length}</strong>{' '}
                    {importResult.valid.length === 1 ? 'cliente pronto' : 'clientes prontos'} para importar
                    {importResult.skipped.length > 0 && (
                      <>
                        {' · '}
                        <strong style={{ color: 'var(--alert)' }}>{importResult.skipped.length}</strong>{' '}
                        {importResult.skipped.length === 1 ? 'linha foi pulada' : 'linhas foram puladas'}
                      </>
                    )}
                  </p>
                  {importResult.valid.length > 0 && (
                    <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10 }}>
                      {importResult.valid.slice(0, 50).map((c, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            borderBottom: '1px solid var(--paper-soft)',
                            fontSize: 13,
                          }}
                        >
                          <span>{c.name}</span>
                          <span style={{ color: 'var(--ink-soft)' }}>{c.phone || '—'}</span>
                        </div>
                      ))}
                      {importResult.valid.length > 50 && (
                        <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--ink-soft)' }}>
                          + {importResult.valid.length - 50} outros...
                        </div>
                      )}
                    </div>
                  )}
                  {importResult.skipped.length > 0 && (
                    <div style={{ marginTop: 10, fontSize: 12, color: 'var(--alert)' }}>
                      {importResult.skipped.slice(0, 10).map((s, i) => (
                        <div key={i}>
                          Linha {s.line}: {s.reason}
                        </div>
                      ))}
                    </div>
                  )}
                  {importResult.valid.length > 0 && (
                    <button onClick={handleConfirmImport} disabled={importing} style={{ marginTop: 14 }}>
                      {importing ? 'Importando...' : 'Confirmar importação'}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

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
