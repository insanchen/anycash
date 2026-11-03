# AnyCash: SQL migration notes (001_init)

## How to apply

```bash
psql "$DATABASE_URL" -f docs/migrations/001_init.sql
```

## Idempotency

This migration uses `CREATE TABLE IF NOT EXISTS` and guarded `CREATE TYPE` blocks. You can rerun it on an existing greenfield database without harm.

## Rollback

This file does not provide a safe partial rollback. The drops recreate objects with `IF NOT EXISTS`, so they remove nothing. For a greenfield reset, drop and recreate the database.

## Conventions

- One logical change per migration file.
- Next migration: `002_<topic>.sql`, applied in ascending lexical order.
