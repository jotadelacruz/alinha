-- Tema "Marca" passa a ser o padrão do sistema: novas contas já nascem com ele
-- (handle_new_user só insere id/name, o resto vem do DEFAULT da coluna), e as
-- contas existentes são migradas para Marca agora, a pedido da Julia.

ALTER TABLE public.profiles
  ALTER COLUMN theme SET DEFAULT 'brand';

UPDATE public.profiles SET theme = 'brand';
