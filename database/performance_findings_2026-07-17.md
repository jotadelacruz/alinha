# Auditoria de performance — 2026-07-17

## Metodologia

Produção hoje tem volume de dados muito pequeno (maior tabela, `appointments`,
tinha 72 linhas) — nesse tamanho o Postgres sempre faz Seq Scan em microssegundos,
com ou sem índice, então testar contra os dados reais de hoje não revelaria
nenhum gargalo. Em vez disso, simulei localmente o volume que a Alinha deve ter
daqui a 1-3 anos: um profissional com ~3,5 anos de uso (50 clientes, 9.150
appointments, 5.961 prontuários) + 80 outros profissionais sintéticos, pra
também simular o tamanho real de tabelas compartilhadas entre tenants
(`receipts`: 13.100 linhas no total, `prontuario_access_log`: 37.083).

Ambiente: PostgreSQL 17 nativo (não Docker — a instalação local do Docker
Desktop desta máquina está travando na inicialização por um bug de socket
Unix não relacionado ao projeto; contornado instalando Postgres nativo só
pra este teste). Todas as queries abaixo foram medidas com
`EXPLAIN (ANALYZE, BUFFERS)` reais, não estimativas.

## Achado 1 — N+1 em `ensure_upcoming_appointments` (não é sobre índice)

**Onde:** `backend/app/services/appointment_service.py:29`, chamado em loop por
`ensure_upcoming_appointments` (linha 61-67), que por sua vez roda em **todo**
`GET /appointments` (`backend/app/routers/appointments.py:36`) — ou seja, toda
vez que a tela de Agenda carrega.

**O problema:** para cada cliente ativo, o código refaz a query
`SELECT * FROM appointments WHERE owner_id = :owner_id` (busca TODOS os
appointments do dono, não só os desse cliente) dentro do loop, em vez de
buscar uma vez só e reaproveitar.

**Impacto medido:** a query isolada levou 1,19ms pra retornar as 9.150 linhas
do profissional de teste. Com 42 clientes ativos (dataset sintético), isso é
**1,19ms × 42 ≈ 50ms só de ida-e-volta ao banco**, repetidos a cada carregamento
de Agenda — sem contar o custo adicional de hidratar cada linha em objeto
Python do SQLAlchemy até 42 vezes seguidas (o custo real na aplicação é maior
que o tempo puro de SQL medido aqui).

**Por que índice não resolve:** o índice em `owner_id` já existe nessa tabela.
O problema é o *número de vezes* que a query roda, não o plano de execução dela.

**Decisão:** documentado, **não corrigido** nesta rodada (a pedido do usuário —
correção envolve reescrever a lógica de geração de recorrência em
`appointment_service.py`, fora do escopo de hoje). Recomendação para quando for
priorizado: buscar `appointments` do dono **uma vez** antes do loop de clientes
e reaproveitar o resultado.

## Achado 2 — `receipts` sem índice em `owner_id`

**Query real:** `backend/app/routers/receipts.py:27` —
`WHERE owner_id = :owner_id ORDER BY issue_date DESC`.

| | Antes (sem índice) | Depois (`idx_receipts_owner_issue_date` em `(owner_id, issue_date DESC)`) |
|---|---|---|
| Plano | Seq Scan + Sort (descarta 12.800 de 13.100 linhas) | Bitmap Index Scan + Sort |
| Tempo de execução | 4,38 ms | 1,15 ms |

**Decisão: aplicar o índice.** Ganho claro e consistente com o padrão de uso real.

## Achado 3 — `prontuario_access_log` sem índice em `owner_id`

**Situação atual:** hoje esta tabela é **só escrita** — `grep` no backend
confirma que não existe nenhuma query de leitura implementada ainda (só
`log_prontuario_access` em `prontuario_service.py:40`, que faz INSERT). O
índice não corrige lentidão nenhuma *hoje*, porque não há leitura pra
otimizar — é preventivo, pro dia em que existir uma tela de auditoria LGPD
(que é o propósito declarado da tabela).

| | Antes (sem índice) | Depois (`idx_prontuario_access_log_owner_created` em `(owner_id, created_at DESC)`) |
|---|---|---|
| Plano | Seq Scan + Sort (descarta 19.200 de 37.083 linhas) | Index Scan |
| Tempo de execução | 6,98 ms | 4,04 ms |

**Ressalva:** o ganho aqui parece modesto porque, na simulação, o profissional
de teste concentra 17.883 das 37.083 linhas (~48% da tabela) — um caso de
seletividade ruim mesmo com índice. Numa base real com uso mais distribuído
entre profissionais, cada consulta tocaria uma fração bem menor do total, e o
ganho relativo do índice tende a ser maior que o medido aqui.

**Decisão: aplicar o índice mesmo assim** — é barato, não atrapalha o INSERT
(que já é o único acesso hoje), e evita ter que lembrar de adicionar depois
quando a tela de auditoria for construída.

## Resumo da decisão

| Achado | Ação |
|---|---|
| N+1 em `ensure_upcoming_appointments` | Documentado, correção de código pendente (fora do escopo de hoje) |
| Índice `receipts(owner_id, issue_date DESC)` | Aplicado localmente, migration pronta pra produção |
| Índice `prontuario_access_log(owner_id, created_at DESC)` | Aplicado localmente, migration pronta pra produção |
