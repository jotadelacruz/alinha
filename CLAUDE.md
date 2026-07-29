# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Alinha — practice-management SaaS for health professionals (psychologists, nutritionists,
physiotherapists, speech therapists, etc.): scheduling with automatic recurrence, client records,
billing (receivables and bills to pay), and password-protected session notes (prontuários).
Production: `www.gestaoalinha.com.br`.

The repo also contains `frontend-legacy/` (the original vanilla-JS + Supabase-direct site, kept for
history) and `database/schema_reference.sql` (a full dump of the production schema + RLS policies for
reference). `README.md` at the repo root describes the legacy architecture and is stale — this file
supersedes it for anything related to `backend/` and `frontend/`.

## Commands

### Backend (`backend/`, FastAPI + SQLAlchemy)

```bash
# install deps (Windows venv already exists at backend/.venv in this checkout)
pip install -r requirements.txt

# run the dev server
uvicorn app.main:app --reload

# run the full test suite
pytest -q

# run a single test
pytest -q tests/test_integration.py::test_client_blocked_after_three_unpaid_sessions
```

Tests run against a **real local Postgres** (`DATABASE_URL` in `backend/.env`, default
`localhost:5432`/`alinha_dev` — this checkout uses port `5433`). SQLAlchemy is query-only here; there
is no `Base.metadata.create_all()`, so the local database must already have the full schema applied
(via `database/schema_reference.sql` or the migrations in `supabase/migrations/`) before tests will
pass. Local Postgres also needs a minimal `auth.users(id uuid, email text)` shadow table — production
Supabase provides a real `auth` schema, but a bare local Postgres does not, and `app/routers/admin.py`
joins against it.

### Frontend (`frontend/`, Vite + React, no TypeScript)

```bash
npm run dev      # dev server (default port 5173)
npm run build    # production build to dist/
npm run lint     # oxlint
```

## Architecture

**Split deploy, single repo.** `frontend/` (Vercel) and `backend/` (Railway) deploy independently from
the same `main` branch — there is no staging branch, every push to `main` ships to production.

**Auth**: Supabase Auth (email/password + Google OAuth) is called directly from the frontend via
`@supabase/supabase-js` (`frontend/src/lib/supabaseClient.js`); the backend never handles login. The
frontend attaches the Supabase session's JWT as `Authorization: Bearer <token>` on every API call
(`frontend/src/lib/api.js`). The backend validates that JWT against Supabase's JWKS (with an HS256
legacy fallback) in `backend/app/core/auth.py`.

**Every authenticated request is gated through one dependency**, `get_current_user_id` in
`app/core/auth.py`. Besides validating the JWT, it does a DB lookup on `profiles.account_status` and
rejects (403) any suspended account — this is how a contracting therapist's access gets cut off if they
stop paying, without touching every router individually. `require_admin` layers on top of it for the
admin-only endpoints in `app/routers/admin.py`.

**Data isolation is two-layered**: Postgres RLS policies exist on every table as defense in depth, but
the backend does not rely on them — every query in every router explicitly filters by `owner_id ==
current_user_id`. When adding a new table/router, follow that same explicit-filter pattern rather than
assuming RLS alone is enough.

**camelCase API contract.** All Pydantic schemas in `app/schemas/schemas.py` inherit from `CamelModel`
(`alias_generator=to_camel`), so `session_duration` becomes `sessionDuration` on the wire, etc. This
was a deliberate choice to match what the legacy frontend's `data.js` layer already produced, minimizing
frontend changes during the migration. Keep new fields snake_case in Python/SQL and let the alias
generator handle the JSON casing.

**Business logic lives in `app/services/`, not in routers**: recurring appointment generation
(`appointment_service.py`), recurring bill occurrences and overdue-status detection (`bill_service.py`),
financial calculations — balances, credits, payment status (`finance_service.py`), and the prontuário
password hashing + LGPD access-audit logging (`prontuario_service.py`, writes to
`prontuario_access_log`). Routers stay thin: parse input, call a service, map the result through
`_to_*_out()`.

**Frontend structure**: `pages/` holds one component per route (mounted in `App.jsx` under the
`/app` layout in `pages/AppShell.jsx`, which renders the sidebar/nav and gates on `RequireAuth`).
`context/` holds `AuthContext` (Supabase session), `ProfileContext` (the `/profile` payload, including
the suspended-account message surfaced from a 403), and `SessionTimerContext` (the in-session
countdown timer used by Controle de Horário). `lib/` holds framework-free helpers (`api.js` request
wrapper, CSV import/export, WhatsApp deep-link builders, CEP/CNPJ input masks, theme switching).

**Theming** is CSS-custom-property driven (`index.css`), toggled via `data-theme` (`light` / `dark` /
`system` / `brand`) and `data-color-theme` (`azul` / `verde`) attributes on `<html>`, applied in
`lib/theme.js`. The `brand` theme is a fixed dark-sidebar/off-white-content skin independent of the
`azul`/`verde` accent choice — see the `[data-theme='brand']` block in `index.css` for the full variable
set (including the sidebar-only `--sidebar-bg`/`--sidebar-ink` variables, needed because that theme's
sidebar and main content have different backgrounds, unlike light/dark).

## Database

Supabase Postgres (project ref `tjaemcduijgurnbysdas`). Two things to know before changing schema:

- `database/schema_reference.sql` is a hand-maintained full dump (tables + RLS policies) for quick
  reference — it is documentation, not something migrations apply against.
- `supabase/migrations/` is the actual versioned migration history (introduced later than the app
  itself, so it starts from a baseline snapshot rather than the true beginning). New schema changes
  should get a timestamped file here, applied to both production (via the Supabase MCP/dashboard) and
  the local dev Postgres.
- Several columns have Postgres `CHECK` constraints restricting them to a fixed set of values (e.g.
  `profiles.theme`, `clients.status`, `clients.frequency`). When adding a new allowed value to a field
  like this, the CHECK constraint must be updated too, or every write with the new value will fail at
  the database with a generic error the browser reports as "Failed to fetch" rather than a clear
  validation message.
