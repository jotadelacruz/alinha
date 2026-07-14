-- Baseline reconstruída a partir do schema real de produção (via Supabase MCP,
-- pg_policies + information_schema) em 2026-07-14. As 10 tabelas originais
-- foram criadas direto em produção via dashboard, sem migration versionada
-- (ver database/schema_reference.sql) — esta baseline existe só pra dar ao
-- ambiente local (supabase start) o mesmo ponto de partida, permitindo aplicar
-- migrations novas (ex: mark_julia_as_admin) por cima com paridade real.

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'Profissional',
  photo_url text,
  initials text DEFAULT '',
  theme text NOT NULL DEFAULT 'light' CHECK (theme = ANY (ARRAY['light', 'dark', 'system'])),
  color_theme text NOT NULL DEFAULT 'azul',
  work_start time NOT NULL DEFAULT '08:00:00',
  work_end time NOT NULL DEFAULT '18:00:00',
  session_duration integer NOT NULL DEFAULT 50,
  work_days text[] NOT NULL DEFAULT ARRAY['Segunda','Terça','Quarta','Quinta','Sexta'],
  notif_session boolean NOT NULL DEFAULT true,
  notif_payment boolean NOT NULL DEFAULT true,
  notif_bills boolean NOT NULL DEFAULT true,
  notif_weekly boolean NOT NULL DEFAULT false,
  office_address text DEFAULT '',
  office_cep text,
  cnpj text,
  default_session_value numeric NOT NULL DEFAULT 210,
  pix_key text DEFAULT '',
  message_template_charge text NOT NULL DEFAULT '',
  message_template_confirmation text NOT NULL DEFAULT '',
  message_template_package text NOT NULL DEFAULT '',
  prontuario_password_hash text,
  certificate_logo_url text,
  package_alert_threshold integer NOT NULL DEFAULT 2,
  is_admin boolean NOT NULL DEFAULT false,
  account_status text NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário vê o próprio perfil" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Usuário edita o próprio perfil" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  name text NOT NULL,
  phone text DEFAULT '',
  email text DEFAULT '',
  cpf text,
  address text,
  since date NOT NULL DEFAULT CURRENT_DATE,
  frequency text NOT NULL DEFAULT 'Semanal' CHECK (frequency = ANY (ARRAY['Semanal','Quinzenal','Mensal','Pausada'])),
  fixed_day text,
  fixed_time time,
  modality text NOT NULL DEFAULT 'Presencial' CHECK (modality = ANY (ARRAY['Presencial','Online'])),
  session_value numeric NOT NULL DEFAULT 210,
  session_duration integer,
  status text NOT NULL DEFAULT 'ativo' CHECK (status = ANY (ARRAY['ativo','pausa'])),
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dono vê seus clientes" ON public.clients FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Dono cria clientes" ON public.clients FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Dono edita seus clientes" ON public.clients FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Dono apaga seus clientes" ON public.clients FOR DELETE USING (auth.uid() = owner_id);

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  appointment_date date NOT NULL,
  appointment_time time NOT NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status = ANY (ARRAY['confirmed','pending'])),
  modality text NOT NULL DEFAULT 'Presencial' CHECK (modality = ANY (ARRAY['Presencial','Online'])),
  recurrence_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dono vê suas consultas" ON public.appointments FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Dono cria consultas" ON public.appointments FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Dono edita suas consultas" ON public.appointments FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Dono apaga suas consultas" ON public.appointments FOR DELETE USING (auth.uid() = owner_id);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  reference_month date NOT NULL,
  sessions_count integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'aberto' CHECK (status = ANY (ARRAY['pago','parcial','aberto'])),
  open_since_date date,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dono vê seus pagamentos" ON public.payments FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Dono cria pagamentos" ON public.payments FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Dono edita seus pagamentos" ON public.payments FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Dono apaga seus pagamentos" ON public.payments FOR DELETE USING (auth.uid() = owner_id);

CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  reference_month date NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL DEFAULT 'PIX' CHECK (payment_method = ANY (ARRAY['PIX','Dinheiro','Cartão','Transferência','Outro'])),
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dono vê suas transações" ON public.payment_transactions FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Dono cria transações" ON public.payment_transactions FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Dono edita suas transações" ON public.payment_transactions FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Dono apaga suas transações" ON public.payment_transactions FOR DELETE USING (auth.uid() = owner_id);

CREATE TABLE public.client_credits (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  balance numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dono vê seus créditos" ON public.client_credits FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Dono cria créditos" ON public.client_credits FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Dono edita seus créditos" ON public.client_credits FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Dono apaga seus créditos" ON public.client_credits FOR DELETE USING (auth.uid() = owner_id);

CREATE TABLE public.bills (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Outros',
  amount numeric NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'a-pagar' CHECK (status = ANY (ARRAY['pago','a-pagar','atrasado'])),
  series_id text,
  is_fixed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dono vê suas contas" ON public.bills FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Dono cria contas" ON public.bills FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Dono edita suas contas" ON public.bills FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Dono apaga suas contas" ON public.bills FOR DELETE USING (auth.uid() = owner_id);

CREATE TABLE public.session_records (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  session_date date NOT NULL,
  complaint text DEFAULT '',
  interventions text DEFAULT '',
  observations text DEFAULT '',
  plan text DEFAULT '',
  free_notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.session_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dono vê seus prontuários" ON public.session_records FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Dono cria prontuários" ON public.session_records FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Dono edita seus prontuários" ON public.session_records FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Dono apaga seus prontuários" ON public.session_records FOR DELETE USING (auth.uid() = owner_id);

CREATE TABLE public.prontuario_access_log (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  action text NOT NULL,
  session_record_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.prontuario_access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select own prontuario access log" ON public.prontuario_access_log FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "insert own prontuario access log" ON public.prontuario_access_log FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "update own prontuario access log" ON public.prontuario_access_log FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "delete own prontuario access log" ON public.prontuario_access_log FOR DELETE USING (owner_id = auth.uid());

CREATE TABLE public.packages (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  name text NOT NULL DEFAULT 'Pacote de sessões',
  total_sessions integer NOT NULL CHECK (total_sessions > 0),
  used_sessions integer NOT NULL DEFAULT 0 CHECK (used_sessions >= 0),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  value numeric,
  status text NOT NULL DEFAULT 'ativo' CHECK (status = ANY (ARRAY['ativo','encerrado','cancelado'])),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dono vê seus pacotes" ON public.packages FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Dono cria pacotes" ON public.packages FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Dono edita seus pacotes" ON public.packages FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Dono apaga seus pacotes" ON public.packages FOR DELETE USING (auth.uid() = owner_id);

CREATE TABLE public.certificates (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  client_id uuid REFERENCES public.clients(id),
  client_name_snapshot text,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dono vê seus atestados" ON public.certificates FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Dono cria atestados" ON public.certificates FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Dono edita seus atestados" ON public.certificates FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Dono apaga seus atestados" ON public.certificates FOR DELETE USING (auth.uid() = owner_id);

CREATE TABLE public.receipts (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  client_id uuid REFERENCES public.clients(id),
  client_name_snapshot text,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dono vê seus recibos" ON public.receipts FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Dono cria recibos" ON public.receipts FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Dono edita seus recibos" ON public.receipts FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Dono apaga seus recibos" ON public.receipts FOR DELETE USING (auth.uid() = owner_id);
