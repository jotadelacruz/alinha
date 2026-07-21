import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthBrand } from '../components/AuthBrand';
import { useAuth } from '../context/AuthContext';

const AUTH_ERROR_MESSAGES = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.',
  'User already registered': 'Este e-mail já está cadastrado.',
  'Password should be at least 6 characters': 'A senha precisa ter pelo menos 6 caracteres.',
  'Unable to validate email address: invalid format': 'E-mail inválido.',
  'Email rate limit exceeded': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  'User not found': 'Não encontramos uma conta com esse e-mail.',
};

function translateAuthError(message) {
  if (!message) return 'Ocorreu um erro. Tente novamente.';
  const key = Object.keys(AUTH_ERROR_MESSAGES).find((k) => message.includes(k));
  if (key) return AUTH_ERROR_MESSAGES[key];
  if (/for security purposes/i.test(message)) {
    return 'Por segurança, aguarde alguns segundos antes de tentar novamente.';
  }
  return 'Não foi possível concluir a operação. Tente novamente.';
}

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
    if (error) setError(translateAuthError(error.message));
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    const { error } = await resetPassword(email);
    setLoading(false);
    if (error) setError(translateAuthError(error.message));
    else setInfo('Enviamos um e-mail com o link para redefinir sua senha.');
  }

  if (mode === 'forgot') {
    return (
      <div className="auth-screen">
        <form onSubmit={handleForgotPassword} className="auth-form">
          <AuthBrand />
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
        <AuthBrand />
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
