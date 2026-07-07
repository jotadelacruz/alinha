-- ============================================================================
-- Alinha — referência de schema do Supabase (projeto: tjaemcduijgurnbysdas)
-- Gerado em 2026-07-06 a partir do banco de PRODUÇÃO real (via Supabase MCP).
--
-- IMPORTANTE: este arquivo é uma referência de leitura, não uma migration
-- executável. As mudanças de schema deste projeto foram aplicadas direto em
-- produção via Supabase (dashboard/API), não como arquivos de migration
-- versionados no Git — por isso este dump existe: dar visibilidade completa
-- da estrutura atual sem precisar navegar tabela por tabela no painel.
--
-- Todas as tabelas de dados do usuário têm:
--   - RLS (Row Level Security) habilitado
--   - uma coluna owner_id (uuid) referenciando profiles.id
--   - 4 políticas (SELECT/INSERT/UPDATE/DELETE), todas no padrão
--     "auth.uid() = owner_id" — cada usuário só vê/edita os próprios dados.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- profiles — 1 linha por usuário autenticado (auth.users), configurações do
-- perfil/consultório. RLS: só SELECT/UPDATE do próprio id (sem INSERT/DELETE
-- manual — a linha é criada por um trigger em auth.users, fora deste schema).
-- ---------------------------------------------------------------------------
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- Políticas: "Usuário vê o próprio perfil" (SELECT), "Usuário edita o próprio perfil" (UPDATE)
-- ambas com qual = (auth.uid() = id). Sem policy de INSERT/DELETE (linha gerenciada por trigger).


-- ---------------------------------------------------------------------------
-- clients — clientes/pacientes cadastrados por cada profissional.
-- ---------------------------------------------------------------------------
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
  session_duration integer, -- duração personalizada em minutos; NULL = usa o padrão do perfil
  status text NOT NULL DEFAULT 'ativo' CHECK (status = ANY (ARRAY['ativo','pausa'])),
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
-- Políticas: "Dono {vê/cria/edita/apaga} seus clientes" (SELECT/INSERT/UPDATE/DELETE), auth.uid() = owner_id


-- ---------------------------------------------------------------------------
-- appointments — consultas agendadas (incluindo recorrências geradas
-- automaticamente, agrupadas por recurrence_id).
-- ---------------------------------------------------------------------------
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
-- Políticas: "Dono {vê/cria/edita/apaga} suas consultas", auth.uid() = owner_id


-- ---------------------------------------------------------------------------
-- payments — resumo mensal de sessões/status de pagamento por cliente
-- (1 linha por cliente x mês). Ver payment_transactions para os lançamentos
-- individuais de recebimento.
-- ---------------------------------------------------------------------------
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  reference_month date NOT NULL, -- sempre dia 1 do mês
  sessions_count integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'aberto' CHECK (status = ANY (ARRAY['pago','parcial','aberto'])),
  open_since_date date,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
-- Políticas: "Dono {vê/cria/edita/apaga} seus pagamentos", auth.uid() = owner_id


-- ---------------------------------------------------------------------------
-- payment_transactions — lançamentos individuais de recebimento (o "extrato"
-- por trás do resumo em payments).
-- ---------------------------------------------------------------------------
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
-- Políticas: "Dono {vê/cria/edita/apaga} suas transações", auth.uid() = owner_id


-- ---------------------------------------------------------------------------
-- client_credits — saldo de crédito por cliente (gerado quando um pagamento
-- excede o valor devido no mês; consumido automaticamente em meses futuros).
-- ---------------------------------------------------------------------------
CREATE TABLE public.client_credits (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  balance numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_credits ENABLE ROW LEVEL SECURITY;
-- Políticas: "Dono {vê/cria/edita/apaga} seus créditos", auth.uid() = owner_id


-- ---------------------------------------------------------------------------
-- bills — contas do consultório (fixas ou avulsas).
-- ---------------------------------------------------------------------------
CREATE TABLE public.bills (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Outros',
  amount numeric NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'a-pagar' CHECK (status = ANY (ARRAY['pago','a-pagar','atrasado'])),
  series_id text, -- agrupa ocorrências geradas de uma conta fixa recorrente
  is_fixed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
-- Políticas: "Dono {vê/cria/edita/apaga} suas contas", auth.uid() = owner_id


-- ---------------------------------------------------------------------------
-- session_records — prontuários (dados sensíveis de saúde). Acesso adicional
-- protegido por senha própria (profiles.prontuario_password_hash), verificada
-- na camada de aplicação (FastAPI), não pelo RLS.
-- ---------------------------------------------------------------------------
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
-- Políticas: "Dono {vê/cria/edita/apaga} seus prontuários", auth.uid() = owner_id


-- ---------------------------------------------------------------------------
-- prontuario_access_log — auditoria LGPD: registro de todo acesso/ação sobre
-- prontuários (quem, quando, qual cliente, qual ação).
-- ---------------------------------------------------------------------------
CREATE TABLE public.prontuario_access_log (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  action text NOT NULL,
  session_record_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.prontuario_access_log ENABLE ROW LEVEL SECURITY;
-- Políticas: "{select/insert/update/delete} own prontuario access log", owner_id = auth.uid()


-- ---------------------------------------------------------------------------
-- packages — pacotes de sessões contratados por cliente.
-- ---------------------------------------------------------------------------
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
-- Políticas: "Dono {vê/cria/edita/apaga} seus pacotes", auth.uid() = owner_id


-- ---------------------------------------------------------------------------
-- certificates — atestados emitidos (aba "Emissões" no app).
-- ---------------------------------------------------------------------------
CREATE TABLE public.certificates (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  client_id uuid REFERENCES public.clients(id), -- nullable: atestado sem cliente vinculado
  client_name_snapshot text,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
-- Políticas: "Dono {vê/cria/edita/apaga} seus atestados", auth.uid() = owner_id


-- ---------------------------------------------------------------------------
-- receipts — recibos de pagamento emitidos (aba "Emissões", seção "Recibos
-- de pagamento"). Mesma estrutura de certificates + campo amount.
-- ---------------------------------------------------------------------------
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
-- Políticas: "Dono {vê/cria/edita/apaga} seus recibos", auth.uid() = owner_id


-- ============================================================================
-- Contagem de linhas em produção no momento deste dump (informativo):
--   profiles: 6 · clients: 11 · appointments: 65 · payments: 3 · bills: 0
--   session_records: 5 · packages: 1 · certificates: 1 · payment_transactions: 3
--   client_credits: 1 · prontuario_access_log: 5 · receipts: 0
-- ============================================================================
