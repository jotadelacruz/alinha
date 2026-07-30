-- Adiciona data de nascimento ao cadastro de clientes, usada pro quadro
-- de aniversariantes do dia no Resumo.

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS birth_date date;
