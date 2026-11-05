# Kosha

Personal finance tracker: a TanStack Start app on one Cloudflare Worker with a D1 (SQLite) database. `README.md` is the user-facing guide to features and setup. This file covers how the code fits together and the rules it depends on.

## Where things live

- `src/lib/core.ts`: pure helpers shared by client and server, covering money, dates, categorising and subscription schedules. Put new logic here when it has no I/O, so it can be tested.
- `src/lib/api.ts`: every server function (`createServerFn` with a zod validator). Pages call these, never the database.
- `src/server/db.server.ts`: database helpers, exchange rates, subscription settling and transfer legs. `src/server/auth.server.ts`: Better Auth setup and `userId()`.
- `src/routes/_app/*`: signed-in pages. `src/routes/_app.tsx` owns the app-wide `month` and `currency` search params and loads `getMeta()` once for every page. `/login` sits outside `_app`, so it loads no account data.
- `src/components/ui/*`: shadcn/ui components on Base UI. App components sit beside them in `src/components/`.
- `migrations/`: numbered D1 migrations. To change the schema, add the next numbered file. Production has applied `0001_init.sql`, so never edit a migration that is already in the repo. `npm run deploy` applies pending migrations before it deploys, so keep each migration compatible with the code currently running.
- `scripts/`: Node scripts run directly as TypeScript. They cover the Cashew import and the demo seed.
- `src/routeTree.gen.ts` and `worker-configuration.d.ts` are generated. Regenerate them with `npm run generate-routes` and `npm run cf-typegen`.

## Data rules

These invariants hold across the codebase. Breaking one gives wrong totals without any error.

- **Every query is scoped by `user_id`, including joins.** Each data table's primary key is `(user_id, id)`, so ids are only unique per user. A join on `id` alone mixes users' data. Only the `rates` table is shared.
- **Amounts are integer cents, and the sign is the direction** (negative means money out). Parse user input with `parseAmount` and format with `fmt`.
- **Timestamps are unix seconds. Days and months are strings in the user's time zone** (`YYYY-MM-DD`, `YYYY-MM`). Convert with `dayOf`, `unixOf` and `monthRange`, not with `Date` arithmetic.
- **Category `0` (corrections) and `transfer` are neutral.** Income and spending totals leave them out, using `isNeutral` or `NEUTRAL_SQL`. `transfer_fee` is a system category too, but it counts as spending. See `isSystemCategory`.
- **A transfer is two rows linked by `transfer_id`**, one out and one in, each in its own account's currency. Keep both rows in sync on every create, edit and delete.
- **Subscriptions are schedules, not rows.** Upcoming payments are computed from the schedule. A transaction row is written only when a payment is paid, edited or skipped. Due payments are settled when the app loads (`ensureSettled`), and there is no cron job.
- **Exchange rates are stored as units per 1 USD** and refresh at most once a day from the fawazahmed0 currency API. Convert with `convert(cents, from, to, rates)`.
- **Net worth depends on account type** (bank, credit card, investment). Use `accountWorth` and `netWorth` rather than summing balances.

## UI conventions

- Icons come from Phosphor (`@phosphor-icons/react`). Category icons map the stored emoji to a Phosphor icon in `category-icon.tsx`.
- Colours come from the theme tokens in `src/styles.css`. Light and dark mode must both work. Dark mode is the `.dark` class on `<html>`.
- Confirmations (delete, end subscription) use the `Dialog` component.
- Use real `<button>` and `<a>` elements. Give icon-only buttons an `aria-label`, and give segmented toggles `aria-pressed`. Touch targets on phones are at least 44px.
- Toasts use `sonner`. Charts use Recharts through `components/ui/chart.tsx`.

## Checking your work

Before you finish, run all five. Each one must pass.

- `npm test` runs `src/lib/core.test.ts`, a plain `node:assert` self-check. When you change logic in `core.ts` or `quick-add.ts`, add asserts there.
- `npm run typecheck` type-checks with tsrs, the Rust port of the TypeScript 7 checker. There is no `typescript` package in this repo.
- `npm run lint` runs oxlint. Fix any new error. The React warnings (`purity`, `set-state-in-effect`, `static-components`, `immutability`, `exhaustive-deps`) are known, so leave them unless you are changing that code.
- `npm run format` formats with oxfmt, which also sorts Tailwind classes. `npm run check` verifies the formatting.
- `npm run knip` must report nothing. If it flags a dependency, file or export you just stopped using, delete it. Code in `src/components/ui/` comes from shadcn, so knip ignores its unused exports.
- To check the app in a browser, sign in as `demo@kosha.local` with the password `kosha-demo-2026`. Run `npm run db:demo` to reset it. Never use or screenshot real account data.

## Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org): `type(scope): subject`, with a header of 100 characters or fewer. The scope is optional, and `!` after the type or scope marks a breaking change. The types are `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore` and `revert`.

Git hooks in `.githooks/` enforce this. `npm install` turns them on through the `prepare` script. `pre-commit` runs `npm run check` and `npm run lint`, and `commit-msg` checks the header. If a hook fails, fix the cause and commit again.

## Code style

- Write comments that explain why. Keep them short and put them above the code they describe.
- When you take a deliberate shortcut with a known limit, mark it with a `ponytail:` comment that names the limit, e.g. `// ponytail: unknown currency passes through unconverted`.
