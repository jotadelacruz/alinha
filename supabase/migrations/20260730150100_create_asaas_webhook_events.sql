-- Log de eventos de webhook da Asaas: idempotência (a Asaas reentrega
-- eventos que não respondem 2xx, e o id do evento pode repetir) e única
-- visibilidade sobre o que a Asaas realmente enviou antes de haver acesso
-- ao dashboard sandbox.

CREATE TABLE IF NOT EXISTS public.asaas_webhook_events (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.asaas_webhook_events ENABLE ROW LEVEL SECURITY;
-- Sem policies: tabela de uso interno do backend (conecta como postgres,
-- ignora RLS), nunca deve ser acessível via anon/authenticated.
