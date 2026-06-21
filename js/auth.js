// ============================================================
// ALINHA — Autenticação
// ============================================================
import { supabase } from './supabase-client.js';

/**
 * Cria uma nova conta com e-mail e senha.
 * O trigger handle_new_user (definido no schema.sql) cria
 * automaticamente o registro em "profiles" assim que o usuário
 * é criado — não é preciso fazer isso manualmente aqui.
 */
export async function signUpWithEmail(email, password, name) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name }, // disponível em raw_user_meta_data, usado pelo trigger
    },
  });
  return { data, error };
}

/** Login com e-mail e senha já cadastrados. */
export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
}

/** Login com Google — redireciona o usuário para o fluxo OAuth do Google. */
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/app.html`,
    },
  });
  return { data, error };
}

/** Envia e-mail de redefinição de senha. */
export async function resetPassword(email) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password.html`,
  });
  return { data, error };
}

/** Encerra a sessão atual. */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

/** Retorna a sessão atual (ou null se não estiver logado). */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  return { session: data?.session ?? null, error };
}

/** Retorna o usuário atual (ou null). */
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  return { user: data?.user ?? null, error };
}

/**
 * Garante que existe uma sessão ativa; caso contrário, redireciona
 * para a tela de login. Use no topo de app.html.
 */
export async function requireAuth() {
  const { session } = await getSession();
  if (!session) {
    window.location.href = '/index.html';
    return null;
  }
  return session;
}

/** Escuta mudanças de estado de autenticação (login, logout, refresh de token). */
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}
