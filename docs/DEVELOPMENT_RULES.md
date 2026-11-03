# AnyCash: development rules and contribution guide
Applies to: this repository

Date: 2026-07-27
Based on: PRD v1.0, ARCH v1.0, DESIGN v1.0

## 1. Folder structure
- Treat the structure in ARCH.md as the reference.
- Rule: do not import server-only logic (`lib/db`, `lib/auth`) from client components.
- Place components under `components/<domain>/`.
- Place schemas under `lib/db/` and business helpers under `lib/<domain>/`.

## 2. API response envelope
- Success: `{ "success": true, "data": {...} }`
- Error: `{ "success": false, "error": "...", "field": "..." }`
- Route handlers must return the envelope.

## 3. Validation
- Validate manually at route handler boundaries (no external validation library).
- Database constraints are the final authority. App validation protects the UX and error messages.
- Never rely on client-side validation alone.

## 4. Database/bootstrap rules
- Run balance mutations inside a single database transaction. Do not use async waits inside the transaction.
- The audit log is append-only.
- Enum values in code must match the SQL enums exactly. Fail fast on a mismatch.
- Do not use background queues for core transaction paths.
- Multi-currency reports use the snapshot rate captured with the transaction, not the live rate.

## 5. Auth/cookie rules
- Production cookies: `Secure; HttpOnly; SameSite=Strict; Path=/; Domain=<configured>`
- Refresh rotation must mark the old refresh token as `revoked_at` before it inserts the next one.
- Logout must revoke the refresh token and clear the cookies. It may also write an audit event.

## 6. Accessibility rules
- Use CSS variables from `globals.css` for all color values.
- `data-testid` values follow kebab case and match the access points in the DESIGN spec.
- Add `aria-label` for amount rows and complex widgets.

## 7. i18n rule
- Do not hardcode user-facing strings in components.
- Extend `lib/i18n/id.json` and `en.json`, then use `t(...)` everywhere.
- Add keys in lockstep across locales before you finish a feature.

## 8. Testing policy
- Run one runnable check before you finish non-trivial logic. You may skip this for trivial work.
- The integration check against `/api/health` is mandatory before you mark work as done.
- For API routes, cover the happy path, one auth error, and one input error.

## 9. Commit convention
Format: `<type>(<scope>): <subject>`
Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`
Rules: imperative mood, <=72 chars subject, body optional.

## 10. Production image tagging
- Production Docker image tags use the first 12 characters of the commit SHA: `<image>:<short-sha>`.
- Example: `anycash:009e669ac153`.
- Do not use `latest` for production.
- Keep the full commit SHA in Git and deployment records for exact traceability and rollback.
- Build and verify the short-SHA image before you recreate only the target service.

## 11. Secret handling
- `.env` is ignored in VCS.
- `.env.example` holds safe defaults only.
- Production secrets are injected through the environment or Docker secret mounts.
- The audit log must not store plaintext secrets.
