import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/app', label: 'Resumo', end: true },
  { to: '/app/agenda', label: 'Agenda' },
  { to: '/app/clientes', label: 'Clientes' },
  { to: '/app/financeiro', label: 'Financeiro' },
  { to: '/app/prontuarios', label: 'Prontuários' },
  { to: '/app/atestados', label: 'Atestados' },
  { to: '/app/configuracoes', label: 'Configurações' },
];

export default function AppShell() {
  const { signOut } = useAuth();

  return (
    <div className="app-shell">
      <nav className="app-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end}>
            {item.label}
          </NavLink>
        ))}
        <button onClick={() => signOut()}>Sair</button>
      </nav>
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
