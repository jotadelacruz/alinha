-- Financeiro → histórico de pagamento das contas fixas: até agora "pago" era só um
-- status, sem registro de quando o pagamento aconteceu (ver bills.py update_status).

ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;
