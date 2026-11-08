---
name: Kosha
description: Jot down what you spent. Know where it went.
colors:
  background: "#f6f6f4"
  foreground: "#111113"
  card: "#ffffff"
  popover: "#ffffff"
  primary: "#111113"
  primary-foreground: "#f6f6f4"
  secondary: "#f0f0ed"
  muted: "#f0f0ed"
  accent: "#f0f0ed"
  selected: "#ebebe7"
  muted-foreground: "#6b6b73"
  subtle-foreground: "#46464d"
  border: "#e4e4e0"
  input: "#e4e4e0"
  ring: "#6b6b73"
  destructive: "#b42318"
  warning: "#b45309"
  positive: "#0f766e"
  brand: "#0f766e"
  brand-foreground: "#ffffff"
  chart-1: "#0f766e"
  chart-2: "#1c1c1f"
  chart-3: "#6b6b73"
  chart-4: "#cfcfca"
  chart-5: "#e4e4e0"
  series-1: "#2a78d6"
  series-2: "#e87ba4"
  series-3: "#eda100"
  series-4: "#6250d6"
  series-5: "#eb6834"
  series-6: "#1baf7a"
  auth-panel: "#0f524e"
  peacock: "#0f524e"
  marigold: "#f4a62a"
  paper: "#f3f5f0"
  ink: "#111113"
  ink-deep: "#050506"
  chalk: "#f3f3f4"
  peacock-night: "#0c1716"
  marigold-light: "#f7b648"
typography:
  page-title:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  label:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "13px"
    fontWeight: 500
  caption:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  figure:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  hero-figure:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.035em"
    fontFeature: "tnum"
  display:
    fontFamily: "Bricolage Grotesque Variable, Geist Variable, sans-serif"
    fontSize: "clamp(2.5rem, 5.6vw, 5rem)"
    fontWeight: 700
    lineHeight: 0.92
    letterSpacing: "-0.04em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  2xl: "18px"
  3xl: "22px"
  4xl: "26px"
spacing:
  gutter-phone: "16px"
  gutter-desktop: "32px"
  card: "24px"
  card-sm: "20px"
  card-phone: "16px"
  card-compact: "14px"
  boxed-max: "1240px"
  landing-max: "1280px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "0 10px"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: "32px"
  input:
    backgroundColor: "transparent"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "4px 10px"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.xl}"
    padding: "{spacing.card}"
  dialog:
    backgroundColor: "{colors.popover}"
    rounded: "{rounded.xl}"
    padding: "16px"
  setting-row:
    backgroundColor: "{colors.card}"
    padding: "16px 20px"
    height: "64px"
  button-auth:
    rounded: "{rounded.xl}"
    height: "46px"
    padding: "0 16px"
  button-landing:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.xl}"
    height: "48px"
    padding: "0 20px"
---

# Design System: Kosha

The design system as it exists in the code. Every value here is read from the source; when the two disagree, the code wins and this file needs fixing. `src/styles.css` holds every token. `PRODUCT.md` holds the brand commitments. `AGENTS.md` holds the engineering rules this file leans on.

## Overview

**Creative North Star: "The quiet ledger."** The app is a calm, near-monochrome workspace where the numbers are the loudest thing on screen. Warm off-white and near-black do almost all the work. Colour appears only when it means something: teal for positive or the user's accent, red for destructive, amber for warning, and a fixed palette for account series in charts.

Kosha has three surfaces, and each has its own rules:

| Surface            | Mode     | Files                                                                                      | Character                                                                 |
| ------------------ | -------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| The app (`_app`)   | Operate  | `src/routes/_app/*`, `src/components/*`, `src/components/ui/*`                             | Neutral tokens, dense, Geist, the brand only in the mark                  |
| Landing page (`/`) | Persuade | `src/components/landing.tsx`, `landing-demos.tsx`, `landing-checks.tsx`                    | Peacock, marigold and paper as full-bleed grounds, Bricolage display type |
| Sign-in pages      | Operate  | `src/components/auth.tsx`, `src/routes/{login,forgot-password,reset-password,consent}.tsx` | App tokens plus a peacock brand panel                                     |

`/privacy` and `/terms` (`src/components/legal.tsx`) use the app's tokens with Bricolage headings. See [Surfaces](#surfaces).

**Key characteristics:**

- Warm neutral page grounds (`#f6f6f4` / `#0b0b0c`), with cards a step lighter (`#ffffff` / `#131315`).
- Money is set in Geist Mono with tabular figures, so columns line up.
- Flat surfaces separated by 1px borders. Shadows are for things that float.
- Phone and desktop are different layouts, split at `md` (768px), not one layout squeezed.
- Every animation has a reduced and an off state.

## Colors

The app palette is neutral with semantic accents. Dark mode is the `.dark` class on `<html>`, set before first paint by `themeScript` in `src/lib/theme.ts`. The `dark:` variant is `&:is(.dark *)` (`styles.css:9`). Both modes must work for every screen.

### App tokens (`styles.css:82-167`)

| Token                            | Light                                                       | Dark                                                        | Use                                                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `background`                     | `#f6f6f4`                                                   | `#0b0b0c`                                                   | Page ground                                                                                                                                                       |
| `foreground`                     | `#111113`                                                   | `#f3f3f4`                                                   | Body text                                                                                                                                                         |
| `card` / `popover`               | `#ffffff`                                                   | `#131315`                                                   | Cards, dialogs, menus, header bar, tab bar                                                                                                                        |
| `primary`                        | `#111113`                                                   | `#f3f3f4`                                                   | Main buttons, the phone Add button. Ink, not a hue                                                                                                                |
| `primary-foreground`             | `#f6f6f4`                                                   | `#0b0b0c`                                                   | Text on `primary`                                                                                                                                                 |
| `secondary` / `muted` / `accent` | `#f0f0ed`                                                   | `#1c1c1f`                                                   | Hover fills, skeletons, active nav, segmented tracks                                                                                                              |
| `selected`                       | `#ebebe7`                                                   | `#232327`                                                   | A chosen row in a list (`aria-pressed:bg-selected`)                                                                                                               |
| `muted-foreground`               | `#6b6b73`                                                   | `#90909a`                                                   | Secondary text, axis labels, captions                                                                                                                             |
| `subtle-foreground`              | `#46464d`                                                   | `#bdbdc4`                                                   | Text between body and muted: group labels, category icons, quiet buttons                                                                                          |
| `border` / `input`               | `#e4e4e0`                                                   | `#27272b`                                                   | Every hairline and field stroke                                                                                                                                   |
| `ring`                           | `#6b6b73`                                                   | `#90909a`                                                   | Focus rings, used at 50% (`ring-ring/50`)                                                                                                                         |
| `destructive`                    | `#b42318`                                                   | `#f87171`                                                   | Delete, errors. Buttons use it as a 10% tint, not a solid fill                                                                                                    |
| `warning`                        | `#b45309`                                                   | `#f59e0b`                                                   | Warnings, the warning `Pill`                                                                                                                                      |
| `positive`                       | `#0f766e`                                                   | `#2dd4bf`                                                   | Money in, gains, good news. Also the text selection tint (22%)                                                                                                    |
| `chart-1` to `chart-5`           | `#0f766e` `#1c1c1f` `#6b6b73` `#cfcfca` `#e4e4e0`           | `#2dd4bf` `#ececee` `#90909a` `#3b3b41` `#27272b`           | Chart marks: positive, ink, then greys. `hatch` (`styles.css:12`) draws unrealised gains in `chart-2`                                                             |
| `series-1` to `series-6`         | `#2a78d6` `#e87ba4` `#eda100` `#6250d6` `#eb6834` `#1baf7a` | `#3987e5` `#d55181` `#c98500` `#9085e9` `#d95926` `#199e70` | One colour per account in the net worth chart, in this fixed order (`accounts.tsx:119`). No green early, because green means positive. Always shown with a legend |

### The user's accent: `brand`

`--brand` is the accent picked in Settings › Appearance (`PREFS.accent` in `core.ts`). It is **not** shadcn's `--accent`, which is the hover fill. It colours switches when on, native checkboxes and ranges (`accent-color` on `<html>`), setting hints, the brand `Pill`, and the flash on a deep-linked row (`--brand-soft`, 13% of brand).

| Accent           | Light     | Dark      |
| ---------------- | --------- | --------- |
| `teal` (default) | `#0f766e` | `#2dd4bf` |
| `blue`           | `#2563eb` | `#60a5fa` |
| `amber`          | `#b45309` | `#fbbf24` |
| `rose`           | `#be123c` | `#fb7185` |
| `graphite`       | `#27272a` | `#e4e4e7` |

`brand-foreground` is `#ffffff` in light mode and `#0b0b0c` in dark mode.

### Brand colours (`styles.css:21-24`)

| Token      | Value     | Where                                        |
| ---------- | --------- | -------------------------------------------- |
| `peacock`  | `#0f524e` | The mark's K; landing grounds; auth panel    |
| `marigold` | `#f4a62a` | The mark's coin; the landing coin shape      |
| `paper`    | `#f3f5f0` | The mark's K on dark grounds; landing ground |

**The Mark-Only Rule.** Inside the app, peacock, marigold and paper appear only in the mark (`KoshaMark` in `src/components/kosha-mark.tsx`). The landing page may use them as grounds. The sign-in brand panel uses peacock through `--auth-panel` (`#0f524e` light, `#082f2d` dark). `--auth-mark` paints the K: peacock on light grounds, paper on dark.

### Landing-page tokens (`styles.css:25-36`)

These keep their colour in both modes.

| Token                | Value                                    | Use                                                                   |
| -------------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| `ink`                | `#111113`                                | The AI and API band; the solid button on paper                        |
| `ink-deep`           | `#050506`                                | The AI band in dark mode                                              |
| `chalk`              | `#f3f3f4`                                | Text on ink                                                           |
| `peacock-night`      | `#0c1716`                                | The paper ground in dark mode; the code block on peacock (at 70%)     |
| `marigold-light`     | `#f7b648`                                | Defined, currently unused                                             |
| `shadow-window`      | `0 30px 80px -30px rgb(15 82 78 / 0.45)` | App windows lifted off a brand ground                                 |
| `shadow-window-dark` | `0 30px 80px -30px rgb(0 0 0 / 0.8)`     | Defined, currently unused                                             |
| `shadow-device`      | `0 40px 80px -30px rgb(17 17 19 / 0.6)`  | The phone                                                             |
| `shadow-chip`        | `0 12px 30px -8px rgb(17 17 19 / 0.5)`   | The entry that flies from phone to desk                               |
| `shadow-paper`       | `0 10px 30px -12px rgb(17 17 19 / 0.35)` | The paper receipt                                                     |
| `--ring-on`          | per ground                               | The ink the focus ring draws in (see [Accessibility](#accessibility)) |

## Typography

**Body font:** Geist Variable (`--font-sans`, also `--font-heading`). **Figures:** Geist Mono Variable (`--font-mono`). **Display:** Bricolage Grotesque Variable (`--font-display`), only outside the app. All three load from `@fontsource-variable` in `styles.css:4-7`.

### The app's scale

Sizes are Tailwind steps plus a few fixed pixel sizes. There is no type-scale token; reuse these.

| Role             | Size, weight, tracking                                      | Where                                                                |
| ---------------- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| Hero figure      | 32px, 40px from 700px wide; 600; `-0.035em`; `tabular-nums` | Net worth (`net-worth.tsx:129`). Geist, cents muted (`.cents-muted`) |
| Amount entry     | 48px; 500; `-0.03em`; `.num`                                | Phone `/add` (`phone-add.tsx:430`)                                   |
| Editable amount  | 34px; 500; `-0.04em`; `.num`                                | Activity panel (`activity-panel.tsx:236`)                            |
| Phone page title | 34px; 600; `-0.03em`                                        | Settings on phones (`settings/layout.tsx:81`)                        |
| Section title    | 26px; 600; `-0.025em`                                       | Settings section headers                                             |
| Page title       | 22px; 600; `-0.02em`                                        | `PageHeader` in `shell.tsx`                                          |
| Row text         | 15px                                                        | Dense list rows, phone fields                                        |
| Body             | 14px (`text-sm`)                                            | Default for cards, dialogs, settings titles (500)                    |
| Label / sub      | 13px                                                        | Page subtitles, header controls, setting descriptions, group labels  |
| Caption          | 12px (`text-xs`)                                            | The most-used size: metadata, chart labels, segmented buttons        |
| Tab label        | 11px                                                        | Phone tab bar                                                        |

Weights in the app are 400, 500 (`font-medium`, the usual emphasis) and 600 (titles and hero figures). Bold (700) and extra bold (800) belong to Bricolage on the brand surfaces. On phones, settings group labels switch to 12px uppercase with `0.06em` tracking.

### Money

**The Tabular Rule.** Every amount uses the `.num` class (`styles.css:194`): Geist Mono, `tabular-nums`, `-0.02em`. Settings › Appearance › Number font › Proportional switches `.num` to Geist, still tabular. Hero figures are the one exception: Geist with `tabular-nums`, cents in `muted-foreground`. Rolling figures use `RollingMoney` (`components/motion.tsx`). Format every amount with `fmt(cents, currency)` from `core.ts`, never by hand. Hide amounts blurs `.num` and `number-flow-react` by 6px; counts and codes opt out with `data-plain`.

### Display type (brand surfaces only)

Bricolage Grotesque, set large and tight, appears on the landing page, the sign-in pages and the legal pages. The wordmark is an outlined SVG (`KoshaWordmark`), so the logo itself loads no font.

| Use                              | Size, weight, leading, tracking                          |
| -------------------------------- | -------------------------------------------------------- |
| Landing h1                       | `clamp(2.5rem, 5.6vw, 5rem)`; 700; 0.92; `-0.04em`       |
| Landing chapter h2               | `clamp(2.5rem, 5.4vw, 4.75rem)`; 700; 0.94; `-0.035em`   |
| Landing closing h2               | `clamp(2.75rem, 6.6vw, 5.5rem)`; 700; 0.92; `-0.04em`    |
| Landing h3                       | 22px or 28px; 700; tight; `-0.02em`                      |
| Sign-in panel headline (desktop) | 52px/52px; 800; `-0.035em`                               |
| Sign-in band headline (phone)    | 32px/32px (create account 30px/30px); 800; `-0.035em`    |
| Legal h1 / h2                    | 36px (`text-4xl`), 700, `-0.03em` / 20px, 700, `-0.01em` |

## Layout

Tailwind's default breakpoints: `sm` 640px, `md` 768px, `lg` 1024px. **`md` is the phone/desktop line** and is used far more than any other (`max-md:` for phone-only, `md:` for desktop).

### App shell (`src/components/shell.tsx`)

- **Desktop (md+):** a card-coloured top bar, `px-8 py-3`, with the logo, page links (Overview, Activity, Recurring, Accounts, Ask when AI is on), the month stepper (Overview and Accounts only), the currency switch, Search (⌘K), Add and the account menu. Activity picks its dates with its own period control beside Filters.
- **Phone:** a slim top row (month stepper on Overview and Accounts, currency, Ask, account menu) and a fixed bottom tab bar, 5 columns, with the Add button in the middle (52px, `rounded-2xl`, `primary`). The tab bar is `bg-card/95` with `backdrop-blur` and respects `env(safe-area-inset-bottom)`.
- **Bare pages:** `/add`, `/ask` and Settings are full-screen on phones, with no header or tab bar. `/add` pins its keypad to the bottom.
- **Main width:** Settings › Appearance › Layout. `boxed` (default) caps `<main>` at 1240px; `full` uses the whole width.
- **Page gutters:** 16px on phones, 32px on desktop (`px-4 md:px-8`). `PageHeader` adds `pt-5 pb-5`, `md:pt-7`.
- **Bottom padding:** `5.5rem + safe area` on phones, so content clears the tab bar; 56px (`pb-14`) on desktop.

### Phone versus desktop

- **Phone `/add`** (`phone-add.tsx`): amount first, a 3-column keypad of `num` keys, `max-w-md`. Keys are `clamp(2.875rem, 6.5svh, 3.5rem)` tall on phones, 48px from `md`. Save buttons are 52px with a 14px radius.
- **Desktop Overview** (`routes/_app/index.tsx`): net worth and the month's pace side by side in a wrapping flex row, then cards. On phones a 2-column mini-stat grid replaces the desktop stat row.
- **Desktop Activity** (`routes/_app/transactions.tsx`, `activity-panel.tsx`): a list with a side panel for the selected entry. Quick add (`quick-add.tsx`) opens as a dialog from the header.
- **Settings** (`settings/layout.tsx`): desktop has a sticky rail (236–260px) and content up to 760px, inside 1240px. Phones show the section list, then push each section in as its own page.
- **Dialogs** become bottom sheets on phones through the `bottomSheet` class in `shell.tsx`.

### Density

Settings › Appearance › Density › Compact (`data-density="compact"`) makes `[data-row]` rows 36px (`min-h-9`), setting rows 48px, and card padding 14px. Cards default to 24px padding, 20px at `size="sm"`, 16px on phones.

## Elevation & Depth

The app is flat. Surfaces sit on `background` as `card` with a 1px `border`; layering comes from the tonal step between `#f6f6f4` and `#ffffff` (or `#0b0b0c` and `#131315`). Shadows appear only on things that float above the page:

| Element                   | Treatment                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| Dialog                    | `shadow-lg` + `ring-1 ring-foreground/10`, over a `bg-black/20` backdrop with `backdrop-blur-xs` |
| Popover, select, menu     | `shadow-md` + `ring-1 ring-foreground/10`                                                        |
| Account menu              | Custom two-layer shadow (`account-menu.tsx:99`)                                                  |
| Segmented, pressed option | `shadow-[0_1px_2px_rgba(0,0,0,0.1)]` on `card`                                                   |

**The Float-Only Rule.** Cards, rows and page sections never take a shadow. Only overlays and the pressed segment do.

The landing page is the exception: app windows, the phone, the flying entry and the receipt use the `shadow-*` tokens above to lift off brand grounds. In dark mode, windows drop the shadow for a `chalk/10` border.

## Shapes

The base radius is `--radius: 0.625rem` (10px). The scale multiplies it: `sm` 6px, `md` 8px, `lg` 10px, `xl` 14px, `2xl` 18px, `3xl` 22px, `4xl` 26px.

- **8px (`rounded-md`):** buttons, inputs, nav links, list rows. The most common radius.
- **14px (`rounded-xl`):** cards, setting groups, dialogs, phone keypad keys, sign-in buttons and fields.
- **18px (`rounded-2xl`):** the phone Add button, landing app windows, auth panel cards.
- **Full (`rounded-full`):** pills, avatars, the coin.
- **Segmented controls** nest radii: a 9px track with 3px padding around 7px buttons.
- Phone bottom sheets drop their bottom corners (`rounded-b-none`).

## Components

Primitives are shadcn/ui (`base-nova` style, `components.json`) on Base UI, in `src/components/ui/`: `button`, `calendar`, `card`, `chart`, `combobox`, `dialog`, `dropdown-menu`, `input`, `input-group`, `input-otp`, `label`, `popover`, `select`, `sonner`, `switch`, `textarea`. Use them before writing a new control. They import `cn` from `"cn"`; app code uses `@/lib/utils`.

### Buttons (`ui/button.tsx`)

- **Variants:** `default` (ink `primary`, 80% on hover), `outline`, `secondary`, `ghost`, `destructive` (10% red tint, red text), `link`.
- **Sizes:** `default` 32px, `sm` 28px, `xs` 24px, `lg` 36px, `icon` 32px square, plus `icon-xs`, `icon-sm`, `icon-lg`. `auth` and `auth-option` (46px, 14px radius, 52px/48px on phones) are for the sign-in pages only.
- **States:** 150ms `ease-out` on colour and scale; presses scale to 0.97 (`motion-safe`, skipped for menu triggers); focus draws a 3px `ring/50`; disabled is 50% opacity.
- **Phones:** every button is at least 44×44 (`max-md:min-h-11 max-md:min-w-11`).
- The desktop header uses `size="lg"` with 13px normal-weight text.

### Inputs (`ui/input.tsx`)

32px, 8px radius, `border-input`, transparent ground (`input/30` in dark mode). 44px tall with 16px text on phones, so iOS does not zoom; 14px from `md`. Focus matches buttons. Invalid fields use `aria-invalid` for a red border and ring. The `auth` variant is 46px on `card`.

### Cards (`ui/card.tsx`)

14px radius, 1px border, `card` ground, no shadow. Padding comes from `--card-spacing` (24px, 20px small, 16px phone, 14px compact). `CardFooter` is `bg-muted/50` with a top border.

### Dialogs (`ui/dialog.tsx`)

**The Dialog Rule.** Every confirmation (delete, end subscription) is a `Dialog`, never `window.confirm`. The popup is `popover`, 14px radius, 16px padding, `sm:max-w-sm`, with an icon-only close button labelled from `m.common_close()`. `DialogFooter` stacks buttons in reverse on phones and puts them in a muted strip on desktop. Add `bottomSheet` from `shell.tsx` to make it a sheet on phones.

### Toasts (`ui/sonner.tsx`)

`sonner`, mounted once in `routes/__root.tsx` at `top-center`. It follows the theme, uses `popover` and `border` colours and the base radius, and swaps in Phosphor icons for success, info, warning, error and loading. Settings saves report failures this way (`useSave` in `settings/saved.tsx`).

### Charts (`ui/chart.tsx`)

Recharts through `ChartContainer` and its `ChartConfig`, which maps series to colours per theme. Axis ticks are `muted-foreground`, grid lines `border/50`. Use `chart-*` tokens for marks and `series-*` for per-account colours. Wrap a chart in `Reveal` (`components/motion.tsx`) for its one-time entrance.

### Segmented controls and pills

- **Header segment** (`segment` / `segmentButton` in `shell.tsx`): bordered `card` box, 36px tall, 30px buttons that grow to 44px on phones. Used by the month stepper, Activity's period control, the currency switch and filters.
- **`Segmented`** (`settings/row.tsx`): soft `muted` track; the pressed button turns `card` with a 1px shadow. Full width on phones.
- **`Pill`**: 10.5px, `rounded-full`, in `brand`, `warning` or `muted` tone.

Both segmented controls mark the chosen option with `aria-pressed`.

### Settings

`registry.tsx` lists every section (id, title, Phosphor icon, component, searchable rows, phone summary, badge). The desktop rail, phone list and search all read it, so a new setting needs a row there to be findable. Each setting is a `SettingRow` inside a `SettingGroup` (`settings/row.tsx`):

- `SettingRow`: title (14px, 500), description (13px muted), control on the right, wrapping under the label when narrow. 64px minimum, 52px on phones; `id` is the deep-link anchor that flashes the row.
- `SettingGroup`: a 13px label above a bordered `card` of rows, 28px apart.
- Rows save themselves with `usePref(key)` or `useSave()`; every key, value and default lives in `PREFS` in `core.ts`. "Saved" pops in beside the control.
- `Expand` opens inline editors by height and opacity over 300ms.

### Other app components

`KoshaLogo` / `KoshaMark` (the only brand colour in the app), `PageHeader` and `PageSkeleton` (`shell.tsx`), `CategoryIcon`, `CategoryPicker`, `QuickAdd`, `PhoneAdd`, `TransactionForm`, `SearchPalette`, `AccountMenu`, `GetStarted`, `PwaPrompts`, `NetWorth`. Read the closest one before building something similar.

### Icons

Phosphor (`@phosphor-icons/react`; server-rendered code imports from `@phosphor-icons/react/ssr`). Icons are 16px by default inside buttons, 20px in the tab bar and phone header, and use the regular weight; `fill` and `bold` are used sparingly (AI sparkle, checks). Decorative icons take `aria-hidden="true"`.

Categories store either `ph:<name>` (picked from `CATEGORY_ICONS`) or a legacy emoji from Cashew imports. `categoryIcon()` in `category-icon.tsx` maps both to a Phosphor icon, falling back to `TagIcon`. `CategoryIcon` draws it at 18px in `subtle-foreground`, decorative, since the name is always beside it.

## Motion

Motion is quick, eased out and purposeful: it confirms an action or shows where something went.

### Curves (`styles.css:37-40`)

| Token         | Value                             | Use                                  |
| ------------- | --------------------------------- | ------------------------------------ |
| `ease-out`    | `cubic-bezier(0.23, 1, 0.32, 1)`  | Default for UI; overrides Tailwind's |
| `ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | Movement between two states          |
| `ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)`  | Phone bottom sheets                  |

### What animates

| What                            | Duration and effect                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Button press                    | 150ms; scale to 0.97 (keypad keys 0.96 in 100ms, phone Add 0.94)                                                  |
| Dialog                          | 200ms in, 150ms out; fade and zoom from 0.97                                                                      |
| Phone bottom sheet              | 300ms slide up on `ease-drawer`                                                                                   |
| Main page change                | Old page fades out in 120ms; new page rises 4px and fades in over 220ms after 40ms. Header and tab bar stay still |
| Phone settings push / back      | 380ms; the new page slides in from 100%, the old one slides to −22% and fades                                     |
| Settings section open (desktop) | Groups rise 6px over 340ms, 40ms apart                                                                            |
| Deep-linked setting             | Tinted `brand-soft`, fading back over 1.6s                                                                        |
| "Saved"                         | Pops from 0.9 scale in 200ms                                                                                      |
| Line and area charts            | Wipe in left to right, 700ms, once when scrolled into view                                                        |
| Bar charts                      | Bars grow over 500ms, 25ms apart                                                                                  |
| Rolling figures                 | NumberFlow digits spin over 650ms, opacity 250ms                                                                  |
| Hide amounts                    | Blur fades over 250ms                                                                                             |

### Reduced and off

- **`prefers-reduced-motion`:** enter and exit animations keep their fades but lose translate and scale; charts, settings and page changes become fades of 120–340ms.
- **Settings › Appearance › Animations** (`data-motion` on `<html>`): `reduced` makes every animation and transition a 120ms fade; `off` sets every duration to 0. Dialogs and toasts portal outside the shell, which is why the switch sits on `<html>`.
- Switching theme turns transitions off for one style recalc, so colours do not fade between modes (`applyTheme` in `theme.ts`).
- New animation must respect all three: use `motion-safe:` for movement and test with `data-motion="reduced"` and `"off"`.

## Accessibility

- **Real elements.** Use `<button>` and `<a>` (or router `Link`), never a clickable `div`. The month arrows are links, so hovering one preloads it.
- **Labels.** Icon-only buttons take an `aria-label` from `m.*()`. Navs carry `aria-label`. Loading states are `role="status"` with `sr-only` text.
- **Toggles.** Segmented options and the theme picker use `aria-pressed`; groups use `role="group"` with a label.
- **Focus.** Every element gets `outline-ring/50` from the base layer. Buttons and fields draw a 3px `ring-ring/50` with a `ring` border on `:focus-visible`.
- **Landing focus.** One rule in `styles.css:279-288`: inside `[data-landing]`, `:focus-visible` draws a 2px solid outline, offset 2px, in `var(--ring-on, var(--foreground))`. Each brand ground sets `--ring-on` to the ink that contrasts with it (paper on peacock, ink on marigold and paper cards, chalk on ink); app windows and the phone set it back to the foreground.
- **Touch targets.** At least 44px on phones: `max-md:min-h-11` / `max-md:h-11` on buttons, inputs and segment buttons; tab bar items are 56px tall; legal and landing footer links are `min-h-11`.
- **Contrast.** `series-2` and `series-3` fall under 3:1 on white, so the net worth chart always has a legend.
- **Live values.** The month label is `aria-live="polite"`.

## Writing

- Plain words and sentence case. Say what a number means ("Still to pay", not a bare figure).
- Every string people read comes from `m.*()` (`@/paraglide/messages`), with the key added to every `messages/<locale>/` folder. `translations.md` explains the format and holds the glossary; follow it for terms like account, payee and transfer.
- Whole sentences with `{variables}`, plural variants instead of `n === 1 ?`, and `ParaglideMessage` markup for links inside a sentence.
- Money through `fmt`, dates and numbers through `intlLocale()`. Never concatenate a currency symbol.
- No invented testimonials, counts or press anywhere (`PRODUCT.md`).

## Surfaces

### Landing page (`src/components/landing.tsx`)

Brief: `.impeccable/surfaces/src-components-landing-tsx.md` ("Pocket and desk").

- The root is `[data-landing]`. Sections are full-bleed grounds: paper hero and desk (`bg-paper`, `peacock-night` in dark mode), peacock pocket chapter and footer, marigold, and an ink AI band (`ink-deep` in dark mode).
- Each ground has a quieter text tone tinted from the ground, not grey: `subtle-foreground` on paper, `paper/80` on peacock, `ink/75` on marigold, `chalk/70` on ink (`quiet` in `landing.tsx`).
- Content sits in `max-w-[1280px]` with `px-4 sm:px-8 md:px-12` gutters and `py-20 lg:py-28` sections, on a 12-column grid from `lg` (`gap-x-6 gap-y-12`).
- The marigold coin from the mark is the one recurring shape (`coin`), hidden below `lg`.
- Proof is the real app: `appWindow` (white card, 18px radius, `shadow-window`) and mocks that run the app's own pure code (`landing-demos.tsx`, `landing-checks.tsx`). Mock controls reuse the app's button look (`mockButton`, `mockPrimary`).
- Buttons are 48px, 14px radius, 15px medium, lifting 1px on hover. The solid button is ink on paper and inverts in dark mode; the outline button is `border-current/25`.

### Sign-in pages (`src/components/auth.tsx`)

- `AuthShell` frames `/login`, `/forgot-password`, `/reset-password` and `/consent`. From `lg`, the form column (`max-w-[392px]`) sits beside a peacock brand panel (`bg-auth-panel`, 24px radius, marigold coin, Bricolage headline, a mock app card). Between `md` and `lg` the form is centred alone.
- Phones use `band` (the form on a sheet with a 22px top radius over a peacock band with the headline) for sign in and create account, or `focused` (a plain page with a back button) for the rest.
- Controls are larger than in the app: `Button size="auth"` / `"auth-option"` and `Input variant="auth"` (46px, 14px radius). Outline buttons sit on `card` in both modes (`optionClass`).
- Brand colours and Bricolage appear only in the panel, the band and the logo; the form itself uses app tokens.

### Legal pages (`src/components/legal.tsx`)

Plain prose on the app's tokens, `max-w-2xl`, 15px relaxed body, Bricolage headings, footer links at 44px.

## Do's and Don'ts

### Do

- **Do** take every colour from a token in `styles.css`, and check the screen in light and dark mode.
- **Do** set every amount in `.num` and format it with `fmt`.
- **Do** use `ui/*` primitives and copy the nearest existing component's classes before inventing new ones.
- **Do** design the phone layout separately below `md`, with 44px targets and safe-area padding.
- **Do** confirm destructive actions with a `Dialog` and report failures with a `sonner` toast.
- **Do** give new motion the `ease-out` curve, a duration under 400ms, and a reduced and off state.

### Don't

- **Don't** use peacock, marigold or paper inside the app outside the mark.
- **Don't** use Bricolage in the app; it is for the landing, sign-in and legal pages.
- **Don't** add shadows to cards or rows; the app is flat.
- **Don't** confuse `--accent` (the hover fill) with `--brand` (the user's accent colour).
- **Don't** use green or teal for anything but positive values and the default accent.
- **Don't** write strings outside `m.*()` or icons from any set but Phosphor.
