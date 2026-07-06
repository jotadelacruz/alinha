import { Link } from 'react-router-dom';
import logoVerde from '../assets/brand/logo-verde.png';
import logoOffwhite from '../assets/brand/logo-offwhite.png';

const WHATSAPP_CONTACT_NUMBER = '5553981407005';
const WHATSAPP_CONTACT_MESSAGE = 'Olá! Quero saber mais sobre o Alinha.';

function whatsappContactLink() {
  return `https://wa.me/${WHATSAPP_CONTACT_NUMBER}?text=${encodeURIComponent(WHATSAPP_CONTACT_MESSAGE)}`;
}

const FEATURES = [
  {
    title: 'Agenda inteligente',
    description: 'Consultas recorrentes, confirmação por WhatsApp e visão semanal em grade ou lista.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </svg>
    ),
  },
  {
    title: 'Prontuários protegidos',
    description: 'Acesso por senha e registro de auditoria — pensado para dados sensíveis de saúde.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3z" />
        <path d="M19 11a7 7 0 01-14 0M12 18v3" />
      </svg>
    ),
  },
  {
    title: 'Financeiro sem planilha',
    description: 'Cobranças, pacotes de sessões e contas do consultório em um só lugar.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 2v20M17 6.5c0-1.9-2.2-3-5-3s-5 1.2-5 3 2.2 2.7 5 3 5 1.1 5 3-2.2 3-5 3-5-1.1-5-3" />
      </svg>
    ),
  },
  {
    title: 'Atestados e documentos',
    description: 'Modelos prontos com a logo do seu consultório, prontos para imprimir.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6M9 15l2 2 4-4" />
      </svg>
    ),
  },
  {
    title: 'Clientes organizados',
    description: 'Cadastro completo, histórico de sessões e status sempre à mão.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" />
        <circle cx="17" cy="8" r="2.6" />
        <path d="M21 19.5c0-2.8-1.9-5-4.5-5.6" />
      </svg>
    ),
  },
  {
    title: 'Controle de horário',
    description: 'Cronômetro de sessão com aviso automático quando o tempo está acabando.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
    ),
  },
];

const STEPS = [
  {
    title: 'Crie sua conta',
    description: 'Cadastro rápido, sem cartão de crédito, pronto para usar em poucos minutos.',
  },
  {
    title: 'Organize agenda e clientes',
    description: 'Importe sua base atual ou cadastre aos poucos — a agenda e o financeiro se atualizam sozinhos.',
  },
  {
    title: 'Acompanhe com segurança',
    description: 'Prontuários protegidos por senha, atestados prontos e visão financeira clara, tudo em um lugar.',
  },
];

export default function LandingPage() {
  return (
    <div className="landing">
      <a className="landing-whatsapp-fab" href={whatsappContactLink()} target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
          <path d="M12 2a10 10 0 00-8.6 15L2 22l5.2-1.4A10 10 0 1012 2zm0 18.2a8.1 8.1 0 01-4.2-1.2l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8.9-.1.2-.3.2-.6.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.1.2-.3.2-.4.1-.2 0-.3 0-.4 0-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.4c.1.2 1.6 2.5 4 3.5.6.2 1 .4 1.3.5.6.2 1.1.2 1.5.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.2-.5-.3z" />
        </svg>
        <span>Fale conosco</span>
      </a>

      <header className="landing-header">
        <div className="landing-brand">
          <img src={logoVerde} alt="" className="landing-brand-mark" />
          <span className="landing-brand-word">
            <span className="landing-brand-eyebrow">gestão</span>
            Alinha
          </span>
        </div>
        <Link to="/login" className="landing-login-btn">
          Entrar
        </Link>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <span className="landing-badge">Feito para psicólogas e psicólogos</span>
            <h1>Gestão inteligente para o seu consultório</h1>
            <p>
              Agenda, prontuários, financeiro e atestados em um só sistema — para você passar menos tempo na
              planilha e mais tempo com quem importa.
            </p>
            <div className="landing-hero-actions">
              <Link to="/login" className="landing-cta-btn">
                Começar agora
              </Link>
              <a
                className="landing-cta-secondary"
                href={whatsappContactLink()}
                target="_blank"
                rel="noopener noreferrer"
              >
                Falar com a gente
              </a>
            </div>
          </div>
          <div className="landing-hero-visual" aria-hidden="true">
            <div className="landing-hero-visual-card">
              <div className="landing-hero-bar landing-hero-bar-1" />
              <div className="landing-hero-bar landing-hero-bar-2" />
              <div className="landing-hero-bar landing-hero-bar-3" />
            </div>
          </div>
        </section>

        <section className="landing-features">
          <h2 className="landing-section-title">Tudo que o seu consultório precisa</h2>
          <div className="landing-features-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="landing-feature-card">
                <div className="landing-feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-steps">
          <h2 className="landing-section-title">Como funciona</h2>
          <div className="landing-steps-grid">
            {STEPS.map((s, i) => (
              <div key={s.title} className="landing-step-card">
                <div className="landing-step-number">{i + 1}</div>
                <h3>{s.title}</h3>
                <p>{s.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-security">
          <div className="landing-security-content">
            <h2>Seus dados, e os dos seus clientes, protegidos de verdade</h2>
            <p>
              Prontuários com senha própria, registro de auditoria de acesso e conformidade com a LGPD — porque
              dados de saúde exigem mais cuidado do que uma planilha pode oferecer.
            </p>
          </div>
        </section>

        <section className="landing-final-cta">
          <h2>Pronta para organizar seu consultório?</h2>
          <p>Comece agora, sem custo inicial e sem complicação.</p>
          <div className="landing-hero-actions" style={{ justifyContent: 'center' }}>
            <Link to="/login" className="landing-cta-btn landing-cta-inverse">
              Começar agora
            </Link>
            <a
              className="landing-cta-secondary landing-cta-secondary-inverse"
              href={whatsappContactLink()}
              target="_blank"
              rel="noopener noreferrer"
            >
              Falar com a gente
            </a>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <img src={logoOffwhite} alt="Alinha" className="landing-footer-mark" />
        <span>© {new Date().getFullYear()} Gestão Alinha. Todos os direitos reservados.</span>
      </footer>
    </div>
  );
}
