// ============================================================
// ALINHA — Conexão com o Supabase
// ============================================================
// Este arquivo inicializa o cliente Supabase usado por todo o
// app. As credenciais abaixo (URL e chave pública) são seguras
// para ficar expostas no frontend — a proteção real dos dados
// vem das políticas de Row Level Security configuradas no banco
// (ver schema.sql), não dessas chaves.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://tjaemcduijgurnbysdas.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5J10QBFpBiEx2v9FZ5Z-xQ_HpYLzAVj';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
