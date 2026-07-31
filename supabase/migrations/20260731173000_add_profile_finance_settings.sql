-- Configurações → nova aba Financeiro: categorias de contas a pagar e formas de
-- recebimento deixam de ser listas fixas no frontend e passam a ser editáveis por
-- profissional (ver FinanceiroPage.jsx BILL_CATEGORIES / paymentMethod <select>).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bill_categories text[] NOT NULL DEFAULT ARRAY[
    'Aluguel', 'Água', 'Luz', 'Internet', 'Telefone', 'Material de consultório',
    'Supervisão', 'Assinaturas/Software', 'Impostos', 'Outros'
  ],
  ADD COLUMN IF NOT EXISTS payment_methods text[] NOT NULL DEFAULT ARRAY[
    'PIX', 'Dinheiro', 'Cartão', 'Transferência', 'Outro'
  ];
