# AnyCash agent guide

AnyCash is a self-hosted personal finance app for income, expenses, accounts, and credit cards.

## Stack

Next.js 16.4 App Router, React 19.3, TypeScript 6.0, Tailwind CSS 4.3, PostgreSQL 18, Drizzle ORM 0.45, Node 26 LTS, pnpm 12.

## Commands

```bash
cp .env.example .env
pnpm install
pnpm dev      # http://localhost:8902
pnpm build
pnpm start
pnpm lint
pnpm test
docker compose up -d --build   # http://localhost:8802
```

## Layout

- `app/`: pages and API routes
- `lib/`: database, auth, helpers, i18n, and theme code
- `components/`: shared UI
- `scripts/`: startup and seed scripts
- `tests/`: unit and integration checks
- `docs/`: product and technical docs
- `design/`: design assets

## Working rules

- Keep database and auth code on the server only.
- Return the shared API response envelope from every API handler.
- Put user-facing strings in `lib/i18n/`.
- Use theme colors from CSS variables (`--color-*`). Do not use raw hex values.
- Put migrations in `lib/db/migrations`. They run at container start.
- Keep `pnpm lint`, `pnpm test`, and `pnpm build` passing before you call work done.
- Never commit `.env` or secrets.

See [`docs/DEVELOPMENT_RULES.md`](docs/DEVELOPMENT_RULES.md) and [`docs/RULES_AND_CODING_STANDARDS.md`](docs/RULES_AND_CODING_STANDARDS.md) for the full rules.
