# AnyCash: personal finance app

AnyCash is a personal finance app. You can track income and expenses, manage several accounts, share joint accounts, and track credit cards. It runs on your own server, so your data stays under your control.

The app uses Next.js 16.4 with the App Router, React 19.3, TypeScript 6.0, Tailwind CSS 4.3, PostgreSQL 18, and Drizzle ORM 0.45. The containers run Node 26 LTS and pnpm 12.

## Documentation

| File | Purpose |
|------|---------|
| [`docs/PRD.md`](docs/PRD.md) | Product requirements, features, data model, and API contract |
| [`docs/ARCH.md`](docs/ARCH.md) | Architecture and technical decisions |
| [`docs/DESIGN.md`](docs/DESIGN.md) | UI, UX, design tokens, screens, and accessibility |
| [`docs/RULES_AND_CODING_STANDARDS.md`](docs/RULES_AND_CODING_STANDARDS.md) | Schema, coding, and security rules |
| [`docs/SEED_SPEC.md`](docs/SEED_SPEC.md) | Development seed behavior |
| [`docs/migrations/`](docs/migrations/) | Database migration references |

Design assets are in [`design/`](design/).

## Project layout

```text
anycash/
├── README.md
├── app/                   # Pages and API routes
├── components/            # Shared UI components
├── lib/                   # Database, auth, helpers, i18n, and theme
├── design/                # Logos, wireframes, and design tokens
├── docs/                  # Product and technical documentation
├── scripts/               # Startup, seed, and migration scripts
├── tests/                 # Unit and integration checks
├── docker-compose.yml     # App and PostgreSQL stack
├── Dockerfile             # Production image
├── Dockerfile.dev         # Development image
├── proxy.ts               # Route guard
└── package.json
```

## Development rules

- Keep database and authentication code on the server.
- Return the shared API response envelope from API handlers. The API routes describe the envelope.
- Put user-facing strings in `lib/i18n/`.
- Use CSS variables for theme colors.
- Run the health check before you report a change as complete.

See [`docs/RULES_AND_CODING_STANDARDS.md`](docs/RULES_AND_CODING_STANDARDS.md).

## Quick start

```bash
cp .env.example .env
pnpm install
pnpm dev
```

The app runs at http://localhost:8902.

Use these commands for the other checks:

```bash
pnpm build
pnpm start
pnpm lint
pnpm test
```

## Local Docker build

```bash
docker build -f Dockerfile.dev -t anycash-dev .
docker run --env-file .env -p 8902:8902 anycash-dev
```

You can also start the full stack with Compose:

```bash
docker compose up -d --build
```

Compose starts the app and PostgreSQL 18. The app listens on port 8802 by default. Set `APP_PORT` to change it. Database files live in the named `pgdata` volume. On container start, `scripts/entrypoint.mjs` runs the migrations and the admin and category seeds.

## Configuration

`.env.example` lists every variable. Set the database, auth secret, admin, rate limit, exchange rate, and app values in your local environment. `docker compose` refuses to start until `POSTGRES_PASSWORD`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, and `ADMIN_PASSWORD` are set. Never commit `.env` or secrets.

## Production deployment

Build a versioned production image from a commit SHA, then provide the runtime environment through your deployment platform. Production domains, ports, secrets, and infrastructure depend on the platform and are not part of this repository.

```bash
docker build -t "anycash:$(git rev-parse --short=12 HEAD)" .
```
