# Contexto: projeto Alinha

Este documento é para colar como primeira mensagem no Claude Code de quem está entrando no
projeto — hoje, serve para contextualizar o acesso ao banco de dados.

Você vai me ajudar a cuidar do banco de dados do Alinha — sistema de gestão de consultório
para profissionais de saúde (psicólogos, nutricionistas, fisioterapeutas, fonoaudiólogos etc.),
hoje em produção em www.gestaoalinha.com.br.

## Arquitetura

- **Frontend**: React (Vite), pasta `frontend/`, deploy automático na Vercel a cada push na `main`.
- **Backend**: FastAPI (Python), pasta `backend/`, deploy automático no Railway a cada push na `main`
  (URL: `https://alinha-production.up.railway.app`).
- **Banco/Auth**: Supabase — Postgres gerenciado + Supabase Auth (login por e-mail/senha e Google OAuth).
  Project ref: `tjaemcduijgurnbysdas`.
- **Repo**: branch única `main` = produção. Não existe staging; todo push vai direto pro ar.

## Banco de dados

- Schema completo de referência (12 tabelas + políticas RLS) está em `database/schema_reference.sql`
  — comece por aí pra entender a estrutura sem precisar puxar do Supabase toda vez.
- Tabelas: `profiles`, `clients`, `appointments`, `payments`, `payment_transactions`, `client_credits`,
  `bills`, `session_records`, `prontuario_access_log`, `packages`, `certificates`, `receipts`.
- **Modelo de segurança em duas camadas**: RLS ativo no Supabase (defesa em profundidade), mas o
  backend TAMBÉM filtra `owner_id` explicitamente em toda query — não depende só de RLS.
- `profiles` não guarda e-mail (isso vive em `auth.users`, gerenciado pelo Supabase). Quando precisar
  cruzar e-mail com perfil, é um JOIN `public.profiles` + `auth.users`.
- Campos recentes em `profiles`: `is_admin` (bool) e `account_status` ('active'/'suspended') — usados
  num painel interno pra bloquear login de contratante inadimplente. Só a Julia é admin hoje.
- Dev local: Postgres na porta 5433, banco `alinha_dev`. Esse Postgres local NÃO tem o schema `auth`
  do Supabase por padrão — foi criado manualmente um `auth.users` mínimo (id uuid PK, email text) só
  pra dar suporte a queries/testes que fazem esse JOIN. Se recriar o ambiente do zero, lembre de
  recriar esse shadow table também.

## Regra de segurança que sigo neste projeto (siga também)

Qualquer migração que conceda permissão elevada (ex: `is_admin = true` pra um UUID específico) só deve
ser aplicada depois de eu confirmar explicitamente qual conta é essa — nunca inferir automaticamente
de um resultado de query anterior sem checar com a Julia primeiro. Migrações de schema puro (sem
atribuir identidade/permissão a ninguém) podem seguir direto.

## Variáveis de ambiente

Nenhum segredo real deve ir pro repositório. Veja `backend/.env.example` e `frontend/.env.example`
pros nomes das variáveis — os valores reais (senha do banco, JWT secret) a Julia compartilha direto
com você por um canal seguro, não peça pra eu digitar aqui.

## Workflow

Commits em português, mensagens curtas focando no "porquê". Sempre `git push` direto pra `main` já
sobe pra produção — trate isso como implícito em qualquer mudança, não é preciso pedir confirmação
de deploy, mas builds/testes devem passar antes de subir.

## Dúvidas

Fale com a Julia (juliavc@gmail.com) — é a fundadora e quem decide produto/prioridade.
