import { Route, Routes } from 'react-router-dom'
import { RequireAuth } from './components/RequireAuth'
import { ProfileProvider } from './context/ProfileContext'
import { SessionTimerProvider } from './context/SessionTimerContext'
import AdminPage from './pages/AdminPage'
import AgendaPage from './pages/AgendaPage'
import AppShell from './pages/AppShell'
import AtestadosPage from './pages/AtestadosPage'
import ClientesPage from './pages/ClientesPage'
import ControleHorarioPage from './pages/ControleHorarioPage'
import ConfiguracoesPage from './pages/ConfiguracoesPage'
import FinanceiroPage from './pages/FinanceiroPage'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import PlaceholderPage from './pages/PlaceholderPage'
import ProntuariosPage from './pages/ProntuariosPage'
import ResumoPage from './pages/ResumoPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <ProfileProvider>
              <SessionTimerProvider>
                <AppShell />
              </SessionTimerProvider>
            </ProfileProvider>
          </RequireAuth>
        }
      >
        <Route index element={<ResumoPage />} />
        <Route path="agenda" element={<AgendaPage />} />
        <Route path="controle-horario" element={<ControleHorarioPage />} />
        <Route path="clientes" element={<ClientesPage />} />
        <Route path="financeiro" element={<FinanceiroPage />} />
        <Route path="prontuarios" element={<ProntuariosPage />} />
        <Route path="atestados" element={<AtestadosPage />} />
        <Route path="configuracoes" element={<ConfiguracoesPage />} />
        <Route path="admin" element={<AdminPage />} />
      </Route>
    </Routes>
  )
}

export default App
