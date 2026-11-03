-- AnyCash v1.0 — initial schema
-- Migration source: docs/migrations/001_init.sql

BEGIN;

-- ENUMS
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('owner', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE account_type AS ENUM ('personal', 'joint', 'credit_card');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE transaction_type AS ENUM ('income', 'expense', 'transfer', 'adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE account_member_role AS ENUM ('owner', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(320) NOT NULL,
  username      VARCHAR(100),
  password_hash VARCHAR(255) NOT NULL,
  role          user_role NOT NULL DEFAULT 'owner',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- API KEYS
CREATE TABLE IF NOT EXISTS api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_prefix   VARCHAR(32) NOT NULL,
  key_hash     VARCHAR(255) NOT NULL,
  name         VARCHAR(120) NOT NULL DEFAULT '',
  scopes       TEXT[] NOT NULL DEFAULT '{}',
  rate_limit   INT NOT NULL DEFAULT 100,
  revoked_at   TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);

-- ACCOUNTS
CREATE TABLE IF NOT EXISTS accounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           VARCHAR(200) NOT NULL,
  type           account_type NOT NULL DEFAULT 'personal',
  currency       VARCHAR(3) NOT NULL DEFAULT 'IDR',
  balance        BIGINT NOT NULL DEFAULT 0,
  account_number VARCHAR(64),
  credit_limit   BIGINT,
  statement_date INT CHECK (statement_date IS NULL OR (statement_date BETWEEN 1 AND 31)),
  due_date       INT CHECK (due_date IS NULL OR (due_date BETWEEN 1 AND 31)),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_currency ON accounts(currency);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);

ALTER TABLE accounts
  ADD CONSTRAINT accounts_currency_check
  CHECK (currency = upper(currency) AND length(currency) = 3);

-- ACCOUNT MEMBERS
CREATE TABLE IF NOT EXISTS account_members (
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       account_member_role NOT NULL DEFAULT 'member',
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, user_id)
);

-- CATEGORIES
CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(120) NOT NULL,
  type        transaction_type NOT NULL,
  parent_id   UUID REFERENCES categories(id) ON DELETE RESTRICT,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  is_hidden   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);

-- TRANSACTIONS
CREATE TABLE IF NOT EXISTS transactions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount               BIGINT NOT NULL CHECK (amount <> 0),
  amount_source        BIGINT,
  amount_destination   BIGINT,
  type                 transaction_type NOT NULL,
  note                 TEXT,
  date                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  category_id          UUID REFERENCES categories(id) ON DELETE RESTRICT,
  subcategory_id       UUID REFERENCES categories(id) ON DELETE RESTRICT,
  payee                VARCHAR(200),
  tags                 TEXT[] NOT NULL DEFAULT '{}',
  transfer_pair_id     UUID,
  exchange_rate        NUMERIC(18, 8),
  exchange_currency    VARCHAR(3),
  rate_source          VARCHAR(60),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_account_id_date
  ON transactions(account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_subcategory_id ON transactions(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_transactions_payee ON transactions(payee);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_transfer_pair_id ON transactions(transfer_pair_id);

ALTER TABLE transactions
  ADD CONSTRAINT transactions_exchange_currency_check
  CHECK (
    exchange_currency IS NULL
    OR (exchange_currency = upper(exchange_currency) AND length(exchange_currency) = 3)
  );

ALTER TABLE transactions
  ADD CONSTRAINT transactions_transfer_fields_check
  CHECK (
    type <> 'transfer'
    OR (
      amount_source IS NOT NULL
      AND amount_destination IS NOT NULL
      AND exchange_rate IS NOT NULL
      AND exchange_currency IS NOT NULL
      AND rate_source IS NOT NULL
    )
  );

-- AUDIT LOG
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(100) NOT NULL,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

COMMIT;

-- Refresh tokens (JWT rotation)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash
  ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
  ON refresh_tokens(user_id);
