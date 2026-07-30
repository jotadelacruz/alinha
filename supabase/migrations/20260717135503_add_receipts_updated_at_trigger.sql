-- receipts tem coluna updated_at mas era a unica das 10 tabelas com esse
-- campo sem o trigger que a mantem atualizada em UPDATE (achado da revisao
-- semanal de 2026-07-17). Usa a mesma funcao public.set_updated_at() ja
-- aplicada nas outras 9 tabelas.
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
