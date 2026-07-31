import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
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
  const { user, signInWithEmail, signInWithGoogle, resetPassword } = useAuth();
  const [forgotMode, setForgotMode] = useState(false);
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
    const { error } = await signInWithEmail(email, password);
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

  if (forgotMode) {
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
              setForgotMode(false);
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
        <p>Entrar na sua conta</p>

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
        {info && <p className="auth-info">{info}</p>}

        <button type="submit" disabled={loading}>
          Entrar
        </button>
        <button type="button" onClick={() => signInWithGoogle()}>
          Entrar com Google
        </button>
        <button
          type="button"
          className="link"
          onClick={() => {
            setForgotMode(true);
            setError('');
            setInfo('');
          }}
        >
          Esqueci minha senha
        </button>
        <Link to="/assinar" className="link" style={{ textAlign: 'center' }}>
          Ainda não tem conta? Assinar
        </Link>
      </form>
    </div>
  );
}
