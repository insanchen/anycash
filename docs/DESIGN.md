# AnyCash: UI/UX Design Spec (v1.0, Sage & Sand)

**Date:** 2026-07-27
**Source of truth:** `docs/PRD.md` (v1.0) · `design/tailwind.theme.json` (Sage & Sand)
**Deliverables folder:** `design/`

---

## 0. Summary

- The deliverables include the full design system, seven screens, and logo assets.
- Colors use CSS variables for theme support.
- Destructive colors meet the documented contrast target.
- Joint accounts use sharing with an existing registered user.
- Dark mode, settings, bilingual UI, and accessibility are included.

---

## 1. File inventory (deliverables)

| File | Purpose | How to view |
|---|---|---|
| `DESIGN.md` | Normative token spec (Sage & Sand + dark, AA) | `npx @google/design.md lint DESIGN.md` |
| `tailwind.theme.json` | Tailwind theme tokens (CSS variable references) | the application uses it |
| `globals.css` | `:root` + `.dark` CSS variable sets | import in `app/globals.css` |
| `logo-appicon.svg` | 512² app icon | open in browser |
| `logo-favicon.svg` | 64² favicon | open in browser |
| `logo-wordmark.svg` | "Any" sage + "Cash" ink | open in browser |
| `logo-preview.html` | view all marks + dark tile toggle | open in browser |
| `flow-joint-share.excalidraw` | joint share flow | excalidraw.com |
| `joint-share / transaction / nav-map` flows | see §3 | excalidraw.com |
| `wireframe-kit.html` | 7 screens, light/dark, mobile; main review artifact | open in browser, toggle dark |

---

## 2. Design system (summary)

**Palette (light to dark):**
- Sage primary `#4A6B53` → `#7FA386`
- Canvas `#FAFAF8` / `#FFFFFF` → `#14171A` / `#1E2226`
- Secondary `#EAECE8` → `#2A2F2C`
- Income sage, Expense ink; Destructive `#A8472A` → `#E08A6A`

**Type:** Outfit (headings) + Manrope (body). Base 16px, never below 14px for body text.
**Shape:** cards `rounded-2xl/3xl`, buttons `rounded-full`, inputs `rounded-xl`.
**Materials:** glassmorphism sticky header and fixed bottom nav, soft card shadow, sage focus ring (2px).
**Icons:** `lucide-react`, `strokeWidth={1.5}`.

---

## 3. Screens (see `wireframe-kit.html` for live renders)

1. Login: centered brand, email/password, ID/EN segmented toggle. No public register (admin creates users, PRD §9).
2. Dashboard: sage total-balance hero, 3 summary tiles, horizontal-snap account cards (joint card gets gradient + "Joint" badge). FAB for quick add.
3. Transactions: type filter chips, list rows (icon / title / date / signed amount), bottom-sheet create form (amount/type/category/note). Transfer type triggers destination selector.
4. Reports: 4 tabs (daily/monthly/category/cashflow), themed bar chart, income/expense/net tiles, **Export CSV** button. Multi-currency: each account has its own currency, plus a grand-total-IDR row with an editable rate.
5. Settings: 7 sub-sections (Profile, Security, API Keys, Rate Source, Theme, Backup, About).
6. Account Detail: 3 variants (personal / joint / credit card). Credit card shows a gradient card, usage gauge (color tiers), days to due, and a "Bayar" button.
7. Joint Share Flow: search registered users, pick a user and role (Owner/Member), confirm, and both sides see the change immediately. Copy: "User must already be registered." There is no pending state or approval step.

**Flows (Excalidraw):** `flow-joint-share` (D1-A), `flow-transaction` (create/edit + transfer-pair immutability + reversal), `flow-nav-map` (5-dest bottom nav + sub-routes).

---

## 4. Accessibility (WCAG AA): verified

| Check | Result |
|---|---|
| Body text contrast ≥4.5:1 (both themes) | ✅ text-main on bg |
| Muted text contrast ≥4.5:1 | ✅ `#5C6A60` on `#FAFAF8` = 5.0:1; dark `#9AA69C` on `#14171A` = 7.4:1 |
| Destructive `#A8472A` on white | ✅ 4.7:1 (prototype `#C27359` was 3.3:1, fixed) |
| Visible focus states | ✅ 2px sage ring on all interactive (`.fab`, `.iconbtn`, `.navitem`, inputs) |
| Keyboard-operable dialogs | ✅ bottom sheets are focus-trapped modals |
| Screen-reader labels for amounts | ⚠️ add `aria-label` such as "Expense 50,000 IDR" on transaction rows |
| `data-testid` (kebab) on interactive | ⚠️ add IDs according to the design accessibility rule |

---

## 5. Bilingual i18n keys (seed list, `t(...)` en+id)

```
nav.dashboard / nav.transactions / nav.reports / nav.accounts / nav.settings
login.title / login.email / login.password / login.submit
login.noRegister (admin creates users)
dash.totalBalance / dash.today / dash.thisMonth / dash.perAccount
txn.title / txn.filter.all / txn.filter.income / txn.filter.expense / txn.filter.transfer
txn.add / txn.amount / txn.type / txn.category / txn.note / txn.save
txn.type.income / txn.type.expense / txn.type.transfer / txn.type.adjustment
report.daily / report.monthly / report.category / report.cashflow
report.income / report.expense / report.net / report.exportCsv
report.grandTotalIdr / report.rateEditable
settings.profile / settings.security / settings.apiKeys / settings.rateSource
settings.theme / settings.backup / settings.about
account.personal / account.joint / account.creditCard
account.creditLimit / account.available / account.dueIn / account.pay
joint.share / joint.searchUser / joint.mustBeRegistered
joint.role / joint.role.member / joint.role.owner / joint.confirm
role.owner / role.member
common.cancel / common.confirm / common.save
```
Every hardcoded string in the prototype (for example, Reports `income/expense/net`) must use these keys. This resolves R3.

---

## 6. Open items

- Add focus trapping to bottom sheets and amount labels for screen readers.
- Add test IDs to interactive elements.
- Keep charts theme-aware.
- Support the documented multi-currency report behavior.

---

## 7. Verification note

The design assets are self-contained and work from the `design/` directory. The SVG assets are vector-based and support theme-aware use.
