import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { WEEK_DAYS } from '../lib/dateUtils';
import { applyTheme } from '../lib/theme';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const TABS = [
  { key: 'perfil', label: 'Perfil' },
  { key: 'aparencia', label: 'Aparência' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'notificacoes', label: 'Notificações' },
  { key: 'consultorio', label: 'Consultório' },
  { key: 'mensagens', label: 'Modelos de mensagem' },
  { key: 'seguranca', label: 'Segurança' },
  { key: 'dados', label: 'Dados' },
];

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Selecione um arquivo de imagem'));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      reject(new Error('Escolha uma imagem de até 2MB'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target.result);
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo'));
    reader.readAsDataURL(file);
  });
}

export default function ConfiguracoesPage() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState('perfil');
  const photoInputRef = useRef(null);
  const logoInputRef = useRef(null);

  useEffect(() => {
    api
      .get('/profile')
      .then((p) => {
        setProfile(p);
        setForm({
          name: p.name,
          role: p.role,
          initials: p.initials,
          photoDataUrl: p.photoDataUrl,
          theme: p.settings.theme,
          workStart: p.settings.agenda.workStart,
          workEnd: p.settings.agenda.workEnd,
          sessionDuration: p.settings.agenda.sessionDuration,
          workDays: p.settings.agenda.workDays,
          notifSession: p.settings.notifications.session,
          notifPayment: p.settings.notifications.payment,
          notifBills: p.settings.notifications.bills,
          notifWeekly: p.settings.notifications.weekly,
          officeAddress: p.settings.office.address,
          defaultSessionValue: p.settings.office.defaultValue,
          pixKey: p.settings.office.pix,
          messageTemplateCharge: p.settings.messageTemplates.charge,
          messageTemplateConfirmation: p.settings.messageTemplates.confirmation,
          messageTemplatePackage: p.settings.messageTemplates.package,
          packageAlertThreshold: p.settings.packageAlertThreshold,
          certificateLogoUrl: p.settings.certificateLogoUrl,
        });
      })
      .catch((e) => setError(e.message));
  }, []);

  function toggleWorkDay(day) {
    setForm((f) => ({
      ...f,
      workDays: f.workDays.includes(day) ? f.workDays.filter((d) => d !== day) : [...f.workDays, day],
    }));
  }

  async function handlePhotoChange(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await readImageAsDataUrl(file);
      setForm((f) => ({ ...f, photoDataUrl: dataUrl }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleLogoChange(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await readImageAsDataUrl(file);
      setForm((f) => ({ ...f, certificateLogoUrl: dataUrl }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    try {
      await api.patch('/profile', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDeleteAllData() {
    if (!confirm('Isso apaga TODOS os seus dados (clientes, agenda, financeiro, prontuários). Irreversível. Continuar?'))
      return;
    if (!confirm('Tem certeza mesmo? Não é possível desfazer.')) return;
    await api.delete('/data/all');
    alert('Dados apagados.');
    window.location.reload();
  }

  if (!form) return <p>Carregando configurações…</p>;

  return (
    <div>
      <h2>Configurações</h2>
      {error && <p className="error">{error}</p>}
      {saved && <p className="success">Salvo</p>}

      <div className="settings-layout">
        <nav className="settings-nav">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`settings-nav-item ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          <form onSubmit={handleSave} className="settings-form">
            {tab === 'perfil' && (
              <section>
                <h3>Perfil</h3>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome" />
                <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Cargo" />
                <input
                  value={form.initials}
                  maxLength={2}
                  onChange={(e) => setForm({ ...form, initials: e.target.value.toUpperCase() })}
                  placeholder="Iniciais"
                />

                <div className="settings-photo-row">
                  <div className="settings-avatar-preview">
                    {form.photoDataUrl ? <img src={form.photoDataUrl} alt="Foto de perfil" /> : form.initials}
                  </div>
                  <div className="settings-photo-actions">
                    <input type="file" accept="image/*" ref={photoInputRef} style={{ display: 'none' }} onChange={handlePhotoChange} />
                    <button type="button" onClick={() => photoInputRef.current.click()}>
                      Enviar foto
                    </button>
                    {form.photoDataUrl && (
                      <button type="button" onClick={() => setForm({ ...form, photoDataUrl: null })}>
                        Remover foto
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 8 }}>Logo do atestado</label>
                  <div className="settings-photo-row">
                    <div className="certificate-logo-preview">
                      {form.certificateLogoUrl ? (
                        <img src={form.certificateLogoUrl} alt="Logo do atestado" />
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Sem logo</span>
                      )}
                    </div>
                    <div className="settings-photo-actions">
                      <input type="file" accept="image/*" ref={logoInputRef} style={{ display: 'none' }} onChange={handleLogoChange} />
                      <button type="button" onClick={() => logoInputRef.current.click()}>
                        Enviar logo
                      </button>
                      {form.certificateLogoUrl && (
                        <button type="button" onClick={() => setForm({ ...form, certificateLogoUrl: null })}>
                          Remover logo
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {tab === 'aparencia' && (
              <section>
                <h3>Aparência</h3>
                <select
                  value={form.theme}
                  onChange={(e) => {
                    setForm({ ...form, theme: e.target.value });
                    applyTheme(e.target.value);
                  }}
                >
                  <option value="light">Claro</option>
                  <option value="dark">Escuro</option>
                  <option value="system">Sistema</option>
                </select>
              </section>
            )}

            {tab === 'agenda' && (
              <section>
                <h3>Agenda</h3>
                <label>
                  Início do expediente
                  <input
                    type="time"
                    value={form.workStart}
                    onChange={(e) => setForm({ ...form, workStart: e.target.value })}
                  />
                </label>
                <label>
                  Fim do expediente
                  <input type="time" value={form.workEnd} onChange={(e) => setForm({ ...form, workEnd: e.target.value })} />
                </label>
                <label>
                  Duração da sessão (min)
                  <input
                    type="number"
                    value={form.sessionDuration}
                    onChange={(e) => setForm({ ...form, sessionDuration: Number(e.target.value) })}
                  />
                </label>
                <p style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                  Esse valor também define quando a tela de Controle de horário mostra o aviso dos últimos 5 minutos.
                </p>
                <div>
                  Dias de atendimento:
                  {WEEK_DAYS.map((day) => (
                    <label key={day}>
                      <input type="checkbox" checked={form.workDays.includes(day)} onChange={() => toggleWorkDay(day)} />
                      {day}
                    </label>
                  ))}
                </div>
              </section>
            )}

            {tab === 'notificacoes' && (
              <section>
                <h3>Notificações</h3>
                <label>
                  <input
                    type="checkbox"
                    checked={form.notifSession}
                    onChange={(e) => setForm({ ...form, notifSession: e.target.checked })}
                  />
                  Lembretes de sessão
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.notifPayment}
                    onChange={(e) => setForm({ ...form, notifPayment: e.target.checked })}
                  />
                  Pagamentos pendentes
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.notifBills}
                    onChange={(e) => setForm({ ...form, notifBills: e.target.checked })}
                  />
                  Contas a pagar
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.notifWeekly}
                    onChange={(e) => setForm({ ...form, notifWeekly: e.target.checked })}
                  />
                  Resumo semanal
                </label>
              </section>
            )}

            {tab === 'consultorio' && (
              <section>
                <h3>Consultório</h3>
                <input
                  value={form.officeAddress}
                  onChange={(e) => setForm({ ...form, officeAddress: e.target.value })}
                  placeholder="Endereço"
                />
                <input
                  type="number"
                  value={form.defaultSessionValue}
                  onChange={(e) => setForm({ ...form, defaultSessionValue: Number(e.target.value) })}
                  placeholder="Valor padrão da sessão"
                />
                <input value={form.pixKey} onChange={(e) => setForm({ ...form, pixKey: e.target.value })} placeholder="Chave PIX" />
                <label>
                  Alertar quando faltarem X sessões no pacote
                  <input
                    type="number"
                    value={form.packageAlertThreshold}
                    onChange={(e) => setForm({ ...form, packageAlertThreshold: Number(e.target.value) })}
                  />
                </label>
              </section>
            )}

            {tab === 'mensagens' && (
              <section>
                <h3>Modelos de mensagem</h3>
                <textarea
                  placeholder="Mensagem de cobrança"
                  value={form.messageTemplateCharge}
                  onChange={(e) => setForm({ ...form, messageTemplateCharge: e.target.value })}
                />
                <textarea
                  placeholder="Mensagem de confirmação"
                  value={form.messageTemplateConfirmation}
                  onChange={(e) => setForm({ ...form, messageTemplateConfirmation: e.target.value })}
                />
                <textarea
                  placeholder="Mensagem de pacote"
                  value={form.messageTemplatePackage}
                  onChange={(e) => setForm({ ...form, messageTemplatePackage: e.target.value })}
                />
              </section>
            )}

            {tab !== 'seguranca' && tab !== 'dados' && <button type="submit">Salvar configurações</button>}
          </form>

          {tab === 'seguranca' && (
            <section>
              <h3>Segurança</h3>
              <p>
                Senha de acesso aos prontuários:{' '}
                {profile?.settings.hasProntuarioPassword ? 'definida' : 'ainda não definida'}. Para criar ou trocar, acesse
                a tela de Prontuários.
              </p>
            </section>
          )}

          {tab === 'dados' && (
            <section className="danger-zone">
              <h3>Zona de risco</h3>
              <button onClick={handleDeleteAllData}>Apagar todos os meus dados</button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
