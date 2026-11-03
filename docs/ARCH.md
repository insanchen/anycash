# AnyCash architecture document (v1.0)

> **Status:** Final for development
> **Date:** 2026-07-27
> **Based on:** PRD v1.0 → `docs/PRD.md`

---

## 1. Overview

AnyCash is a rewrite of the existing prototype into a self-hosted personal finance app built around privacy. There is no migration path from the prototype data. This is a **full wipe / greenfield rewrite** that breaks compatibility on purpose. The only route for carrying data over is the new gzipped-JSON backup and restore flow, which the user runs by hand.

Target run profile:
- **Self-host primary:** single-node Docker Compose.
- **Distributable:** source + Docker Compose for self-hosting.
- **No cloud dependency:** Postgres + Next.js app only.
- **Consumers:** web UI + authenticated JSON API.

---

## 2. Tech stack decision (final)

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Node.js 26 LTS (Alpine base) | Next.js 16 requires Node 20.9 or newer; 26 is the current LTS. |
| Framework | Next.js 16 App Router | SSG/SSR, Route Handlers for API, edge-friendly, mature. |
| UI | Tailwind CSS 4 | Design tokens from CSS variables and a small utility bundle. |
| ORM | Drizzle ORM | SQL-like, lightweight, great edge-case handling on numeric types; compatible with Next.js server-only. |
| Database | PostgreSQL 18 | JSONB friendly, triggers/locks safe, strong CHECK/ENUM guarantees. |
| Auth | httpOnly SameSite cookies + Argon2 + JWT short-lived + refresh rotation | Matches PRD Level 1 security. |
| Container | Docker Compose (app + Postgres) | Single compose file, no swarm/k8s. |
| Secrets | Environment variables only, never in repo | `.env` ignored; `.env.example` safe defaults only. |

Why **Drizzle over Prisma**:
- Drizzle keeps SQL pseudo-readability and type inference with less build-time overhead.
- Database-level CHECK constraints and enum mapping are easier to express explicitly.
- The dependency footprint is smaller.

---

## 3. Folder structure

```
clients/anycash/
├── app/                         # Next.js App Router
│   ├── (auth)/login/            # login page
│   ├── (dashboard)/             # protected app pages
│   │   ├── accounts/
│   │   ├── reports/
│   │   ├── settings/
│   │   ├── transactions/
│   │   └── users/
│   ├── api/                     # Route Handlers (flat, no v1/)
│   │   ├── accounts/            # GET/POST + [id]/ GET/PUT/DELETE
│   │   ├── admin/categories/
│   │   ├── api-keys/
│   │   ├── auth/[action]/       # POST register, login, logout, refresh, change-password
│   │   ├── auth/me/             # GET current user, PUT update name/email/password
│   │   ├── auth/test-login/
│   │   ├── backup/              # GET download, POST preview/confirm restore
│   │   ├── categories/          # GET public list
│   │   ├── external/            # API key auth handler
│   │   ├── health/
│   │   ├── profile/             # GET/PUT username
│   │   ├── reports/             # GET reports + export/ CSV
│   │   ├── restore/             # alias for POST backup
│   │   ├── sessions/            # GET active, DELETE revoke all
│   │   ├── settings/            # GET/PUT rate source + locale/
│   │   ├── transactions/        # GET/POST/PUT/DELETE
│   │   └── users/               # admin CRUD
│   ├── layout.tsx
│   ├── page.tsx                 # landing
│   └── globals.css
├── components/
│   ├── ui/                      # shared primitives
│   ├── forms/
│   ├── layouts/
│   ├── accounts/
│   ├── transactions/
│   ├── settings/
│   ├── language-toggle.tsx
│   ├── BrandLogo.tsx
│   └── ClientShell.tsx
├── lib/
│   ├── api/                     # API helpers
│   │   ├── accounts.ts
│   │   ├── admin.ts
│   │   └── external.ts
│   ├── auth/
│   │   ├── argon2.ts
│   │   ├── cookies.ts
│   │   ├── handler.ts
│   │   ├── hash-token.ts
│   │   ├── jwt.ts
│   │   └── rate-limit.ts
│   ├── db/
│   │   ├── index.ts
│   │   ├── schema.ts
│   │   ├── migrations/
│   │   └── seed/
│   ├── errors/
│   ├── helpers/
│   ├── i18n/
│   │   ├── id.json
│   │   └── en.json
│   ├── rate/
│   ├── audit/
│   ├── backup/
│   └── theme.tsx
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── healthcheck.ts
├── docs/
│   ├── ARCH.md
│   ├── DESIGN.md
│   ├── DEVELOPMENT_RULES.md
│   ├── PRD.md
│   ├── RULES_AND_CODING_STANDARDS.md
│   ├── SEED_SPEC.md
│   └── migrations/
├── design/                      # Design assets
│   ├── DESIGN.md
│   ├── flow-joint-share.excalidraw
│   ├── flow-nav-map.excalidraw
│   ├── flow-transaction.excalidraw
│   ├── globals.css
│   ├── language-toggle/
│   ├── logo-appicon.svg
│   ├── logo-favicon.svg
│   ├── logo-preview.html
│   ├── logo-wordmark.svg
│   ├── tailwind.theme.json
│   └── wireframe-kit.html
├── docker-compose.yml           # app and database stack
├── Dockerfile                   # production image
├── Dockerfile.dev               # development image
├── proxy.ts                    # route guard
├── .env.example
├── next.config.mjs
├── drizzle.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

Rule: server-only db and auth logic is never imported in client components.

---

## 4. Data model

The final schema is defined in PRD §8. The Drizzle schema mirrors it:

- `users`: role enum `owner | member`
- `user_settings`: PK `user_id`, `rate_source VARCHAR DEFAULT 'manual'`, `updated_at`
- `refresh_tokens`: `token_hash` unique index, `revoked_at` nullable, indexed on `user_id`
- `api_keys`: `key_prefix` plain, `key_hash` unique, `revoked_at` nullable, `scopes TEXT[]`, `rate_limit INT DEFAULT 100`
- `accounts`: type enum `personal | joint | credit_card`, `currency VARCHAR(3) CHECK (length=3 AND currency = upper(currency))`, optional `credit_limit`, `statement_date`, `due_date`
- `account_members`: composite PK `(account_id, user_id)`, role enum
- `categories`: optional `parent_id`, `is_default`, `is_hidden`
- `transactions`: type enum `income | expense | transfer | adjustment`; cross-currency fields: `amount_source`, `amount_destination`, `exchange_rate NUMERIC`, `exchange_currency VARCHAR(3)`, `rate_source VARCHAR`; `transfer_pair_id` nullable FK self (immutable after create)
- `audit_log`: `action VARCHAR`, `details JSONB`, `ip_address INET`

### Mandatory indexes

```
users(email) UNIQUE
api_keys(user_id), api_keys(key_hash) UNIQUE
accounts(user_id), accounts(currency), accounts(type)
account_members(account_id, user_id) UNIQUE
transactions(account_id, date DESC)
transactions(category_id), transactions(subcategory_id), transactions(payee), transactions(type), transactions(transfer_pair_id)
categories(type)
audit_log(user_id), audit_log(created_at DESC)
```

---

## 5. Data flow

### 5.1 Auth flow

```
Client (browser/API client)
    │
    ├── POST /api/auth/login  (JSON body)
    │       ↓
    │   Server validates credentials → Argon2 check
    │       ↓
    │   Issue short-lived access JWT (httpOnly cookie)
    │   Issue long-lived refresh token (httpOnly cookie, DB row)
    │   Set: Secure; SameSite=Strict; Domain scoped to app
    │       ↓
    │   200 + redirect / token confirmation
    │
    ├── On protected request:
    │       ↓
    │   Access JWT read from cookie, verified server-side
    │       ↓
    │   If expired 401 + refresh rotation attempted:
    │       ↓
    │   Refresh token checked against DB, not revoked
    │       ↓
    │   Issue new access JWT + new refresh token, old refresh revoked
    │       ↓
    │   Retry original request
    │
    └── Logout:
            ↓
        Clear cookies client-side
        Mark refresh token revoked_at in DB
        Optional: append audit_log('auth.logout')
```

Rules:
- Auth endpoints get a strict limit per IP: **20 req/min**, burst-aware.
- All other routes use the standard session and API-key limit per key: **100 req/min**, configurable.

### 5.2 Transaction CRUD

```
Auth check (JWT cookie XOR API key)
    ↓
Input validation: amount>0, category exists, account belongs to user or shared joint, currency matches account type
    ↓
Transaction Begin (DB transaction)
    ↓
Insert transaction row
    ↓
For transfer only:
  - Insert linked pair transaction (immutable after create)
  - Update source account balance: balance -= amount_source
  - Update destination account balance: balance += amount_destination
    ↓
For income/expense/adjustment:
  - Update single account balance: +/- amount
    ↓
Commit
    ↓
Return envelope: { success: true, data: {...} }
```

Balance updates run inside the same DB transaction. There are no background jobs and no eventual consistency. The path is intentionally synchronous.

### 5.3 Cross-currency transfer

```
POST /api/transactions { type:'transfer', account_id, amount, ... }
    ↓
Validate source/destination accounts: different accounts, both visible to actor
    ↓
Fetch exchange rate from configured provider OR accept manual rate
    ↓
Snapshot in transaction:
  amount_source = source amount
  amount_destination = converted amount
  exchange_rate = rate
  exchange_currency = source currency
  rate_source = provider name | 'manual'
    ↓
Pair transaction is created as immutable sibling
    ↓
On any report:
  - Per-account balance kept in own currency
  - Grand total uses snapshot rate from transaction row, never live rate
```

Design note: this stops drift over time and matches PRD 3.4 exactly. The rate API is called once per transfer. Rates are not kept in a separate `rates` table.

---

## 6. Sequence diagrams

The diagrams render as HTML artifacts included with the project. Source sequence text:

**6.1 Login**
```
User -> +App: POST /api/auth/login {email,password}
App -> +DB: SELECT password_hash, role FROM users WHERE email=$1
DB --> -App: row
App -> App: argon2.verify(password, hash)
App -> +DB: INSERT refresh_tokens ...
DB --> -App: token row
App --> -User: Set httpOnly cookies (access + refresh), 200
```

**6.2 Create expense**
```
User -> +App: POST /api/transactions (cookie/api-key)
App -> +DB: BEGIN
App -> +DB: INSERT transaction (expense)
DB --> -App: tx row
App -> +DB: UPDATE accounts SET balance = balance - $amount WHERE id=$account_id
DB --> -App: ok
App -> App: COMMIT
App --> -User: { success:true, data:{...} }
```

**6.3 Cross-currency transfer**
```
User -> +App: POST /api/transactions {type:'transfer', ...}
App -> +DB: SELECT currency FROM accounts WHERE id IN ($src, $dst)
DB --> -App: rows
App -> +RateProvider: GET /latest?from=...&to=...
RateProvider --> -App: { rate: 15720 }
App -> +DB: BEGIN
App -> +DB: INSERT transfer pair A (source)
DB --> -App: row A
App -> +DB: INSERT transfer pair B (destination)
DB --> -App: row B
App -> +DB: UPDATE accounts balance src/dst
DB --> -App: ok
App -> App: COMMIT
App --> -User: { success:true, data:{ pair_id, rate, ... } }
```

---

## 7. Deployment architecture

### 7.1 Port conventions

- **Development:** `http://localhost:8902` (Next.js) → Postgres on shared `db-net`.
- **Production:** `http://<host>:8802` reverse-proxied behind nginx/Cloudflare.

### 7.2 Docker Compose topology

One compose file:
- `app`: Next.js standalone (`next start`), driven by environment variables.
- `db`: PostgreSQL 15 on a named Docker volume.
- `backup` (optional): a cron container that runs `pg_dump` on a schedule, if scheduled backups are enabled.

Network:
- Custom bridge `anycash-net`.
- The DB exposes only its internal port. The app talks to `db:5432`.
- Healthcheck on the app: `/api/health` returns `{ ok: true }` on success.

### 7.3 Volumes

- `pgdata`: Postgres WAL and data. ZFS is recommended when available. Otherwise ext4 or xfs is fine for a single node in v1.
- `app-logs`: optional mount at `/app/logs` for future log rotation into Loki or a file.
- `backups`: host bind mount or named volume for exported gzipped JSON backup files.

### 7.4 Restart policy

- `app`: `unless-stopped`
- `db`: `unless-stopped`

---

## 8. Environment variables

`.env.example` (safe defaults only; never use these values in production):

```
# App
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:8902
PORT=8902
HOST=0.0.0.0

# Database
DATABASE_URL=postgres://app_user:change-me@localhost:5432/app_db

# Auth
ACCESS_TOKEN_SECRET=change-me-access-token
REFRESH_TOKEN_SECRET=change-me-refresh-token
ACCESS_TOKEN_TTL=900
REFRESH_TOKEN_TTL=2592000

# Admin seed
ADMIN_EMAIL=admin@anycash.local
ADMIN_PASSWORD=change-me-admin-password

# Rate / limits
AUTH_RATE_LIMIT_PER_MIN=20
API_RATE_LIMIT_PER_MIN=100
API_BURST_LIMIT=20

# Rate provider (pick one, or leave manual)
EXCHANGE_RATE_PROVIDER=manual
EXCHANGE_RATE_API_KEY=

# App behavior
DEFAULT_LANGUAGE=id
COOKIE_SECURE=false   # false for HTTP LAN, true for HTTPS prod
```

Production overrides:
- `NODE_ENV=production`
- Strong secrets are injected through the host environment or a Docker secret mount.
- The cookie secure flag is controlled by the `COOKIE_SECURE` env var. It defaults to false; set it to true for HTTPS.
- The production runtime compose is managed outside this repository. The image is built from the root `Dockerfile` and tagged with the first 12 characters of the commit SHA.

---

## 9. Migration strategy

**Policy: full wipe.** No prototype data carries over automatically.

On the first run with an empty DB:
1. Apply Drizzle migrations.
2. Run the idempotent seed script:
   - Seed default categories (~20 top-level + ~150 subcategories).
   - If `ADMIN_EMAIL` does not exist, create an owner user from `.env` with an argon2-hashed password.
3. Set `app_seeded=true` in app state so seeding does not repeat.

On later runs: migrations only, no seed.

Backup and restore is the user's migration tool between systems where needed.

---

## 10. Seed strategy

- Idempotency: the seed script checks for an existing email or unique name before insert.
- Admin creation: insert only when the `users` table has zero rows or the target email is missing.
- Categories: loaded from one JSON source at `lib/db/seed/categories.json`. System locales are seeded at build time for i18n keys, then the rows are inserted.
- No destructive seed: default categories have `is_default=true` and cannot be hard-deleted in app logic.

---

## 11. Security architecture

| Control | Implementation |
|---|---|
| Password hashing | argon2 via `lib/auth/argon2.ts` |
| Access token | short-lived JWT, httpOnly Secure SameSite cookie |
| Refresh token | stored in DB with `revoked_at`; rotation on every refresh |
| Rate limit | in-memory sliding window per IP/key; Redis optional later |
| API keys | `key_prefix` plain + `key_hash` unique; `revoked_at` nullable; scopes TEXT[] |
| Input validation | Manual validation at route handler boundary (no Zod/validation library) |
| Audit logging | append-only `audit_log` for PRD-specified actions |
| HTTPS prod | enforced at reverse proxy; app itself expects upstream trust |
| Backup integrity | gzipped JSON with per-object idempotency check |

Cookie settings in production:
```
Secure; HttpOnly; SameSite=Strict; Path=/; Domain=<configured>
```

Auth endpoints use a separate rate limiter: 20 req/min per IP, burst-aware.

---

## 12. Development and verification

Run locally:
```
cp .env.example .env
# fill strong secrets + admin creds
pnpm install
pnpm dev            # → http://localhost:8902
```

For a Docker dev image:
```
docker build -f Dockerfile.dev -t anycash-dev .
```

Run unit and integration tests:
```
pnpm test
```

Live smoke test before you call it done:
```
curl -k http://localhost:8902/api/health
# expect: {"ok":true}
```

---

## 13. Next steps

1. Complete the design, schema, and rules documents.
2. Implement the product in vertical slices.
3. Run the required tests and live verification before release.

---

## Appendix A: Key decisions

- Full rewrite, not a migration.
- Drizzle over Prisma for a smaller footprint and explicit constraint support.
- Cookies for web auth, plus scoped API keys for external integrations.
- Transfer pairs are immutable after creation; a reversal must be a new transaction.
- The rate is snapshotted per transfer; there is no global "rates" table.
- No background queue in v1. Everything stays synchronous so correctness comes first.
