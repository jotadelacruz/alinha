-- Supabase linter 0003_auth_rls_initplan (ver
-- https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan):
-- toda policy que chama auth.uid() "nu" faz o Postgres reavaliar a função uma
-- vez POR LINHA. Envolvendo em `(select auth.uid())`, o planner trata como um
-- initPlan e avalia uma unica vez por query, independente do numero de linhas.
--
-- ALTER POLICY so redefine USING/WITH CHECK (nao muda nome, comando ou role) -
-- comportamento das 46 policies fica identico, so a forma de avaliar auth.uid()
-- muda. Nenhuma politica aqui tinha WITH CHECK junto de USING em UPDATE, entao
-- nao adicionamos WITH CHECK onde nao existia.

-- profiles
ALTER POLICY "Usuário vê o próprio perfil" ON public.profiles USING ((select auth.uid()) = id);
ALTER POLICY "Usuário edita o próprio perfil" ON public.profiles USING ((select auth.uid()) = id);

-- clients
ALTER POLICY "Dono vê seus clientes" ON public.clients USING ((select auth.uid()) = owner_id);
ALTER POLICY "Dono cria clientes" ON public.clients WITH CHECK ((select auth.uid()) = owner_id);
ALTER POLICY "Dono edita seus clientes" ON public.clients USING ((select auth.uid()) = owner_id);
ALTER POLICY "Dono apaga seus clientes" ON public.clients USING ((select auth.uid()) = owner_id);

-- appointments
ALTER POLICY "Dono vê suas consultas" ON public.appointments USING ((select auth.uid()) = owner_id);
ALTER POLICY "Dono cria consultas" ON public.appointments WITH CHECK ((select auth.uid()) = owner_id);
ALTER POLICY "Dono edita suas consultas" ON public.appointments USING ((select auth.uid()) = owner_id);
ALTER POLICY "Dono apaga suas consultas" ON public.appointments USING ((select auth.uid()) = owner_id);

-- payments
ALTER POLICY "Dono vê seus pagamentos" ON public.payments USING ((select auth.uid()) = owner_id);
ALTER POLICY "Dono cria pagamentos" ON public.payments WITH CHECK ((select auth.uid()) = owner_id);
ALTER POLICY "Dono edita seus pagamentos" ON public.payments USING ((select auth.uid()) = owner_id);
ALTER POLICY "Dono apaga seus pagamentos" ON public.payments USING ((select auth.uid()) = owner_id);

-- payment_transactions
ALTER POLICY "Dono vê suas transações" ON public.payment_transactions USING ((select auth.uid()) = owner_id);
ALTER POLICY "Dono cria transações" ON public.payment_transactions WITH CHECK ((select auth.uid()) = owner_id);
ALTER POLICY "Dono edita suas transações" ON public.payment_transactions USING ((select auth.uid()) = owner_id);
ALTER POLICY "Dono apaga suas transações" ON public.payment_transactions USING ((select auth.uid()) = owner_id);

-- client_credits
ALTER POLICY "Dono vê seus créditos" ON public.client_credits USING ((select auth.uid()) = owner_id);
ALTER POLICY "Dono cria créditos" ON public.client_credits WITH CHECK ((select auth.uid()) = owner_id);
ALTER POLICY "Dono edita seus créditos" ON public.client_credits USING ((select auth.uid()) = owner_id);
ALTER POLICY "Dono apaga seus créditos" ON public.client_credits USING ((select auth.uid()) = owner_id);

-- bills
ALTER POLICY "Dono vê suas contas" ON public.bills USING ((select auth.uid()) = owner_id);
ALTER POLICY "Dono cria contas" ON public.bills WITH CHECK ((select auth.uid()) = owner_id);
ALTER POLICY "Dono edita suas contas" ON public.bills USING ((select auth.uid()) = owner_id);
ALTER POLICY "Dono apaga suas contas" ON public.bills USING ((select auth.uid()) = owner_id);

-- session_records
ALTER POLICY "Dono vê seus prontuários" ON public.session_records USING ((select auth.uid()) = owner_id);
ALTER POLICY "Dono cria prontuários" ON public.session_records WITH CHECK ((select auth.uid()) = owner_id);
ALTER POLICY "Dono edita seus prontuários" ON public.session_records USING ((select auth.uid()) = owner_id);
ALTER POLICY "Dono apaga seus prontuários" ON public.session_records USING ((select auth.uid()) = owner_id);

-- prontuario_access_log
ALTER POLICY "select own prontuario access log" ON public.prontuario_access_log USING (owner_id = (select auth.uid()));
ALTER POLICY "insert own prontuario access log" ON public.prontuario_access_log WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY "update own prontuario access log" ON public.prontuario_access_log USING (owner_id = (select auth.uid()));
ALTER POLICY "delete own prontuario access log" ON public.prontuario_access_log USING (owner_id = (select auth.uid()));

-- packages
ALTER POLICY "Dono vê seus pacotes" ON public.packages USING ((select auth.uid()) = owner_id);
ALTER POLICY "Dono cria pacotes" ON public.packages WITH CHECK ((select auth.uid()) = owner_id);
ALTER POLICY "Dono edita seus pacotes" ON public.packages USING ((select auth.uid()) = owner_id);
ALTER POLICY "Dono apaga seus pacotes" ON public.packages USING ((select auth.uid()) = owner_id);

-- certificates
ALTER POLICY "Dono vê seus atestados" ON public.certificates USING ((select auth.uid()) = owner_id);
ALTER POLICY "Dono cria atestados" ON public.certificates WITH CHECK ((select auth.uid()) = owner_id);
ALTER POLICY "Dono edita seus atestados" ON public.certificates USING ((select auth.uid()) = owner_id);
ALTER POLICY "Dono apaga seus atestados" ON public.certificates USING ((select auth.uid()) = owner_id);

-- receipts
ALTER POLICY "Dono vê seus recibos" ON public.receipts USING ((select auth.uid()) = owner_id);
ALTER POLICY "Dono cria recibos" ON public.receipts WITH CHECK ((select auth.uid()) = owner_id);
ALTER POLICY "Dono edita seus recibos" ON public.receipts USING ((select auth.uid()) = owner_id);
ALTER POLICY "Dono apaga seus recibos" ON public.receipts USING ((select auth.uid()) = owner_id);
