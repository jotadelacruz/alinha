import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { ALL_WEEK_DAYS } from '../lib/dateUtils';
import { applyColorTheme, applyTheme } from '../lib/theme';

const COLOR_THEMES = [
  { key: 'verde', label: 'Verde-Musgo', swatch: '#1e4b43' },
  { key: 'azul', label: 'Azul', swatch: '#2b4c7e' },
];

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const TABS = [
  { key: 'perfil', label: 'Perfil' },
  { key: 'aparencia', label: 'Aparência' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'notificacoes', label: 'Notificações' },
  { key: 'consultorio', label: 'Consultório' },
  { key: 'preferencias', label: 'Preferências' },
  { key: 'mensagens', label: 'Modelos de mensagem' },
  { key: 'lgpd', label: 'LGPD e Termos' },
  { key: 'dados', label: 'Dados' },
];

const MESSAGE_EXAMPLES = {
  charge:
    'Olá {nome}! Passando para lembrar que o pagamento da sessão de {mês} ainda está em aberto ({valor}). Você pode enviar via PIX: {chave pix}. Qualquer dúvida, estou à disposição!',
  confirmation:
    'Olá {nome}! Passando para confirmar sua consulta no dia {data} às {horário}. Pode confirmar presença?',
  package:
    'Olá {nome}! Seu pacote de sessões está chegando ao fim — restam {sessões restantes} sessões. Vamos combinar a renovação?',
};

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

function AccountPasswordSection() {
  const { user, signInWithEmail, updatePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    if (newPassword.length < 6) {
      setError('Use ao menos 6 caracteres na nova senha.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    setLoading(true);
    try {
      const { error: authError } = await signInWithEmail(user.email, currentPassword);
      if (authError) {
        setError('Senha atual incorreta.');
        setLoading(false);
        return;
      }
      const { error: updateError } = await updatePassword(newPassword);
      if (updateError) throw updateError;
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="settings-password-form">
      <input
        type="password"
        placeholder="Senha atual"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Nova senha"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Confirme a nova senha"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
      />
      {error && <p className="error">{error}</p>}
      {success && <p className="success">Senha atualizada</p>}
      <button type="submit" disabled={loading}>
        {loading ? 'Salvando...' : 'Trocar senha'}
      </button>
    </form>
  );
}

function PasswordSection({ hasPassword }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    if (newPassword.length < 4) {
      setError('Use ao menos 4 caracteres na nova senha.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    setLoading(true);
    try {
      if (hasPassword) {
        const { valid } = await api.post('/profile/prontuario-password/verify', { password: currentPassword });
        if (!valid) {
          setError('Senha atual incorreta.');
          setLoading(false);
          return;
        }
      }
      await api.post('/profile/prontuario-password', { password: newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="settings-password-form">
      {hasPassword && (
        <input
          type="password"
          placeholder="Senha atual"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      )}
      <input
        type="password"
        placeholder={hasPassword ? 'Nova senha' : 'Criar senha'}
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Confirme a nova senha"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
      />
      {error && <p className="error">{error}</p>}
      {success && <p className="success">Senha atualizada</p>}
      <button type="submit" disabled={loading}>
        {loading ? 'Salvando...' : hasPassword ? 'Trocar senha' : 'Criar senha'}
      </button>
    </form>
  );
}

export default function ConfiguracoesPage() {
  const { signOut } = useAuth();
  const { profile, refreshProfile } = useProfile();
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState('perfil');
  const photoInputRef = useRef(null);
  const logoInputRef = useRef(null);

  useEffect(() => {
    if (!profile) return;
    setForm({
      name: profile.name,
      role: profile.role,
      initials: profile.initials,
      photoDataUrl: profile.photoDataUrl,
      theme: profile.settings.theme,
      colorTheme: profile.settings.colorTheme,
      workStart: profile.settings.agenda.workStart,
      workEnd: profile.settings.agenda.workEnd,
      sessionDuration: profile.settings.agenda.sessionDuration,
      workDays: profile.settings.agenda.workDays,
      notifSession: profile.settings.notifications.session,
      notifPayment: profile.settings.notifications.payment,
      notifBills: profile.settings.notifications.bills,
      notifWeekly: profile.settings.notifications.weekly,
      officeAddress: profile.settings.office.address,
      officeCep: profile.settings.office.cep,
      cnpj: profile.settings.office.cnpj,
      defaultSessionValue: profile.settings.office.defaultValue,
      pixKey: profile.settings.office.pix,
      messageTemplateCharge: profile.settings.messageTemplates.charge,
      messageTemplateConfirmation: profile.settings.messageTemplates.confirmation,
      messageTemplatePackage: profile.settings.messageTemplates.package,
      packageAlertThreshold: profile.settings.packageAlertThreshold,
      certificateLogoUrl: profile.settings.certificateLogoUrl,
    });
  }, [profile]);

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
      await refreshProfile();
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ marginBottom: 0 }}>Perfil</h3>
                  <button type="button" onClick={() => signOut()}>
                    Sair
                  </button>
                </div>
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
                  <label style={{ display: 'block', marginBottom: 8 }}>Logo de Emissões</label>
                  <div className="settings-photo-row">
                    <div className="certificate-logo-preview">
                      {form.certificateLogoUrl ? (
                        <img src={form.certificateLogoUrl} alt="Logo de Emissões" />
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
                <label style={{ display: 'block', marginBottom: 8 }}>Modo</label>
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

                <label style={{ display: 'block', marginTop: 16, marginBottom: 8 }}>Cor do tema</label>
                <div className="color-theme-grid">
                  {COLOR_THEMES.map((ct) => (
                    <button
                      key={ct.key}
                      type="button"
                      className={`color-theme-chip ${form.colorTheme === ct.key ? 'active' : ''}`}
                      onClick={() => {
                        setForm({ ...form, colorTheme: ct.key });
                        applyColorTheme(ct.key);
                      }}
                    >
                      <span className="color-theme-swatch" style={{ background: ct.swatch }} />
                      {ct.label}
                    </button>
                  ))}
                </div>
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
                  <label style={{ display: 'block', marginBottom: 8 }}>Dias de atendimento</label>
                  <div className="workdays-grid">
                    {ALL_WEEK_DAYS.map((day) => {
                      const checked = form.workDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          className={`workday-chip ${checked ? 'active' : ''}`}
                          onClick={() => toggleWorkDay(day)}
                        >
                          {day.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
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
                  value={form.officeCep}
                  onChange={(e) => setForm({ ...form, officeCep: e.target.value })}
                  placeholder="CEP"
                />
                <input
                  value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                  placeholder="CNPJ"
                />
                <input
                  type="number"
                  value={form.defaultSessionValue}
                  onChange={(e) => setForm({ ...form, defaultSessionValue: Number(e.target.value) })}
                  placeholder="Valor padrão das consultas"
                />
                <input value={form.pixKey} onChange={(e) => setForm({ ...form, pixKey: e.target.value })} placeholder="Chave PIX" />
              </section>
            )}

            {tab === 'preferencias' && (
              <section>
                <h3>Preferências</h3>
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
                <label className="message-template-label">
                  Mensagem de cobrança
                  <textarea
                    placeholder={MESSAGE_EXAMPLES.charge}
                    value={form.messageTemplateCharge}
                    onChange={(e) => setForm({ ...form, messageTemplateCharge: e.target.value })}
                  />
                </label>

                <label className="message-template-label">
                  Mensagem de confirmação
                  <textarea
                    placeholder={MESSAGE_EXAMPLES.confirmation}
                    value={form.messageTemplateConfirmation}
                    onChange={(e) => setForm({ ...form, messageTemplateConfirmation: e.target.value })}
                  />
                </label>

                <label className="message-template-label">
                  Mensagem de pacote
                  <textarea
                    placeholder={MESSAGE_EXAMPLES.package}
                    value={form.messageTemplatePackage}
                    onChange={(e) => setForm({ ...form, messageTemplatePackage: e.target.value })}
                  />
                </label>
              </section>
            )}

            {tab !== 'dados' && tab !== 'lgpd' && <button type="submit">Salvar configurações</button>}
          </form>

          {tab === 'lgpd' && (
            <section>
              <h3>LGPD e Termos</h3>
              <div className="legal-doc-links">
                <a href="/termos.html" target="_blank" rel="noopener noreferrer" className="legal-doc-link">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                  </svg>
                  Termos de Uso
                </a>
                <a href="/privacidade.html" target="_blank" rel="noopener noreferrer" className="legal-doc-link">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="3" y="11" width="18" height="10" rx="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                  Política de Privacidade
                </a>
              </div>
            </section>
          )}

          {tab === 'dados' && (
            <section>
              <h3>Dados</h3>

              <div>
                <h4 style={{ fontSize: 13.5, marginBottom: 10 }}>Senha da conta</h4>
                <AccountPasswordSection />
              </div>

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginTop: 4 }}>
                <h4 style={{ fontSize: 13.5, marginBottom: 6 }}>Senha dos prontuários</h4>
                <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 14 }}>
                  Senha de acesso aos prontuários:{' '}
                  {profile?.settings.hasProntuarioPassword ? 'definida' : 'ainda não definida'}.
                </p>
                <PasswordSection hasPassword={profile?.settings.hasProntuarioPassword} />
              </div>

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginTop: 4 }}>
                <h4 style={{ fontSize: 13.5, marginBottom: 10, color: 'var(--alert)' }}>Zona de risco</h4>
                <button className="danger-pill-btn" onClick={handleDeleteAllData}>
                  Apagar todos os meus dados
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
