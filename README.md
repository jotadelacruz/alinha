# Alinha — Gestão Inteligente

Sistema de gestão de consultório para psicoterapeutas: agenda com recorrência automática, cadastro de clientes, financeiro (recebimentos e contas a pagar) e prontuários protegidos por senha.

## Estrutura do projeto

```
alinha/
├── index.html          → tela de login e cadastro
├── app.html             → aplicação principal (pós-login)
├── css/
│   └── styles.css       → todo o visual do sistema
├── js/
│   ├── supabase-client.js  → conexão com o banco de dados
│   ├── auth.js              → login, cadastro, logout
│   ├── data.js                → leitura/escrita de dados (clientes, agenda, financeiro, prontuários)
│   └── app.js                  → toda a lógica de interface
├── schema.sql            → script para criar as tabelas no Supabase (rodar uma única vez)
├── package.json
└── vercel.json
```

## Como publicar (deploy)

### 1. Banco de dados (Supabase) — já configurado
O projeto já está conectado a um banco Supabase existente. Se precisar recriar:
1. Crie um projeto em [supabase.com](https://supabase.com/dashboard)
2. No SQL Editor, rode o conteúdo de `schema.sql`
3. Em Authentication → Providers, habilite Google (e configure o OAuth no Google Cloud Console)
4. Copie a Project URL e a anon key em Project Settings → API
5. Cole esses valores em `js/supabase-client.js`

### 2. Hospedagem (Vercel)
1. Crie uma conta em [vercel.com](https://vercel.com) (pode usar login com GitHub)
2. Suba esta pasta para um repositório no GitHub
3. Na Vercel, clique em "Add New Project" → selecione o repositório
4. Não é necessário configurar build command (é um site estático) — clique em "Deploy"
5. Você receberá um link tipo `alinha.vercel.app`

### 3. Domínio próprio (opcional)
Na Vercel, em Project Settings → Domains, adicione seu domínio (ex: `alinha.com.br`) e siga as instruções de DNS mostradas na tela.

### 4. Atualizar URLs no Google OAuth e Supabase
Depois de ter o link da Vercel (ou domínio próprio):
- No Google Cloud Console → Credentials → seu OAuth Client: adicione o novo domínio em "Authorized JavaScript origins"
- No Supabase → Authentication → URL Configuration: defina o "Site URL" como o domínio de produção, e adicione-o em "Redirect URLs"

## Desenvolvimento local

Para testar localmente antes de publicar:
```bash
npx serve . -p 3000
```
Depois acesse `http://localhost:3000`. Lembre-se de adicionar `http://localhost:3000` nas origens autorizadas do Google Cloud Console e nas Redirect URLs do Supabase enquanto testa localmente.

## Segurança

- Os dados de cada psicoterapeuta são isolados por Row Level Security (RLS) no banco — uma conta nunca acessa dados de outra, mesmo no mesmo banco.
- A senha de acesso aos prontuários é armazenada como hash (SHA-256), nunca em texto puro.
- A chave pública do Supabase (`anon key`) é segura para expor no frontend — a proteção real vem das políticas RLS, não do sigilo dessa chave.
