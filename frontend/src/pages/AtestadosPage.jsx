import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useProfile } from '../context/ProfileContext';
import { formatBR, isoDate } from '../lib/dateUtils';

const DEFAULT_CONTENT_TEMPLATE =
  'Atesto, para os devidos fins, que {cliente} esteve sob meus cuidados profissionais em {data}, necessitando de afastamento de suas atividades pelo período que se fizer necessário.';

function buildDefaultContent(issueDate) {
  return DEFAULT_CONTENT_TEMPLATE.replace('{data}', formatBR(issueDate));
}

function fmtBRL(v) {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const DEFAULT_RECEIPT_TEMPLATE =
  'Recibo referente ao atendimento de {cliente}, realizado em {data}, no valor de {valor}.';

function buildDefaultReceiptContent(issueDate, amount) {
  return DEFAULT_RECEIPT_TEMPLATE.replace('{data}', formatBR(issueDate)).replace('{valor}', fmtBRL(amount));
}

function CertificateEditor({ certificate, clients, profile, onBack, onSaved }) {
  const isEdit = !!certificate;
  const [clientId, setClientId] = useState(certificate?.clientId || '');
  const [issueDate, setIssueDate] = useState(certificate?.issueDate || isoDate(new Date()));
  const [content, setContent] = useState(certificate?.content || buildDefaultContent(certificate?.issueDate || isoDate(new Date())));
  const [error, setError] = useState('');

  function handleClientChange(newClientId) {
    const previousName = clients.find((c) => c.id === clientId)?.name || '{cliente}';
    const newName = clients.find((c) => c.id === newClientId)?.name || '{cliente}';
    if (content.includes(previousName)) {
      setContent(content.split(previousName).join(newName));
    }
    setClientId(newClientId);
  }

  function handleDateChange(newIssueDate) {
    const previousFormatted = formatBR(issueDate);
    const newFormatted = formatBR(newIssueDate);
    if (content.includes(previousFormatted)) {
      setContent(content.split(previousFormatted).join(newFormatted));
    }
    setIssueDate(newIssueDate);
  }

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
      <header>
        <button onClick={onBack}>← Voltar</button>
        <h3 style={{ flex: 1 }}>{isEdit ? 'Editar atestado' : 'Novo atestado'}</h3>
      </header>
      {error && <p className="error">{error}</p>}

      <div className="certificate-meta-fields no-print">
        <label>
          Cliente (opcional)
          <select value={clientId} onChange={(e) => handleClientChange(e.target.value)}>
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
          <input type="date" value={issueDate} onChange={(e) => handleDateChange(e.target.value)} />
        </label>
      </div>

      <div id="printable-certificate">
        <div className="certificate-paper">
          {profile?.settings?.certificateLogoUrl && (
            <div className="certificate-logo-area">
              <img src={profile.settings.certificateLogoUrl} alt="Logo" />
            </div>
          )}
          <div className="certificate-issuer">
            {profile?.name}
            {profile?.role ? ` · ${profile.role}` : ''}
          </div>
          <textarea
            className="certificate-textarea no-print"
            rows={10}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Digite o texto do atestado..."
          />
          <div className="certificate-textarea print-only">{content}</div>
        </div>
      </div>

      <div className="no-print">
        <button onClick={() => window.print()}>Imprimir</button>
        <button onClick={handleSave}>Salvar</button>
        {isEdit && <button onClick={handleDelete}>Excluir</button>}
      </div>
    </div>
  );
}

function ReceiptEditor({ receipt, clients, profile, onBack, onSaved }) {
  const isEdit = !!receipt;
  const [clientId, setClientId] = useState(receipt?.clientId || '');
  const [issueDate, setIssueDate] = useState(receipt?.issueDate || isoDate(new Date()));
  const [amount, setAmount] = useState(receipt?.amount ?? '');
  const [content, setContent] = useState(
    receipt?.content || buildDefaultReceiptContent(receipt?.issueDate || isoDate(new Date()), receipt?.amount)
  );
  const [error, setError] = useState('');

  function handleClientChange(newClientId) {
    const previousName = clients.find((c) => c.id === clientId)?.name || '{cliente}';
    const newName = clients.find((c) => c.id === newClientId)?.name || '{cliente}';
    if (content.includes(previousName)) {
      setContent(content.split(previousName).join(newName));
    }
    setClientId(newClientId);
  }

  function handleDateChange(newIssueDate) {
    const previousFormatted = formatBR(issueDate);
    const newFormatted = formatBR(newIssueDate);
    if (content.includes(previousFormatted)) {
      setContent(content.split(previousFormatted).join(newFormatted));
    }
    setIssueDate(newIssueDate);
  }

  function handleAmountChange(newAmount) {
    const previousFormatted = fmtBRL(amount === '' ? 0 : Number(amount));
    const newFormatted = fmtBRL(newAmount === '' ? 0 : Number(newAmount));
    if (content.includes(previousFormatted)) {
      setContent(content.split(previousFormatted).join(newFormatted));
    }
    setAmount(newAmount);
  }

  async function handleSave() {
    const client = clientId ? clients.find((c) => c.id === clientId) : null;
    const payload = {
      clientId: clientId || null,
      clientNameSnapshot: client ? client.name : null,
      issueDate,
      amount: amount === '' ? null : Number(amount),
      content,
    };
    try {
      if (isEdit) {
        await api.put(`/receipts/${receipt.id}`, payload);
      } else {
        await api.post('/receipts', payload);
      }
      onSaved();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete() {
    if (!confirm('Excluir este recibo?')) return;
    await api.delete(`/receipts/${receipt.id}`);
    onSaved();
  }

  return (
    <div>
      <header>
        <button onClick={onBack}>← Voltar</button>
        <h3 style={{ flex: 1 }}>{isEdit ? 'Editar recibo' : 'Novo recibo de pagamento'}</h3>
      </header>
      {error && <p className="error">{error}</p>}

      <div className="certificate-meta-fields no-print">
        <label>
          Cliente (opcional)
          <select value={clientId} onChange={(e) => handleClientChange(e.target.value)}>
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
          <input type="date" value={issueDate} onChange={(e) => handleDateChange(e.target.value)} />
        </label>
        <label>
          Valor recebido
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            placeholder="0,00"
          />
        </label>
      </div>

      <div id="printable-certificate">
        <div className="certificate-paper">
          {profile?.settings?.certificateLogoUrl && (
            <div className="certificate-logo-area">
              <img src={profile.settings.certificateLogoUrl} alt="Logo" />
            </div>
          )}
          <div className="certificate-issuer">
            {profile?.name}
            {profile?.role ? ` · ${profile.role}` : ''}
          </div>
          <textarea
            className="certificate-textarea no-print"
            rows={10}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Digite o texto do recibo..."
          />
          <div className="certificate-textarea print-only">{content}</div>
        </div>
      </div>

      <div className="no-print">
        <button onClick={() => window.print()}>Imprimir</button>
        <button onClick={handleSave}>Salvar</button>
        {isEdit && <button onClick={handleDelete}>Excluir</button>}
      </div>
    </div>
  );
}

export default function AtestadosPage() {
  const { profile } = useProfile();
  const [certificates, setCertificates] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [clients, setClients] = useState([]);
  const [editingCertificate, setEditingCertificate] = useState(undefined); // undefined = list view, null = new, object = edit
  const [editingReceipt, setEditingReceipt] = useState(undefined);
  const [error, setError] = useState('');

  useEffect(() => {
    reload();
  }, []);

  async function reload() {
    try {
      const [certList, receiptList, clientList] = await Promise.all([
        api.get('/certificates'),
        api.get('/receipts'),
        api.get('/clients'),
      ]);
      setCertificates(certList);
      setReceipts(receiptList);
      setClients(clientList);
    } catch (e) {
      setError(e.message);
    }
  }

  if (editingCertificate !== undefined) {
    return (
      <CertificateEditor
        certificate={editingCertificate}
        clients={clients}
        profile={profile}
        onBack={() => setEditingCertificate(undefined)}
        onSaved={() => {
          setEditingCertificate(undefined);
          reload();
        }}
      />
    );
  }

  if (editingReceipt !== undefined) {
    return (
      <ReceiptEditor
        receipt={editingReceipt}
        clients={clients}
        profile={profile}
        onBack={() => setEditingReceipt(undefined)}
        onSaved={() => {
          setEditingReceipt(undefined);
          reload();
        }}
      />
    );
  }

  const sortedCertificates = [...certificates].sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  const sortedReceipts = [...receipts].sort((a, b) => b.issueDate.localeCompare(a.issueDate));

  return (
    <div>
      <header>
        <h2>Emissões</h2>
      </header>
      {error && <p className="error">{error}</p>}

      <section style={{ marginBottom: 36 }}>
        <header>
          <h3>Atestados</h3>
          <button onClick={() => setEditingCertificate(null)}>Novo atestado</button>
        </header>

        {sortedCertificates.length === 0 && <p>Nenhum atestado emitido ainda.</p>}
        <div className="client-grid">
          {sortedCertificates.map((cert) => (
            <div key={cert.id} className="client-card" onClick={() => setEditingCertificate(cert)}>
              <div className="client-name">{cert.clientNameSnapshot || 'Sem cliente vinculado'}</div>
              <div>Emitido em {formatBR(cert.issueDate)}</div>
              <div>{(cert.content || '').slice(0, 90)}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <header>
          <h3>Recibos de pagamento</h3>
          <button onClick={() => setEditingReceipt(null)}>Novo recibo</button>
        </header>

        {sortedReceipts.length === 0 && <p>Nenhum recibo emitido ainda.</p>}
        <div className="client-grid">
          {sortedReceipts.map((r) => (
            <div key={r.id} className="client-card" onClick={() => setEditingReceipt(r)}>
              <div className="client-name">{r.clientNameSnapshot || 'Sem cliente vinculado'}</div>
              <div>
                Emitido em {formatBR(r.issueDate)} · {fmtBRL(r.amount)}
              </div>
              <div>{(r.content || '').slice(0, 90)}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
