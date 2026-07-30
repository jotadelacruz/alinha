-- Reconciliacao (2026-07-29): este REVOKE foi aplicado em producao em
-- 2026-07-14 e registrado em schema_migrations sob a versao 20260714191303,
-- mas nunca tinha virado arquivo de migration commitado ate agora. E
-- redundante com o REVOKE ... FROM PUBLIC de
-- 20260714191010_fix_security_advisor_warnings.sql (que ja bloqueia
-- anon/authenticated na ausencia de GRANT proprio), mas replicado aqui ad
-- litteram pra dar paridade 1:1 com o historico real de producao.
-- Estatamento idempotente - reexecucao e inocua.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
