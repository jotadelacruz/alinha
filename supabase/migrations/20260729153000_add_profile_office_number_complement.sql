-- Configurações → Consultório: campos de Número e Complemento do endereço,
-- que faltavam ao lado de Endereço/CEP.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS office_number text DEFAULT '',
  ADD COLUMN IF NOT EXISTS office_complement text DEFAULT '';
