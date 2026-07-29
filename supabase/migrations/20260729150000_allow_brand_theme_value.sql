-- profiles.theme tinha um CHECK restringindo a 'light'/'dark'/'system'. O tema
-- "Marca" (Configurações → Aparência) introduziu um quarto valor e a constraint
-- não foi atualizada junto, causando falha de escrita (500 -> "Failed to
-- fetch" no navegador) sempre que esse tema era salvo.

ALTER TABLE public.profiles DROP CONSTRAINT profiles_theme_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_theme_check
  CHECK (theme = ANY (ARRAY['light'::text, 'dark'::text, 'system'::text, 'brand'::text]));
