<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/wordmark-dark.svg">
    <img src=".github/assets/wordmark-light.svg" alt="kosha" height="64">
  </picture>
</p>

<p align="center">A personal finance tracker for people with money in more than one place and more than one currency.</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/screenshot-dark.png">
    <img src=".github/assets/screenshot-light.png" alt="Kosha overview: net worth, spending so far this month against your usual pace, where the money went, and bills that need attention">
  </picture>
</p>

Kosha (कोश, "treasury") keeps every account in one place: bank accounts, cash, credit cards and investments, in any currency. On a phone it is a quick-entry app you can install from the browser. On a desktop it is a dashboard that shows where your money went and where it stands.

## What it does

- **Net worth across currencies.** Totals convert at daily exchange rates. Credit cards count what you owe, and investments count what you put in plus their latest gain.
- **This month at a glance.** Spending so far against your usual pace, a projection to the end of the month, and the bills still to pay.
- **Fast entry.** Type one line, like `12.50 groceries yesterday`, and Kosha fills in the amount, category, date and account. Categories are also guessed from payees you have entered before.
- **Subscriptions and bills.** Set a schedule once. Payments are recorded when they fall due, and you can skip or edit a single one.
- **Transfers and currency exchange.** Moving money between your own accounts never counts as spending. For exchanges through Wise or similar, Kosha shows the fee and the cost of the provider's rate against the market rate.
- **Private by design.** Each person's data is separate. Sign in with a password or a passkey, with optional two-factor codes.
- **Import from Cashew.** Bring over accounts, categories, transactions and recurring payments.

## Run it locally

You need Node.js 22.18 or later, because the scripts run TypeScript files directly.

```sh
npm install
npm run db:migrate   # create the local D1 database
npm run db:demo      # optional: a demo account with sample data
npm run dev          # http://localhost:3000
```

Create `.dev.vars` with three values:

```sh
BETTER_AUTH_SECRET=   # 32+ random characters, e.g. from `openssl rand -hex 32`
BETTER_AUTH_URL=http://localhost:3000
AI_KEY_SECRET=        # 32+ random characters; encrypts AI provider keys (Settings › AI)
```

The demo account is `demo@kosha.local` with the password `kosha-demo-2026`. It has about 14 months of invented data. Running `npm run db:demo` again resets it. The password is public, so only seed it locally.

`npm test` runs the self-checks for money parsing, time zones, categorising and subscriptions. `npm run typecheck` (tsrs), `npm run lint` (oxlint), `npm run check` (oxfmt) and `npm run knip` (unused code and dependencies) check the rest.

## Deploy to Cloudflare

Kosha runs on a single Cloudflare Worker with a D1 database. Production is at https://kosha.amruth-pillai.workers.dev, and every push to `main` deploys it through Workers Builds.

`npm run deploy` builds the app, applies new D1 migrations, then deploys the Worker. Workers Builds runs the same command.

To set up your own copy:

```sh
npx wrangler d1 create kosha                  # copy the database_id into wrangler.jsonc
npx wrangler secret put BETTER_AUTH_SECRET    # 32+ random characters
npx wrangler secret put AI_KEY_SECRET         # 32+ random characters; changing it makes saved AI keys unreadable
npm run deploy
```

Before you deploy, set these under `vars` in `wrangler.jsonc`:

- `BETTER_AUTH_URL`: the public URL of the app. Passkeys only work on this domain.
- `ALLOWED_EMAILS`: a comma-separated list of who may sign up. Leave it empty to let anyone sign up.

To deploy on every push, connect the repository under the Worker's **Settings → Build**. Use `npm run deploy` as the deploy command and leave the build command empty. The build token needs **D1: Edit** for the migration step, which the token Cloudflare creates by default does not have.

## Import from Cashew

Sign up first, then import a Cashew backup into that account:

```sh
npm run import:cashew -- ~/path/to/cashew-backup.sql you@example.com > import.sql
npx wrangler d1 execute kosha --local --file import.sql    # or --remote
```

Running the import again updates accounts in place and keeps their type, credit limit and gains. Recurring transactions become subscriptions, and transfer pairs are linked.

## How things are counted

| Account type | Its balance means    | Net worth counts                              |
| ------------ | -------------------- | --------------------------------------------- |
| Bank or cash | money in the account | the balance                                   |
| Credit card  | credit left to spend | balance minus the credit limit (what you owe) |
| Investment   | money put in         | balance plus the latest recorded gain         |

- **Gains:** on **Accounts**, use **Update gains** and enter either today's value from your broker or the gain itself. Gains are kept as a dated history, so the net worth chart moves on the day you record each one.
- **Transfers** are two linked rows, one out and one in. When the currencies differ, each side keeps its own amount. An exchange fee is saved as its own expense under **Transfer fees**.
- **Recurring transfers** with a fixed amount are recorded automatically. If the amount changes each time, Kosha lists it as due and asks you for the amount.
- **Subscriptions:** editing a subscription changes only future payments. Deleting a paid payment marks it as skipped, so it is not added back.

Not built yet: bank statement reconciliation and offline entry.

## Built with

TanStack Start (React 19, Vite), shadcn/ui on Base UI, Tailwind CSS 4, Recharts, Better Auth, and Cloudflare Workers with D1.
