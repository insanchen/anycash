# AnyCash: roles, rules, and coding standards
Status: Active
Scope: This repository

## 1. What this doc defines
- The final database schema contract and where the canonical SQL lives
- Coding and convention rules
- Required environment keys and the safety boundary
- Seed script requirements

## 2. Canonical schema source
Use `docs/migrations/001_init.sql` for review, PRD compliance, and audits.
Use `lib/db/schema.ts` for implementation and runtime checks.
Never regenerate the canonical SQL from ORM output alone.

## 3. Bills of materials

### 3.1 Tables
- users
- api_keys
- accounts
- account_members
- categories
- transactions
- audit_log

### 3.2 Required indexes
- `users(email)` unique
- `api_keys(user_id)`, `api_keys(key_hash)` unique
- `accounts(user_id)`, `accounts(currency)`, `accounts(type)`
- `account_members(account_id, user_id)` unique PK
- `transactions(account_id, date DESC)`
- `transactions(category_id)`, `transactions(subcategory_id)`, `transactions(payee)`, `transactions(type)`, `transactions(transfer_pair_id)`
- `categories(type)`
- `audit_log(user_id)`, `audit_log(created_at DESC)`

### 3.3 Constraints
- `role` limited to owner/member
- `account.type` limited to personal/joint/credit_card
- `transaction.type` limited to income/expense/transfer/adjustment
- `account.currency` uppercase length 3
- `transaction.amount` non-zero
- `transfer` rows require source/destination/rate metadata
- `exchange_currency` uppercase length 3 when present

## 4. Roles
- Maintainer: approves changes to these rules.
- Engineer: chooses an implementation within these rules.
- Project owner: approves exceptions.

## 5. Non-negotiables
- Do not ship without a runnable test or health check.
- Do not hardcode secrets (`docs/DEVELOPMENT_RULES.md` §10).
- Do not use raw hex colors in components.
- Do not access `lib/db` or `lib/auth` from client code.
- Transfer pairs cannot change after creation.
