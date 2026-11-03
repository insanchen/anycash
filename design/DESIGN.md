---
version: alpha
name: "AnyCash: Sage & Sand"
description: Calm, earthy personal-finance design system for AnyCash (Next.js + Tailwind CSS). Light + Dark, WCAG AA, bilingual (EN/ID). All color values map to CSS variables; never hardcode raw hex in components.
colors:
  # ---- LIGHT (default) ----
  background: "#FAFAF8"
  surface: "#FFFFFF"
  border: "#E8EAE6"
  primary: "#4A6B53"
  primary-foreground: "#FFFFFF"
  secondary: "#EAECE8"
  secondary-foreground: "#2D3A31"
  income: "#4A6B53"
  expense: "#1A1C1A"
  destructive: "#A8472A"
  destructive-foreground: "#FFFFFF"
  text-main: "#1A1C1A"
  text-muted: "#5C6A60"
  focus-ring: "#4A6B53"
colorsDark:
  # ---- DARK (Tailwind `dark:` variant) ----
  background: "#14171A"
  surface: "#1E2226"
  border: "#2E3338"
  primary: "#7FA386"
  primary-foreground: "#14171A"
  secondary: "#2A2F2C"
  secondary-foreground: "#D7E0D9"
  income: "#8FBF97"
  expense: "#EDEFEA"
  destructive: "#E08A6A"
  destructive-foreground: "#14171A"
  text-main: "#EDEFEA"
  text-muted: "#9AA69C"
  focus-ring: "#7FA386"
typography:
  h1:
    fontFamily: Outfit
    fontSize: 2.25rem
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  h2:
    fontFamily: Outfit
    fontSize: 1.5rem
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  h3:
    fontFamily: Outfit
    fontSize: 1.25rem
    fontWeight: 500
    lineHeight: 1.25
  body-md:
    fontFamily: Manrope
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: Manrope
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.01em"
rounded:
  sm: 8px
  md: 12px
  lg: 16px
  card: 24px
  button: 9999px
spacing:
  page-x: 16px
  page-y: 24px
  card-pad: 24px
  gap: 24px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.button}"
    padding: 12px
    typography: "{typography.body-md}"
  button-primary-hover:
    backgroundColor: "#3A5441"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.button}"
    padding: 12px
    typography: "{typography.body-md}"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructive-foreground}"
    rounded: "{rounded.button}"
    padding: 12px
    typography: "{typography.body-md}"
  input:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.text-main}"
    rounded: "{rounded.md}"
    padding: 12px
  card:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    rounded: "{rounded.card}"
    padding: "{spacing.card-pad}"
  transaction-income:
    textColor: "{colors.income}"
  transaction-expense:
    textColor: "{colors.expense}"
  input:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.text-main}"
    borderColor: "{colors.border}"
    focusRing: "{colors.focus-ring}"
    rounded: "{rounded.md}"
    padding: 12px
  label-muted:
    textColor: "{colors.text-muted}"
    typography: "{typography.body-sm}"
  role-badge:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.button}"
    padding: 4px
    typography: "{typography.body-sm}"
  bottom-nav:
    backgroundColor: "{colors.background}"
    rounded: "{rounded.lg}"
    padding: 12px
---

## Overview

AnyCash is a privacy-focused personal finance tracker for individuals and families.
The visual identity, Sage & Sand, is calm and earthy: a muted sage green as the only
interaction color, warm off-white canvases, and large rounded surfaces. It deliberately
avoids the aggressive style common in fintech products.

Design principles:
1. Clarity comes before decoration. Numbers get the most attention; other interface elements stay quiet.
2. Mobile-first: bottom navigation below 768px; sticky top nav on desktop.
3. Bilingual by default: every user-facing string is a `t(...)` key with `en` + `id`.
4. Accessibility is always required. WCAG AA is the minimum (contrast ≥4.5:1, visible focus, keyboard-operable).

## Colors

- Primary is Sage `#4A6B53` (dark: `#7FA386`). It is the only high-emphasis color
  and is used for primary actions, active nav, income values, and brand.
- Surface is `#FFFFFF` (dark: `#1E2226`) on Background `#FAFAF8`
  (dark: `#14171A`), a warm, low-glare canvas.
- Secondary is `#EAECE8` (dark: `#2A2F2C`), used for neutral fills on inputs, badges, and chips.
- Income is `#4A6B53` and Expense is `#1A1C1A` (dark: `#8FBF97` and `#EDEFEA`).
  These semantic transaction colors are never reversed.
- Destructive is `#A8472A` (dark: `#E08A6A`). The palette uses this terracotta
  instead of the prototype's `#C27359`, which failed AA at 3.3:1. It now passes 4.5:1 in both themes.
- Text is main `#1A1C1A` (dark: `#EDEFEA`) and muted `#5C6A60` (dark: `#9AA69C`).

All colors resolve through CSS variables (`--color-*`) in `globals.css`, and components
reference the variable instead of the hex value. Dark mode is the Tailwind `dark:` variant
that swaps the variable set. This keeps raw hex out of components and makes reports and
charts theme-aware (fixes prototype R8).

## Typography

- Outfit for headings: friendly and sturdy.
- Manrope for body and UI: highly legible at mobile sizes.
- Base body is 16px. Never go below 14px for body text.

## Layout

- Mobile-first: fixed bottom nav (glassmorphism) below 768px; sticky top nav
  on desktop. Container `max-w-5xl mx-auto`.
- Page padding `px-4 py-6` → `md:px-8 md:py-10`. Card padding `p-5 md:p-6`.
- Dashboard grid: `grid-cols-1 md:grid-cols-12 gap-6`.

## Elevation and depth

- Cards have a 1px subtle border and a soft ambient shadow
  `0 8px 24px rgba(0,0,0,0.04)`.
- Header and bottom nav use glassmorphism (`backdrop-blur-xl`, 80 to 90% bg, hairline border).
- On hover, cards lift with `-translate-y-1`. On tap, interactive elements scale to 98%.

## Shapes

- Cards use `rounded-2xl` or `rounded-3xl`; buttons use `rounded-full`; inputs use `rounded-xl`.
- Icons: `lucide-react`, `strokeWidth={1.5}`.

## Components

- button-primary: the single high-emphasis action per view.
- input: a neumorphic touch (secondary fill, no border, sage focus ring).
- card: the standard content container (account cards, summary tiles, lists).
- role-badge: the `Owner` / `Member` pill on joint-account shares.
- bottom-nav: 5 destinations (Dashboard, Transactions, Reports, Accounts, Settings).

## Do's and don'ts

- Map every color to a CSS variable. Do not hardcode hex in components.
- Keep one primary action visible per screen. Do not use red for anything except destructive actions.
- Provide `t(...)` keys (en+id) for every string. Do not bake copy into JSX.
- Verify contrast in both themes. Do not ship a color that only passes in light.
