# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Anyone who wants to know where their money goes, whether they have one bank account and a card or accounts, cards and investments in several currencies. They log spending on their phone as it happens and review the month on a desktop.

## Product Purpose

Kosha is a personal finance tracker. It keeps every account in one place, converts totals at daily exchange rates, and answers one question each month: how is this month going compared with a usual one. Success is a person who records entries in seconds and trusts the totals.

## Positioning

Built around the habit of writing each payment down as it happens: entry takes seconds, and the month makes sense at a glance. Multi-currency is one capability among many, never the headline. Net worth respects account types (credit cards count what is owed, investments count their latest gain), transfers and currency exchanges never count as spending, and exchange costs are shown against the market rate. Entry is one line of text (`12.50 groceries yesterday`) or an amount-first phone screen.

## Operating Context

- Phone: an installable web app (PWA) opened to `/add` for quick entry.
- Desktop: Overview, Activity, Recurring and Accounts, with a global month and display currency.
- AI assistants (Claude, ChatGPT, Cursor) and scripts reach the same data through a REST API and an MCP server.

## Capabilities and Constraints

- Accounts, categories, tags, events, subscriptions and bills, transfers, currency exchange, Cashew import, bank statement import (CSV, OFX, QFX) and reconciliation, spotting recurring payments, REST API and MCP.
- Optional AI with the user's own provider key: auto-categorise, natural-language add, receipt scanning, a monthly recap and Ask Kosha. Each can be turned off, and an off feature leaves no trace.
- Sign in with a password or passkey, optional two-factor codes. One account per person.
- Runs on one Cloudflare Worker with a D1 database. Production is https://getkosha.app.

## Brand Commitments

- Name: Kosha (कोश, Sanskrit for treasury). Tagline: "Personal finance, a few seconds at a time." (since 2026-11-07, when the owner asked that the tagline stop centring multi-currency; it replaced "Every account. Every currency. One treasury.")
- Symbol: a K whose arm is a coin. Peacock `#0F524E`, marigold `#F4A62A`, paper `#F3F5F0`. Wordmark: lowercase "kosha", Bricolage Grotesque Bold.
- Inside the app, brand colours appear only in the mark. Marketing surfaces (the landing page) may use peacock and marigold as grounds (confirmed by the owner, 2026-11-06).
- Source code: github.com/amruthpillai/kosha, public and MIT licensed (`LICENSE`). The hosted service has a privacy policy at `/privacy` and terms at `/terms` (`src/routes/`); update them when what the app stores or sends changes.

## Evidence on Hand

- Brand kit and banners: `design/brand/` in the main checkout. Redesign renders: `design/redesign/screens/png/`.
- A demo account (`demo@kosha.local`) with invented data, safe to screenshot.
- No testimonials, customer counts, press or benchmarks exist. Never invent them.

## Product Principles

- Entry must take seconds; guesses from history fill the rest.
- Totals must be right before they are pretty: neutral categories, transfers and account types are respected everywhere.
- Plain words. Say what a number means.
- Everything in the app is also reachable from the API.
