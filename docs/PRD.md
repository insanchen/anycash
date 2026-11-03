# AnyCash personal finance app (PRD v1.0)

## 1. Overview
AnyCash is a **personal finance management app** for tracking income and expenses. It supports multiple users, shared accounts, and credit card tracking. It is built from scratch (Next.js + PostgreSQL) and replaces the previous prototype.

**Target users:** individuals and families who want simple expense tracking that respects privacy.

**Distribution:** hybrid. It is self-hosted for personal or family use, and the source and Docker setup are available for other self-hosted deployments.

---

## 2. Tech stack
- **Frontend & Backend:** Next.js 16 (App Router) + Tailwind CSS 4
- **Database:** PostgreSQL 18
- **Auth:** JWT (cookie-based) + refresh token rotation, argon2 password hashing
- **Theme:** Sage and Sand, carried over from the prototype. **Dark mode** uses the Tailwind dark variant.
- **Deployment:** Docker Compose (self-host)
- **Validation:** Manual at route handler boundaries (no Zod/validation library)

---

## 3. Core features (v1)

### 3.1 Account types
| Type | Description |
|---|---|
| **Personal** | Single-user account. Each user has 1 default main personal account. Can create additional personal accounts. |
| **Joint** | Shared account (co-owned). Owner shares the account to an **existing registered user**, with no invite email or link flow. Once shared, both see this account. Both can topup, withdraw. Full history with actor attribution. |
| **Credit Card** | Account type `credit_card` with `credit_limit`. Balance is inverted (expense increases liability, payment decreases it). Optional `statement_date` / `due_date` for future payment reminders. |

**Rules:**
- Each account has a **name** (user-defined) and a **fixed currency** (default IDR for main, selectable for new)
- No e-wallet type in v1
- Account numbers: manual input (user-defined, optional)

### 3.2 Permissions (RBAC)

| Action | Owner | Member |
|---|---|---|
| Own personal accounts | Full CRUD | Full CRUD |
| Joint accounts | Create, share, manage | View + transact |
| Credit cards (own) | Full CRUD | Full CRUD |
| Credit cards (shared) | None | View + transact (masked sensitive fields) |
| Categories | Create custom | View only |
| Backup / Restore | Yes | No |
| Manage users | Yes | No |
| API Keys | Manage own | Manage own |

### 3.3 Transactions
- CRUD with auto-balance update
- Fields: `amount`, `type` (income/expense/transfer/adjustment), `note`, `date` (timestamp), `category_id`, `subcategory_id`, `payee`, `tags[]`, `account_id`, `user_id`
- Transfer transactions: linked pairs (source → destination) with exchange rate snapshot for cross-currency (records `amount_source`, `amount_destination`, `rate`, `rate_source`)
- **Transfer pair is immutable after creation**: it cannot be edited. You can only reverse it with a new reversal transaction, to keep the audit trail
- Balance auto-updates on create / update / delete
- Pagination: cursor/page-based (offset + limit pattern)
- Filters: date range, account, category, type

### 3.4 Multi-currency
- Each account has **one fixed currency** (3-letter code, uppercase, CHECK constraint)
- Default: IDR for main personal accounts
- Cross-currency transfer: records `amount_source`, `amount_destination`, `rate`, `rate_source` (API provider name or 'manual')
- Exchange rate **snapshot saved per transaction**: grand total conversion uses the historical rate, not the live rate
- Reports show each account in its own currency. The grand total is an estimated conversion to IDR.
- Rate source: configurable in Settings (3-5 recommendations pre-loaded)

### 3.5 Category system
- Hierarchical: Category → Subcategory (max depth 2)
- Types: income, expense, transfer, adjustment
- Seed data comes from the existing AnyCash prototype (~20 top-level, ~150 subcategories)
- Owner can create custom categories
- System defaults (`is_default`) cannot be deleted; they can only be hidden

### 3.6 Backup and restore
- Simple gzipped JSON export/import
- **Idempotent restore**: it checks existing records before insert, so a re-import creates no duplicates
- **Preview** before overwrite (shows summary of changes)
- Validation on both the client and the server

### 3.7 Bilingual
- Full English and Indonesian support
- Default: Indonesian
- All user-facing strings go through `t(...)`. No hardcoded labels.

### 3.8 Accessibility
- WCAG **AA minimum**:
  - Color contrast ≥4.5:1
  - Visible focus states on all interactive elements
  - Keyboard-operable dialogs, tables, forms
  - Screen-reader labels for amounts and data tables

---

## 4. Settings (v1)
Accessible to authenticated users. Contains:

| Section | Content |
|---|---|
| **Profile** | Name, email, language toggle (EN/ID) |
| **Security** | Change password, active sessions |
| **API Keys** | Generate, list, revoke, configure scopes per key |
| **Rate Source** | Select exchange rate API provider (3-5 recommendations) |
| **Theme** | Light / Dark / System mode toggle |
| **Backup** | Download backup, upload & restore with preview |
| **About** | App version, credits |

---

## 5. External API

### 5.1 Authentication

- Each user generates **private API key(s)** from Settings
- Canonical format: `ac_<16 lowercase hex characters>.<64 lowercase hex characters>`; only the prefix is displayed (`ac_<16 hex>`)
- Stored as `key_prefix` (plain, for display/recognition) + `key_hash` (hashed, for lookup)
- Field `revoked_at` for soft-revoke (no hard delete)
- Key rotation: generate a new key, revoke the old one, then let it expire if you want

### 5.2 Scopes
Each API key has configurable scopes:
- `transactions:read`, `transactions:write`
- `accounts:read`, `accounts:write`
- `categories:read`, `categories:write`
- `backup:read`, `backup:write`

### 5.3 Endpoints

| Method | Endpoint | Scope |
|---|---|---|
| GET | `/api/transactions` | `transactions:read` |
| POST | `/api/transactions` | `transactions:write` |
| PUT | `/api/transactions/:id` | `transactions:write` |
| DELETE | `/api/transactions/:id` | `transactions:write` |
| GET | `/api/accounts` | `accounts:read` |
| POST | `/api/accounts` | `accounts:write` |
| PUT | `/api/accounts/:id` | `accounts:write` |
| DELETE | `/api/accounts/:id` | `accounts:write` |
| GET | `/api/categories` | `categories:read` |
| POST | `/api/categories` | `categories:write` |
| GET | `/api/balance` | `accounts:read` |
| GET | `/api/backup` | `backup:read` |
| POST | `/api/restore` | `backup:write` |

### 5.4 Rate limiting
- **Per-key** rate limit (default 100 req/min, configurable per key in `rate_limit` field)
- Burst allowance: 20 requests over limit before hard block
- The rate limit applies to all API key endpoints
- Auth endpoints (login/register) have a separate, stricter limit (20 req/min per IP)

### 5.5 Request / response

**Success:**
```json
{ "success": true, "data": { ... } }
```

**Error:**
```json
{ "success": false, "error": "Category 'Transportasii' not found.", "field": "category_id" }
```

**POST /api/transactions:**
```json
{
  "account_id": "uuid",
  "amount": 50000,
  "type": "expense",
  "note": "GoCar to office",
  "date": "2026-07-27T14:30:00+07:00",
  "category_id": "uuid",
  "subcategory_id": "uuid (optional)",
  "payee": "Gojek",
  "tags": ["transport", "work"]
}
```

---

## 6. Security (level 1)

- **Password:** argon2 hashing
- **JWT:** httpOnly + secure + SameSite cookies, refresh token rotation, server-side revocation list on logout
- **Rate limiting:** auth endpoints (20 req/min per IP), API key endpoints (per-key configurable)
- **Input sanitization:** prevent injection
- **Audit log:** records user create/delete, API key generate/revoke, account delete, transaction adjustment (type=adjustment), backup download, restore execute, password reset
- **HTTPS:** HSTS + strict cookie secure flag mandatory in production
- **API keys:** hashed storage, per-key rate limit, per-key scopes

---

## 7. Seed and deployment

### Admin account
- Configured via `.env`:
  ```
  ADMIN_EMAIL=admin@anycash.app
  ADMIN_PASSWORD=<strong-password>
  ```
- Seed script: **idempotent**. It checks existing records before insert
- Runs on first startup or when DB is empty (not every boot)

### Docker
- Docker Compose: app + PostgreSQL
- **Port convention:** PROD=8103, DEV=9103
- `.env.example` holds safe default values (not weak credentials)
- Production: secrets injected via environment, never in example files
- `COOKIE_SECURE` env var (default false for HTTP LAN, set true for HTTPS)

---

## 8. Data model (PostgreSQL)

### Users
```sql
users (
  id UUID PK,
  email VARCHAR UNIQUE,
  username VARCHAR,
  password_hash VARCHAR,
  role VARCHAR(10) CHECK ('owner', 'member'),
  created_at TIMESTAMP
)
```

### User settings
```sql
user_settings (
  user_id UUID PK FK,
  rate_source VARCHAR(60) DEFAULT 'manual',
  updated_at TIMESTAMP
)
```

### Refresh tokens
```sql
refresh_tokens (
  id UUID PK,
  user_id UUID FK,
  token_hash VARCHAR(255),
  revoked_at TIMESTAMP NULL,
  created_at TIMESTAMP
)
-- Indexes: refresh_tokens(token_hash) UNIQUE, refresh_tokens(user_id)
```

### API keys
```sql
api_keys (
  id UUID PK,
  user_id UUID FK,
  key_prefix VARCHAR,          -- plain text, for display
  key_hash VARCHAR UNIQUE,     -- hashed for auth
  name VARCHAR,
  scopes TEXT[],               -- ["transactions:read", "transactions:write", ...]
  rate_limit INT DEFAULT 100,  -- requests per minute
  revoked_at TIMESTAMP NULL,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP
)
-- Indexes: api_keys(user_id), api_keys(key_hash) UNIQUE
```

### Accounts
```sql
accounts (
  id UUID PK,
  user_id UUID FK,
  name VARCHAR,
  type VARCHAR CHECK ('personal', 'joint', 'credit_card'),
  currency VARCHAR(3) DEFAULT 'IDR',  -- uppercase, CHECK length=3
  balance BIGINT DEFAULT 0,
  account_number VARCHAR NULL,
  credit_limit BIGINT NULL,
  statement_date INT NULL,       -- day of month (1-31)
  due_date INT NULL,             -- day of month (1-31)
  created_at TIMESTAMP
)
-- Indexes: accounts(user_id), accounts(currency), accounts(type)
```

### Account members (joint accounts)
```sql
account_members (
  account_id UUID FK,
  user_id UUID FK,
  role VARCHAR CHECK ('owner', 'member'),
  joined_at TIMESTAMP,
  UNIQUE(account_id, user_id)
)
-- Indexes: account_members(account_id, user_id) UNIQUE
```

### Categories
```sql
categories (
  id UUID PK,
  name VARCHAR,
  type VARCHAR CHECK ('income', 'expense', 'transfer', 'adjustment'),
  parent_id UUID FK NULL,
  is_default BOOLEAN DEFAULT FALSE,
  is_hidden BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP
)
-- Indexes: categories(type)
```

### Transactions
```sql
transactions (
  id UUID PK,
  account_id UUID FK,
  user_id UUID FK,
  amount BIGINT,
  amount_source BIGINT NULL,        -- source amount (cross-currency transfer)
  amount_destination BIGINT NULL,   -- destination amount (cross-currency transfer)
  type VARCHAR CHECK ('income', 'expense', 'transfer', 'adjustment'),
  note TEXT,
  date TIMESTAMPTZ,
  category_id UUID FK,
  subcategory_id UUID FK NULL,
  payee VARCHAR NULL,
  tags TEXT[] NULL,
  transfer_pair_id UUID NULL,       -- linked reversal transaction
  exchange_rate NUMERIC NULL,       -- snapshot rate for cross-currency
  exchange_currency VARCHAR(3) NULL,-- source currency code
  rate_source VARCHAR NULL,         -- API provider name or 'manual'
  created_at TIMESTAMP
)
-- Indexes: transactions(account_id, date DESC), transactions(category_id),
--          transactions(subcategory_id), transactions(payee), transactions(type),
--          transactions(transfer_pair_id)
```

### Audit log
```sql
audit_log (
  id UUID PK,
  user_id UUID FK,
  action VARCHAR,        -- e.g. 'backup.download', 'user.delete', 'restore.execute',
                         -- 'api_key.generate', 'api_key.revoke', 'account.delete',
                         -- 'transaction.adjustment', 'password.reset'
  details JSONB,
  ip_address INET,
  created_at TIMESTAMP
)
-- Indexes: audit_log(user_id), audit_log(created_at DESC)
```

---

## 9. Non-goals (v1)
- E-wallet accounts
- OCR receipt scanning
- Budgeting / envelope allocation
- Recurring transaction templates
- LLM-based parsing in-app (handled by external integrations via API)
- Public registration (admin creates users)
- Email notifications

---

## 10. External integrations

External integrations may use the authenticated JSON API.

The integration contract must document:
- API endpoint format and authentication
- Transaction JSON schema
- Validation rules and error handling
- Example request and response data

---

## 11. Logo and branding
- AnyCash includes an app icon, favicon, and wordmark.
- Theme direction: Sage and Sand (calm, earthy, carried over from the prototype).

---
