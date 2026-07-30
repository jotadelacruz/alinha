-- Cobrança recorrente via Asaas: trial de 14 dias pra cadastros novos +
-- assinatura mensal. Contas existentes (7 hoje) ficam de fora desse sistema
-- (grandfathered) — os campos abaixo ficam NULL nelas.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_status text
    CHECK (subscription_status IN ('trialing', 'pending', 'active', 'past_due', 'canceled')),
  ADD COLUMN IF NOT EXISTS asaas_customer_id text,
  ADD COLUMN IF NOT EXISTS asaas_subscription_id text;

-- DEFAULT setado separado do ADD COLUMN de propósito: em Postgres, DEFAULT só
-- vale pra INSERTs futuros (não faz backfill de linhas existentes) -- então
-- as 7 contas atuais permanecem NULL/NULL, e só cadastros novos (via
-- handle_new_user(), que só insere id/name explicitamente) herdam o trial.
ALTER TABLE public.profiles
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '14 days'),
  ALTER COLUMN subscription_status SET DEFAULT 'trialing';

-- NULLs não colidem sob UNIQUE index no Postgres, então isto não afeta
-- contas grandfathered/ainda-não-assinantes.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_asaas_customer_id_key ON public.profiles (asaas_customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_asaas_subscription_id_key ON public.profiles (asaas_subscription_id);
