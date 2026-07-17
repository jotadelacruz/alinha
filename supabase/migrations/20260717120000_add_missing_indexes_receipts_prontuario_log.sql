-- Auditoria de performance 2026-07-17 (ver database/performance_findings_2026-07-17.md):
-- receipts e prontuario_access_log eram as unicas tabelas sem indice em
-- owner_id/client_id (as 2 mais novas do projeto). Testado com dados
-- sinteticos em escala multi-tenant: receipts foi de 4.38ms para 1.15ms
-- (Seq Scan -> Bitmap Index Scan), prontuario_access_log de 6.98ms para
-- 4.04ms (Seq Scan -> Index Scan).
--
-- prontuario_access_log ainda nao tem nenhuma query de leitura implementada
-- no backend hoje (so INSERT) - este indice e preventivo, pra quando a tela
-- de auditoria LGPD for construida.

CREATE INDEX IF NOT EXISTS idx_receipts_owner_issue_date
  ON public.receipts (owner_id, issue_date DESC);

CREATE INDEX IF NOT EXISTS idx_prontuario_access_log_owner_created
  ON public.prontuario_access_log (owner_id, created_at DESC);
