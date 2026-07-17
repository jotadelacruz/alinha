-- GRANTs padrão que o Supabase provisiona automaticamente na criação de projeto
-- (não capturados na baseline reconstruída manualmente). RLS continua sendo a
-- barreira real de acesso a linhas; estes GRANTs só habilitam o acesso à tabela.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
