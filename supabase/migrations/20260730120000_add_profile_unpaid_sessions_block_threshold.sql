-- Configurações → Preferências: limite configurável de sessões sem pagamento que
-- bloqueia novos agendamentos do cliente (antes fixo em 3, ver finance_service.py).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS unpaid_sessions_block_threshold integer NOT NULL DEFAULT 3;
