import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { user, signInWithEmail, signUpWithEmail, signInWithGoogle, resetPassword } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'forgot'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/app" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    const { error } =
      mode === 'login' ? await signInWithEmail(email, password) : await signUpWithEmail(email, password, name);
    setLoading(false);
    if (error) setError(error.message);
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    const { error } = await resetPassword(email);
    setLoading(false);
    if (error) setError(error.message);
    else setInfo('Enviamos um e-mail com o link para redefinir sua senha.');
  }

  if (mode === 'forgot') {
    return (
      <div className="auth-screen">
        <form onSubmit={handleForgotPassword} className="auth-form">
          <h1>Alinha</h1>
          <p>Recuperar senha</p>

          <input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          {error && <p className="auth-error">{error}</p>}
          {info && <p className="auth-info">{info}</p>}

          <button type="submit" disabled={loading}>
            Enviar link de redefinição
          </button>
          <button
            type="button"
            className="link"
            onClick={() => {
              setMode('login');
              setError('');
              setInfo('');
            }}
          >
            Voltar para o login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <form onSubmit={handleSubmit} className="auth-form">
        <h1>Alinha</h1>
        <p>{mode === 'login' ? 'Entrar na sua conta' : 'Criar conta'}</p>

        {mode === 'signup' && (
          <input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
        )}
        <input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" disabled={loading}>
          {mode === 'login' ? 'Entrar' : 'Criar conta'}
        </button>
        <button type="button" onClick={() => signInWithGoogle()}>
          Entrar com Google
        </button>
        {mode === 'login' && (
          <button
            type="button"
            className="link"
            onClick={() => {
              setMode('forgot');
              setError('');
              setInfo('');
            }}
          >
            Esqueci minha senha
          </button>
        )}
        <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'Ainda não tem conta? Criar' : 'Já tem conta? Entrar'}
        </button>
      </form>
    </div>
  );
}
