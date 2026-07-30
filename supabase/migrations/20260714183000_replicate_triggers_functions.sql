-- Replica localmente as funções/triggers que já existem em produção (fora do
-- histórico de migrations, como o resto da baseline). Propositalmente traz os
-- mesmos WARNs que o advisor de segurança aponta em produção — a correção vem
-- na migration seguinte, pra podermos validar o diff antes/depois localmente.
--
-- AVISO OBRIGATÓRIO: NUNCA rode este arquivo diretamente contra produção
-- (psql, `supabase db query -f`, etc.). Ele recria handle_new_user() no
-- estado ANTERIOR ao hardening (sem search_path, sem REVOKE) — rodá-lo contra
-- produção desfaria silenciosamente as correções já aplicadas em
-- 20260714191010_fix_security_advisor_warnings.sql e
-- 20260714191303_revoke_handle_new_user_from_client_roles.sql. Sua versão
-- (20260714183000) é marcada "applied" via `supabase migration repair`
-- justamente pra impedir que `supabase db push` o execute — isso não protege
-- contra execução manual.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.bills FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.certificates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.client_credits FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.packages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.session_records FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
