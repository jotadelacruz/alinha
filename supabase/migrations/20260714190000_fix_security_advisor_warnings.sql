-- Corrige os alertas do advisor de segurança (WARN, não CRITICAL):
-- 1) function_search_path_mutable em handle_new_user e set_updated_at
-- 2) handle_new_user (SECURITY DEFINER) executável via RPC por anon/authenticated
-- Não mexe em identidade/permissão de nenhum usuário — só hardening de schema.

ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;

-- REVOKE de roles específicas não basta: o GRANT padrão do Postgres na criação
-- da função é pra PUBLIC, que se sobrepõe a revokes de role individuais.
-- Triggers disparam com os privilégios do dono da função independentemente
-- de EXECUTE — revogar de PUBLIC não quebra o trigger em auth.users.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
