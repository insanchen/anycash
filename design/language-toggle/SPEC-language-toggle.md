# AnyCash: Language Toggle (EN/ID) UI Specification

**Date:** 2026-07-28

---

## 1. Summary

The i18n framework already exists (`lib/i18n`, `useLocale`, `t()`, `locale` cookie,
and `PUT /api/settings/locale`). The missing pieces are:

1. A persistent toggle UI. The app currently has only a small `locale.toUpperCase()`
   text button in `BottomNav`, and it is not wired to the cookie API (see the bug in §3).
2. Cookie-backed persistence end to end. `setLocale` currently writes only to
   `localStorage`, while the server reads the cookie. The choice does not survive a
   reload and can cause a hydration mismatch.
3. All strings use `t()`. Many screens still hardcode literals in mixed ID/EN.

---

## 2. Two variants

Both variants are built. They use the Sage & Sand palette and were visually checked in a browser.

| File | Variant | Stance | Where it lives | Best for |
|------|---------|--------|---------------|----------|
| `design/language-toggle/ideal-segmented.html` | **Ideal** | Segmented ID/EN pill inside **Settings** (mirrors the existing Theme/Rate-source rows) + a compact header globe pill for quick access | Settings page row + header | Clear, discoverable, matches the app's existing control language |
| `design/language-toggle/lean-header-pill.html` | **Lean** | Single globe pill in the header showing current lang (tap to swap); no Settings row | Header only | Smallest footprint; good if Settings space is tight |

Choose the preferred placement. Do not ship both as separate competing controls.

> Note: the `tokens.css` in this folder mirrors `design/globals.css`. Keep them in
> sync if tokens change. Components must use CSS variables instead of raw hex values
> (per DESIGN.md §colors).

---

## 3. The persistence bug (must fix before "done")

**Root cause chain:**
- `lib/i18n/client.tsx`: `setLocale(next)` writes only to `localStorage.setItem('locale', next)`.
- The server reads the **cookie**. `lib/i18n/get-locale.ts`: `getLocale()` calls `cookies().get('locale')`.
- `app/layout.tsx` and `components/ClientShell.tsx` never pass `initialLocale` from the cookie
  into `LocaleProvider`, so the SSR and initial client render use `DEFAULT_LANGUAGE = 'id'`.
- The API `PUT /api/settings/locale` already exists and sets the `locale` cookie (httpOnly,
  1-year). Nothing calls it yet. `BottomNav` calls the localStorage-only `setLocale`.

**Result:** choosing EN updates the client state. On reload, the server renders `id`
from the cookie, so the UI flips back and risks a hydration mismatch warning.

**Fix:**
1. In `lib/i18n/client.tsx`, make `setLocale` also send `PUT /api/settings/locale`
   (fire-and-forget) so the cookie is set. Keep the `localStorage` write as an
   optimistic UI fast path.
2. In `app/layout.tsx` (or a server component wrapper), read `getLocale()` and pass
   `initialLocale` to `<ClientShell initialLocale={...} />` (ClientShell already accepts it).
3. Keep `aria-pressed` / `aria-label` for accessibility; the focus ring is `var(--color-focus-ring)`.

**Acceptance:** set EN, reload, and the UI stays in EN. There is no hydration warning,
and the server-rendered HTML contains `lang="en"`.

---

## 4. Component spec: segmented control (Ideal)

```
[ 🇮🇩 ID ]  [ 🇬🇧 EN ]      <- pill group, one pressed at a time
```

- **Markup:** `role="group" aria-label={t('settings.language')}`, two `<button>`
  with `aria-pressed`. Use `🇮🇩`/`🇬🇧` flag emoji and an `ID`/`EN` label.
- **State:** controlled by `useLocale().locale` and `setLocale`.
- **Style:** reuse the `.seg` pattern from `tokens.css` (secondary track, primary fill on
  pressed, pill radius `9999px`, focus-visible 3px ring). Do not add new color tokens.
- **Placement:** on the Settings page, as a row above or below Theme, using the same `row` layout.
- **Header globe pill:** shows a globe and the current code (`ID`/`EN`). Tap it to swap.
  It calls the same `setLocale` and uses `aria-label={t('settings.language.toggle')}`
  (add this key; see §5).

---

## 5. String coverage audit (the "all strings use t()" requirement)

### 5a. Missing i18n keys to add (en.json + id.json)

These are used in the spec but not yet in the dictionaries:

```
settings.language            { "id": "Bahasa",        "en": "Language" }
settings.language.desc       { "id": "Pilih bahasa antarmuka. Pilihan disimpan di perangkat ini.",
                               "en": "Choose the interface language. Saved on this device." }
settings.language.toggle     { "id": "Ganti bahasa",  "en": "Change language" }
```

(Add them under the existing `settings` object in both JSON files.)

### 5b. Hardcoded strings found (file, line, and fix)

**DashboardShell.tsx** (critical: the nav is hardcoded in Indonesian and ignores the user's locale):
- Lines 5 to 10: `label: 'Dasbor' | 'Akun' | 'Transaksi' | 'Laporan' | 'Pengguna' | 'Pengaturan'`
  should use `t('nav.dashboard')` and so on. The `nav.*` keys already exist in both dictionaries
  (they are `{id,en}` objects; `t()` resolves by active locale). Replace the literal array
  with `i18n` keys. Also, the `<h1>{t('id','nav.dashboard')}</h1>` at line 17 hardcodes `'id'`.
  Change it to `t('nav.dashboard')` to use the active locale.

**app/dashboard/page.tsx** (server component, Indonesian literals):
- Line 73: `Total saldo` becomes `t('dash.totalBalance')`.
- Line 77: `Jumlah akun` needs a new key, `dash.accountCount` (or reuse an existing key).
  Add `{"id":"Jumlah akun","en":"Accounts"}`.
- Line 81: `Transaksi terakhir` needs a new `dash.recentTxn` key.
- Line 88: `Akun` becomes `t('nav.accounts')` or `dash.accounts`.
- Line 101: `Belum ada akun. Buat akun dulu dari menu Akun.` needs a new `dash.noAccounts` key.
- Line 107: `Aktivitas terbaru` needs a new `dash.recentActivity` key.
- Line 122: `Belum ada transaksi.` needs a new `dash.noTransactions` key.
  (This is a server component, so it must read `getLocale()` from cookies and call `t(locale, key)`.)

**app/(auth)/login/page.tsx** (English literals, no `useLocale`):
- Line 46: `Sign in to continue` needs a new `login.subtitle` key (`{id:"Masuk untuk melanjutkan","en":"Sign in to continue"}`).
- Lines 50 and 66: `Email` and `Password` should use `t('login.email')` and `t('login.password')`.
  These keys exist, but both dictionaries need `.en` and `.id` entries. The current `login.email`
  is a flat string, so align it to `{id,en}`.
- Line 88: `Signing in…` and `Sign in` should use `t('login.submit')`, which exists.
- The component must be wrapped in `'use client'` and use `useLocale`, or read the cookie on the server.

**SettingsClient.tsx** (mixed EN/ID literals):
- Line 86: the `Pilih sumber kurs...` helper text needs a new `settings.rateSource.desc` key.
- Line 169 `API Keys`, line 182 `No API keys yet.`, line 273 `Backup`, line 274 `Download your current data...`,
  line 276 `Download backup`, line 278 `Choose backup file...`, line 283 `Preview`, line 284 `Restore`,
  line 289 `Restore preview`, lines 290 to 294 `Total payload tables:` and similar, line 295 `This restore would...`,
  line 423 `Categories`, line 432 `Add custom categories...`, line 436 `Add custom category`,
  and line 492 `Kategori tidak ditemukan...` all need keys. Most are English, so add ID too.
- Lines 317, 350, 361, 379, 393, 399, and 409 have Indonesian literals (`Tidak bisa memuat kategori`,
  `Nama kategori wajib diisi`, `Gagal menambah/mengupdate/hapus kategori`, `Hapus kategori ini?`).
  They need `settings.cat.*` keys.

**AccountsClient.tsx**:
- Lines 93, 95, 97, and 98 have Indonesian validation messages, and lines 135 and 166 have
  `Gagal menambah/menghapus transaksi`. These need `account.*` keys (some exist as
  `account.form.*`; align them).

**TransactionsClient.tsx**:
- Lines 93, 95, 97, 98, 135, 158, 166, and 196 have literals: `Pilih akun dahulu.`,
  `Jumlah harus angka bulat...`, `Kategori tidak sesuai...`, `Format tanggal tidak valid.`,
  `Gagal menambah/menghapus transaksi`, `Hapus transaksi ini?`, and `Semua akun` (an option).
  They need `txn.*` keys.

> Note: server-error fallbacks such as `json.error || 'Gagal menyimpan.'` can stay hardcoded,
> but prefer `tf('key', 'fallback')` so EN users see English.

### 5c. Already correct (no change)
- `BottomNav` uses `t(labelKey)` for nav labels. It only needs the persistence fix in §3.
- `DashboardClient.tsx` uses `tx(...)`, though it is a near-empty placeholder page.
- The `ReportsClient` and `AccountsClient` forms use `tf('account.form.*')` for validation.

---

## 6. a11y (WCAG AA, per DESIGN.md)
- The toggle uses `role="group"` and `aria-pressed` buttons; the header pill uses `aria-label`.
- The focus ring uses `--color-focus-ring` (≥3px, visible in both themes).
- Flag emoji are decorative (`aria-hidden`); the text label carries the meaning.
- Contrast: primary `#4A6B53` on white is 4.7:1, which passes AA. Dark primary `#7FA386` on `#14171A` also passes.

---

## 7. Implementation checklist
- [ ] §3 persistence fix (cookie API and `initialLocale` from the layout)
- [ ] §4 segmented control component and header pill (wire both to the same `setLocale`)
- [ ] §5a add the 3 missing keys to en.json and id.json
- [ ] §5b sweep the hardcoded strings in the 6 files listed (use `t()` or `tf()`)
- [ ] Verify: set EN, reload, and it stays in EN with no hydration warning, and `<html lang="en">` is present.
- [ ] Verify both themes render the toggle correctly

## 8. Product decision
Primary placement: Ideal (Settings row and header shortcut) or Lean (header only).
