import type { ComponentType, ReactNode } from "react"
import {
  PaintBrushIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  TagIcon,
  UserCircleIcon,
  WarningIcon,
  CoinsIcon,
  ArrowsClockwiseIcon,
  FunnelIcon,
  DatabaseIcon,
  SparkleIcon,
  CalendarStarIcon,
  PlugsConnectedIcon,
} from "@phosphor-icons/react/ssr"
import type { Icon } from "@phosphor-icons/react"
import { currencyOptions } from "@/components/shell"
import type { Meta, accountSummary } from "@/lib/api"
import { Appearance } from "@/components/settings/sections/appearance"
import { Categories } from "@/components/settings/sections/categories"
import { Currencies } from "@/components/settings/sections/currencies"
import { DeleteReset } from "@/components/settings/sections/danger"
import { Events } from "@/components/settings/sections/events"
import { General } from "@/components/settings/sections/general"
import { Profile } from "@/components/settings/sections/profile"
import { Recurring } from "@/components/settings/sections/recurring"
import { Ai } from "@/components/settings/sections/ai"
import { ImportExport } from "@/components/settings/sections/data"
import { ApiAccess } from "@/components/settings/sections/api"
import { Rules } from "@/components/settings/sections/rules"
import { Security, securitySteps } from "@/components/settings/sections/security"

/** A searchable row. `key` is its DOM id: /settings/general#time-zone scrolls to it and flashes it. */
type SettingKey = { key: string; title: string; description: string; keywords: string }
export type Section = {
  id: string
  title: string
  icon: Icon
  description: string
  component: ComponentType
  rows: SettingKey[]
  /** The value shown on the right of the phone list (a zone, "EUR · USD", a count). */
  summary?: (d: SummaryData) => ReactNode
  /** A pill beside the section in the rail and phone list, such as the count of open security steps or "Beta". */
  badge?: (d: SummaryData) => { label: string; tone: "brand" | "warning" } | null
}
type SummaryData = { meta: Meta; account: Awaited<ReturnType<typeof accountSummary>> }
type Group = { label: string; sections: Section[] }

/**
 * Every settings section, in rail order. The rail, the phone list and search all read this, so a new
 * setting is one row entry here plus its row in the section. A section with no rows doesn't render.
 */
const GROUPS: Group[] = [
  {
    label: "You",
    sections: [
      {
        id: "profile",
        title: "Profile",
        icon: UserCircleIcon,
        description: "How you appear in Kosha and on anything you export.",
        component: Profile,
        rows: [
          {
            key: "photo",
            title: "Profile picture",
            description: "A photo instead of your initials.",
            keywords: "avatar image",
          },
          { key: "name", title: "Name", description: "Shown in the menu and on exports.", keywords: "display" },
          { key: "email", title: "Email", description: "The address you sign in with.", keywords: "address login" },
        ],
      },
      {
        id: "security",
        title: "Sign-in & security",
        icon: ShieldCheckIcon,
        description: "Passwords, passkeys, two-factor and the devices signed in to your account.",
        component: Security,
        badge: ({ meta, account }) => {
          const open = securitySteps(account, meta.prefs.backup_codes_saved_at).filter((s) => !s.done).length
          return open ? { label: String(open), tone: "warning" } : null
        },
        rows: [
          { key: "password", title: "Password", description: "Change it, or set one.", keywords: "login sign in" },
          {
            key: "passkeys",
            title: "Passkeys",
            description: "Face ID, Touch ID or a security key.",
            keywords: "webauthn biometrics fingerprint",
          },
          {
            key: "google",
            title: "Google",
            description: "Sign in with your Google account.",
            keywords: "gmail oauth social connect",
          },
          {
            key: "two-factor",
            title: "Two-factor authentication",
            description: "A code from an authenticator app.",
            keywords: "2fa totp otp mfa backup codes",
          },
          {
            key: "devices",
            title: "Signed-in devices",
            description: "See and sign out sessions.",
            keywords: "sessions logout sign out",
          },
        ],
      },
    ],
  },
  {
    label: "Preferences",
    sections: [
      {
        id: "general",
        title: "General",
        icon: SlidersHorizontalIcon,
        description: "Time zone and the defaults Kosha uses when you add things.",
        component: General,
        summary: ({ meta }) => meta.tz.split("/").pop()?.replace(/_/g, " "),
        rows: [
          {
            key: "time-zone",
            title: "Time zone",
            description: "Months and days follow this zone.",
            keywords: "timezone clock region city",
          },
          {
            key: "round-amounts",
            title: "Round amounts on Overview",
            description: "Hide cents on the big numbers.",
            keywords: "cents decimals whole",
          },
          {
            key: "default-account",
            title: "Default account",
            description: "Used when you add a transaction.",
            keywords: "quick add wallet card account",
          },
          {
            key: "add-kind",
            title: "Add opens as",
            description: "Expense or income.",
            keywords: "quick add income expense",
          },
          {
            key: "suggest-category",
            title: "Suggest a category",
            description: "From payee rules and past payees.",
            keywords: "auto categorize categorise guess",
          },
        ],
      },
      {
        id: "appearance",
        title: "Appearance",
        icon: PaintBrushIcon,
        description: "How Kosha looks on this account. Changes apply everywhere you sign in.",
        component: Appearance,
        rows: [
          {
            key: "theme",
            title: "Theme",
            description: "Light, dark, or follow your system.",
            keywords: "dark mode light mode night colour scheme",
          },
          {
            key: "accent",
            title: "Accent colour",
            description: "Used for highlights and switches.",
            keywords: "color colour tint brand",
          },
          {
            key: "density",
            title: "Density",
            description: "Comfortable or compact rows.",
            keywords: "compact spacing",
          },
          { key: "page-width", title: "Page width", description: "Boxed or full width.", keywords: "layout wide" },
          {
            key: "number-font",
            title: "Number font",
            description: "Monospace or proportional figures.",
            keywords: "font mono digits figures",
          },
          {
            key: "hide-amounts",
            title: "Hide amounts",
            description: "Blur money until you hover.",
            keywords: "privacy blur screen hide",
          },
          {
            key: "animations",
            title: "Animations",
            description: "On, reduced or off.",
            keywords: "motion reduce animation transitions",
          },
        ],
      },
    ],
  },
  {
    label: "Money",
    sections: [
      {
        id: "currencies",
        title: "Currencies",
        icon: CoinsIcon,
        description: "The currencies you hold, which one is your default, and where exchange rates come from.",
        component: Currencies,
        summary: ({ meta }) => currencyOptions(meta).join(" · ").toUpperCase(),
        rows: [
          {
            key: "currencies",
            title: "Your currencies",
            description: "Order and default currency.",
            keywords: "default currency primary order",
          },
          {
            key: "rates-source",
            title: "Exchange rate source",
            description: "Where conversion rates come from.",
            keywords: "exchange rates fx forex conversion rate",
          },
        ],
      },
      {
        id: "categories",
        title: "Categories",
        icon: TagIcon,
        description: "Rename, nest or merge the categories your transactions use, and change their icons.",
        component: Categories,
        summary: ({ account }) => account.categories,
        rows: [
          {
            key: "categories",
            title: "Categories",
            description: "Icons, names, subcategories, merging.",
            keywords: "category icon merge subcategory archive",
          },
        ],
      },
      {
        id: "events",
        title: "Events",
        icon: CalendarStarIcon,
        description: "Trips and occasions that group transactions, so you can see what each one cost.",
        component: Events,
        summary: ({ meta }) => meta.events.length || undefined,
        rows: [
          {
            key: "events",
            title: "Events",
            description: "Create, rename and date events.",
            keywords: "trip travel holiday vacation occasion wedding label group",
          },
        ],
      },
      {
        id: "rules",
        title: "Payee rules",
        icon: FunnelIcon,
        description:
          "When a payee matches a rule, Kosha fills in the category for you. A rule takes priority over any other suggestion.",
        component: Rules,
        summary: ({ account }) => account.rules,
        rows: [
          {
            key: "learn-rules",
            title: "Learn from my edits",
            description: "Rules from how you categorise.",
            keywords: "payee rules auto learn categorise",
          },
          {
            key: "rules",
            title: "Payee rules",
            description: "Payee is or contains, then a category.",
            keywords: "payee rule merchant match auto categorise",
          },
        ],
      },
      {
        id: "recurring",
        title: "Recurring",
        icon: ArrowsClockwiseIcon,
        description: "Defaults for bills, subscriptions and recurring transfers.",
        component: Recurring,
        rows: [
          {
            key: "auto-record",
            title: "Record payments automatically",
            description: "On the due date, for new bills.",
            keywords: "subscriptions bills auto pay",
          },
          {
            key: "coming-up",
            title: '"Coming up" shows',
            description: "Until month end or the next 30 days.",
            keywords: "upcoming horizon overview range",
          },
        ],
      },
    ],
  },
  {
    label: "Intelligence",
    sections: [
      {
        id: "ai",
        title: "AI",
        icon: SparkleIcon,
        description: "Optional help from a model you choose. Kosha works fully without it.",
        component: Ai,
        badge: () => ({ label: "Beta", tone: "brand" }),
        rows: [
          {
            key: "ai-enabled",
            title: "Use AI features",
            description: "Turn every AI feature on or off.",
            keywords: "artificial intelligence llm model",
          },
          {
            key: "ai-providers",
            title: "AI providers",
            description: "Anthropic, OpenAI, Gemini, OpenRouter, Ollama.",
            keywords: "api key model claude gpt gemini ollama openrouter llm connect",
          },
          {
            key: "ai-features",
            title: "AI features",
            description: "Turn each AI feature on or off.",
            keywords: "features",
          },
          {
            key: "ai-categorise",
            title: "Auto-categorise",
            description: "A category for payees Kosha hasn't seen.",
            keywords: "categorize category suggest guess",
          },
          {
            key: "ai-quick_add",
            title: "Natural-language add",
            description: "Type a sentence and Kosha fills the form.",
            keywords: "quick add sentence describe type",
          },
          {
            key: "ai-receipts",
            title: "Receipt scanning",
            description: "Amount, date and payee from a photo.",
            keywords: "receipt photo camera scan ocr",
          },
          {
            key: "ai-recap",
            title: "Monthly recap",
            description: "A short note on each month.",
            keywords: "recap summary month review",
          },
          {
            key: "ai-ask",
            title: "Ask Kosha",
            description: "Questions about your money.",
            keywords: "ask chat question assistant",
          },
          {
            key: "ai-statements",
            title: "Statements",
            description: "Read PDF statements and help reconcile.",
            keywords: "statement pdf csv import reconcile reconciliation",
          },
          {
            key: "ai-privacy",
            title: "What AI can see",
            description: "Choose which fields Kosha sends.",
            keywords: "privacy data sharing redact",
          },
          {
            key: "ai-log",
            title: "Keep a request log",
            description: "Every AI request for 30 days.",
            keywords: "request log history audit",
          },
          {
            key: "ai-usage",
            title: "AI usage",
            description: "Requests and tokens this month.",
            keywords: "tokens requests usage",
          },
        ],
      },
    ],
  },
  {
    label: "Data",
    sections: [
      {
        id: "data",
        title: "Import & export",
        icon: DatabaseIcon,
        description: "Import bank statements, and download all of your data whenever you like.",
        component: ImportExport,
        rows: [
          {
            key: "statements",
            title: "Bank statements",
            description: "Import statements from all your banks and cards at once.",
            keywords: "import csv ofx qfx pdf bank statement reconcile reconciliation",
          },
          {
            key: "export",
            title: "Export",
            description: "Transactions as CSV, or everything as JSON.",
            keywords: "download backup json csv spreadsheet",
          },
        ],
      },
      {
        id: "api",
        title: "API & MCP",
        icon: PlugsConnectedIcon,
        description: "Let AI assistants and your own scripts read and update Kosha. You choose what each one can do.",
        component: ApiAccess,
        rows: [
          {
            key: "mcp-url",
            title: "MCP server URL",
            description: "Connect Claude, ChatGPT or Cursor.",
            keywords: "mcp ai assistant claude chatgpt cursor connector agent model context protocol",
          },
          {
            key: "connected-apps",
            title: "Connected apps",
            description: "Apps you allowed in, and disconnecting them.",
            keywords: "oauth apps revoke disconnect access",
          },
          {
            key: "api-keys",
            title: "API keys",
            description: "Keys for scripts and shortcuts.",
            keywords: "api key token developer rest script automation",
          },
          {
            key: "api-docs",
            title: "API reference",
            description: "Every endpoint, with examples.",
            keywords: "openapi swagger docs documentation endpoints rest",
          },
        ],
      },
      {
        id: "delete",
        title: "Delete & reset",
        icon: WarningIcon,
        description: "Permanent actions. Each one asks you to confirm, and an export first is a good idea.",
        component: DeleteReset,
        rows: [
          {
            key: "delete-transactions",
            title: "Delete all transactions",
            description: "Keep the account, start fresh.",
            keywords: "reset wipe clear start over",
          },
          {
            key: "delete-account",
            title: "Delete account",
            description: "Remove everything, permanently.",
            keywords: "close account remove erase",
          },
        ],
      },
    ],
  },
]

/** Groups with only the sections that have something to show. */
export const groups = GROUPS.map((g) => ({ ...g, sections: g.sections.filter((s) => s.rows.length) })).filter(
  (g) => g.sections.length
)

const sections = groups.flatMap((g) => g.sections.map((s) => ({ ...s, group: g.label })))
export const findSection = (id: string | undefined) => sections.find((s) => s.id === id)

export type SearchResult = { section: (typeof sections)[number]; row: SettingKey | null }

/** Rows and sections matching every word typed, case-insensitively. */
export function searchSettings(query: string): SearchResult[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const hit = (text: string) => words.every((w) => text.toLowerCase().includes(w))
  return sections.flatMap((s) => [
    ...(hit(`${s.title} ${s.description}`) ? [{ section: s, row: null }] : []),
    ...s.rows
      .filter((r) => hit(`${r.title} ${r.description} ${r.keywords} ${s.title}`))
      .map((row) => ({ section: s, row })),
  ])
}
