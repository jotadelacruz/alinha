-- Cupons de desconto pra assinatura: desconto vale enquanto durar a assinatura
-- (não só na primeira cobrança), aplicado no momento de assinar. Cadastro de
-- cupom por hora é manual (INSERT direto), sem tela de administração.

CREATE TABLE IF NOT EXISTS public.coupons (
  code text PRIMARY KEY,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value numeric NOT NULL,
  max_uses integer,  -- NULL = ilimitado
  used_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
-- Sem policies: tabela de uso interno do backend (conecta como postgres,
-- ignora RLS), nunca deve ser acessível via anon/authenticated.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS subscription_value numeric;
-- coupon_code: trilha de auditoria de qual cupom foi usado (sem FK de propósito
-- -- continua legível mesmo se o cupom for apagado depois).
-- subscription_value: valor real cobrado na assinatura (com desconto já
-- aplicado, se houver) -- não recalcula a partir do cupom depois, porque o
-- cupom pode mudar/expirar sem afetar o preço já combinado com quem assinou.
