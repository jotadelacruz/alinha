import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { isoDate } from '../lib/dateUtils';

const DEFAULT_CONTENT =
  'Atesto, para os devidos fins, que {cliente} esteve sob meus cuidados profissionais, necessitando de afastamento de suas atividades pelo período que se fizer necessário.';

function CertificateEditor({ certificate, clients, onBack, onSaved }) {
  const isEdit = !!certificate;
  const [clientId, setClientId] = useState(certificate?.clientId || '');
  const [issueDate, setIssueDate] = useState(certificate?.issueDate || isoDate(new Date()));
  const [content, setContent] = useState(certificate?.content || DEFAULT_CONTENT);
  const [error, setError] = useState('');

  async function handleSave() {
    const client = clientId ? clients.find((c) => c.id === clientId) : null;
    const payload = {
      clientId: clientId || null,
      clientNameSnapshot: client ? client.name : null,
      issueDate,
      content,
    };
    try {
      if (isEdit) {
        await api.put(`/certificates/${certificate.id}`, payload);
      } else {
        await api.post('/certificates', payload);
      }
      onSaved();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete() {
    if (!confirm('Excluir este atestado?')) return;
    await api.delete(`/certificates/${certificate.id}`);
    onSaved();
  }

  return (
    <div>
      <button onClick={onBack}>← Voltar</button>
      <h3>{isEdit ? 'Editar atestado' : 'Novo atestado'}</h3>
      {error && <p className="error">{error}</p>}

      <div className="certificate-meta-fields">
        <label>
          Cliente (opcional)
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— Sem cliente vinculado —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Data de emissão
          <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </label>
      </div>

      <textarea
        className="certificate-textarea"
        rows={10}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Digite o texto do atestado..."
      />

      <div>
        <button onClick={() => window.print()}>Imprimir</button>
        <button onClick={handleSave}>Salvar</button>
        {isEdit && <button onClick={handleDelete}>Excluir</button>}
      </div>
    </div>
  );
}

export default function AtestadosPage() {
  const [certificates, setCertificates] = useState([]);
  const [clients, setClients] = useState([]);
  const [editing, setEditing] = useState(undefined); // undefined = list view, null = new, object = edit
  const [error, setError] = useState('');

  useEffect(() => {
    reload();
  }, []);

  async function reload() {
    try {
      const [certList, clientList] = await Promise.all([api.get('/certificates'), api.get('/clients')]);
      setCertificates(certList);
      setClients(clientList);
    } catch (e) {
      setError(e.message);
    }
  }

  if (editing !== undefined) {
    return (
      <CertificateEditor
        certificate={editing}
        clients={clients}
        onBack={() => setEditing(undefined)}
        onSaved={() => {
          setEditing(undefined);
          reload();
        }}
      />
    );
  }

  const sorted = [...certificates].sort((a, b) => b.issueDate.localeCompare(a.issueDate));

  return (
    <div>
      <header>
        <h2>Atestados</h2>
        <button onClick={() => setEditing(null)}>Novo atestado</button>
      </header>
      {error && <p className="error">{error}</p>}

      {sorted.length === 0 && <p>Nenhum atestado emitido ainda.</p>}
      <div className="client-grid">
        {sorted.map((cert) => (
          <div key={cert.id} className="client-card" onClick={() => setEditing(cert)}>
            <div className="client-name">{cert.clientNameSnapshot || 'Sem cliente vinculado'}</div>
            <div>Emitido em {cert.issueDate}</div>
            <div>{(cert.content || '').slice(0, 90)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
