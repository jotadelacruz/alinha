import { Link } from 'react-router-dom';

const WHATSAPP_CONTACT_NUMBER = '5553981407005';
const WHATSAPP_CONTACT_MESSAGE = 'Olá! Quero saber mais sobre o Alinha.';

function whatsappContactLink() {
  return `https://wa.me/${WHATSAPP_CONTACT_NUMBER}?text=${encodeURIComponent(WHATSAPP_CONTACT_MESSAGE)}`;
}

const FEATURES = [
  {
    title: 'Agenda inteligente',
    description: 'Consultas recorrentes, confirmação por WhatsApp e visão semanal em grade ou lista.',
  },
  {
    title: 'Prontuários protegidos',
    description: 'Acesso por senha e registro de auditoria — pensado para dados sensíveis de saúde.',
  },
  {
    title: 'Financeiro sem planilha',
    description: 'Cobranças, pacotes de sessões e contas do consultório em um só lugar.',
  },
  {
    title: 'Atestados e documentos',
    description: 'Modelos prontos com a logo do seu consultório, prontos para imprimir.',
  },
];

export default function LandingPage() {
  return (
    <div className="landing">
      <a className="landing-whatsapp-fab" href={whatsappContactLink()} target="_blank" rel="noopener noreferrer">
        Fale conosco
      </a>

      <header className="landing-header">
        <div className="landing-brand">
          <div className="brand-mark">A</div>
          <span>Alinha</span>
        </div>
        <Link to="/login" className="landing-login-btn">
          Entrar
        </Link>
      </header>

      <main>
        <section className="landing-hero">
          <h1>Gestão inteligente para o seu consultório</h1>
          <p>
            Agenda, prontuários, financeiro e atestados em um só sistema — feito para psicólogas e psicólogos que
            querem passar menos tempo na planilha e mais tempo com quem importa.
          </p>
          <Link to="/login" className="landing-cta-btn">
            Começar agora
          </Link>
        </section>

        <section className="landing-features">
          {FEATURES.map((f) => (
            <div key={f.title} className="landing-feature-card">
              <h3>{f.title}</h3>
              <p>{f.description}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="landing-footer">
        <span>© {new Date().getFullYear()} Alinha</span>
      </footer>
    </div>
  );
}
