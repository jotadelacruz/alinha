-- Supabase linter 0001_unindexed_foreign_keys (ver
-- https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys):
-- 4 foreign keys em client_id sem indice de cobertura. Sem indice, qualquer
-- lookup/join por cliente (e o proprio ON DELETE/UPDATE de FK) forca Seq Scan
-- nessas tabelas.

CREATE INDEX IF NOT EXISTS idx_certificates_client_id
  ON public.certificates (client_id);

CREATE INDEX IF NOT EXISTS idx_client_credits_client_id
  ON public.client_credits (client_id);

CREATE INDEX IF NOT EXISTS idx_prontuario_access_log_client_id
  ON public.prontuario_access_log (client_id);

CREATE INDEX IF NOT EXISTS idx_receipts_client_id
  ON public.receipts (client_id);
