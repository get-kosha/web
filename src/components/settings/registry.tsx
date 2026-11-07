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
import { m } from "@/paraglide/messages"
import type { Locale } from "@/paraglide/runtime"
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

/**
 * A message function, stored rather than called so the text follows the visitor's language when it renders.
 * `{ locale: "en" }` gives the English, which search also matches.
 */
type Text = (inputs?: Record<string, never>, options?: { locale?: Locale }) => string

/** A searchable row. `key` is its DOM id: /settings/general#time-zone scrolls to it and flashes it. */
type SettingKey = { key: string; title: Text; description: Text; keywords: Text }
const row = (key: string, title: Text, description: Text, keywords: Text): SettingKey => ({
  key,
  title,
  description,
  keywords,
})
export type Section = {
  id: string
  title: Text
  icon: Icon
  description: Text
  component: ComponentType
  rows: SettingKey[]
  /** The value shown on the right of the phone list (a zone, "EUR · USD", a count). */
  summary?: (d: SummaryData) => ReactNode
  /** A pill beside the section in the rail and phone list, such as the count of open security steps or "Beta". */
  badge?: (d: SummaryData) => { label: string; tone: "brand" | "warning" } | null
}
type SummaryData = { meta: Meta; account: Awaited<ReturnType<typeof accountSummary>> }
type Group = { id: string; label: Text; sections: Section[] }

/**
 * Every settings section, in rail order. The rail, the phone list and search all read this, so a new
 * setting is one row entry here (its text in messages/<locale>/settings.json) plus its row in the section.
 * A section with no rows doesn't render.
 */
const GROUPS: Group[] = [
  {
    id: "you",
    label: m.settings_group_you,
    sections: [
      {
        id: "profile",
        title: m.settings_section_profile,
        icon: UserCircleIcon,
        description: m.settings_section_profile_desc,
        component: Profile,
        rows: [
          row("photo", m.settings_row_photo, m.settings_row_photo_desc, m.settings_row_photo_kw),
          row("name", m.settings_row_name, m.settings_row_name_desc, m.settings_row_name_kw),
          row("email", m.settings_row_email, m.settings_row_email_desc, m.settings_row_email_kw),
        ],
      },
      {
        id: "security",
        title: m.settings_section_security,
        icon: ShieldCheckIcon,
        description: m.settings_section_security_desc,
        component: Security,
        badge: ({ meta, account }) => {
          const open = securitySteps(account, meta.prefs.backup_codes_saved_at).filter((s) => !s.done).length
          return open ? { label: String(open), tone: "warning" } : null
        },
        rows: [
          row("password", m.settings_row_password, m.settings_row_password_desc, m.settings_row_password_kw),
          row("passkeys", m.settings_row_passkeys, m.settings_row_passkeys_desc, m.settings_row_passkeys_kw),
          row("google", m.settings_row_google, m.settings_row_google_desc, m.settings_row_google_kw),
          row("two-factor", m.settings_row_two_factor, m.settings_row_two_factor_desc, m.settings_row_two_factor_kw),
          row("devices", m.settings_row_devices, m.settings_row_devices_desc, m.settings_row_devices_kw),
        ],
      },
    ],
  },
  {
    id: "preferences",
    label: m.settings_group_preferences,
    sections: [
      {
        id: "general",
        title: m.settings_section_general,
        icon: SlidersHorizontalIcon,
        description: m.settings_section_general_desc,
        component: General,
        summary: ({ meta }) => meta.tz.split("/").pop()?.replace(/_/g, " "),
        rows: [
          row("language", m.settings_row_language, m.settings_row_language_desc, m.settings_row_language_kw),
          row("time-zone", m.settings_row_time_zone, m.settings_row_time_zone_desc, m.settings_row_time_zone_kw),
          row(
            "round-amounts",
            m.settings_row_round_amounts,
            m.settings_row_round_amounts_desc,
            m.settings_row_round_amounts_kw
          ),
          row(
            "default-account",
            m.settings_row_default_account,
            m.settings_row_default_account_desc,
            m.settings_row_default_account_kw
          ),
          row("add-kind", m.settings_row_add_kind, m.settings_row_add_kind_desc, m.settings_row_add_kind_kw),
          row(
            "suggest-category",
            m.settings_row_suggest_category,
            m.settings_row_suggest_category_desc,
            m.settings_row_suggest_category_kw
          ),
        ],
      },
      {
        id: "appearance",
        title: m.settings_section_appearance,
        icon: PaintBrushIcon,
        description: m.settings_section_appearance_desc,
        component: Appearance,
        rows: [
          row("theme", m.settings_row_theme, m.settings_row_theme_desc, m.settings_row_theme_kw),
          row("accent", m.settings_row_accent, m.settings_row_accent_desc, m.settings_row_accent_kw),
          row("density", m.settings_row_density, m.settings_row_density_desc, m.settings_row_density_kw),
          row("page-width", m.settings_row_page_width, m.settings_row_page_width_desc, m.settings_row_page_width_kw),
          row(
            "number-font",
            m.settings_row_number_font,
            m.settings_row_number_font_desc,
            m.settings_row_number_font_kw
          ),
          row(
            "hide-amounts",
            m.settings_row_hide_amounts,
            m.settings_row_hide_amounts_desc,
            m.settings_row_hide_amounts_kw
          ),
          row("animations", m.settings_row_animations, m.settings_row_animations_desc, m.settings_row_animations_kw),
        ],
      },
    ],
  },
  {
    id: "money",
    label: m.settings_group_money,
    sections: [
      {
        id: "currencies",
        title: m.settings_section_currencies,
        icon: CoinsIcon,
        description: m.settings_section_currencies_desc,
        component: Currencies,
        summary: ({ meta }) => currencyOptions(meta).join(" · ").toUpperCase(),
        rows: [
          row("currencies", m.settings_row_currencies, m.settings_row_currencies_desc, m.settings_row_currencies_kw),
          row(
            "rates-source",
            m.settings_row_rates_source,
            m.settings_row_rates_source_desc,
            m.settings_row_rates_source_kw
          ),
        ],
      },
      {
        id: "categories",
        title: m.settings_section_categories,
        icon: TagIcon,
        description: m.settings_section_categories_desc,
        component: Categories,
        summary: ({ account }) => account.categories,
        rows: [
          row("categories", m.settings_row_categories, m.settings_row_categories_desc, m.settings_row_categories_kw),
        ],
      },
      {
        id: "events",
        title: m.settings_section_events,
        icon: CalendarStarIcon,
        description: m.settings_section_events_desc,
        component: Events,
        summary: ({ meta }) => meta.events.length || undefined,
        rows: [row("events", m.settings_row_events, m.settings_row_events_desc, m.settings_row_events_kw)],
      },
      {
        id: "rules",
        title: m.settings_section_rules,
        icon: FunnelIcon,
        description: m.settings_section_rules_desc,
        component: Rules,
        summary: ({ account }) => account.rules,
        rows: [
          row(
            "learn-rules",
            m.settings_row_learn_rules,
            m.settings_row_learn_rules_desc,
            m.settings_row_learn_rules_kw
          ),
          row("rules", m.settings_row_rules, m.settings_row_rules_desc, m.settings_row_rules_kw),
        ],
      },
      {
        id: "recurring",
        title: m.settings_section_recurring,
        icon: ArrowsClockwiseIcon,
        description: m.settings_section_recurring_desc,
        component: Recurring,
        rows: [
          row(
            "auto-record",
            m.settings_row_auto_record,
            m.settings_row_auto_record_desc,
            m.settings_row_auto_record_kw
          ),
          row("coming-up", m.settings_row_coming_up, m.settings_row_coming_up_desc, m.settings_row_coming_up_kw),
        ],
      },
    ],
  },
  {
    id: "intelligence",
    label: m.settings_group_intelligence,
    sections: [
      {
        id: "ai",
        title: m.settings_section_ai,
        icon: SparkleIcon,
        description: m.settings_section_ai_desc,
        component: Ai,
        badge: () => ({ label: m.settings_badge_beta(), tone: "brand" }),
        rows: [
          row("ai-enabled", m.settings_row_ai_enabled, m.settings_row_ai_enabled_desc, m.settings_row_ai_enabled_kw),
          row(
            "ai-providers",
            m.settings_row_ai_providers,
            m.settings_row_ai_providers_desc,
            m.settings_row_ai_providers_kw
          ),
          row(
            "ai-features",
            m.settings_row_ai_features,
            m.settings_row_ai_features_desc,
            m.settings_row_ai_features_kw
          ),
          row(
            "ai-categorise",
            m.settings_row_ai_categorise,
            m.settings_row_ai_categorise_desc,
            m.settings_row_ai_categorise_kw
          ),
          row(
            "ai-quick_add",
            m.settings_row_ai_quick_add,
            m.settings_row_ai_quick_add_desc,
            m.settings_row_ai_quick_add_kw
          ),
          row(
            "ai-receipts",
            m.settings_row_ai_receipts,
            m.settings_row_ai_receipts_desc,
            m.settings_row_ai_receipts_kw
          ),
          row("ai-recap", m.settings_row_ai_recap, m.settings_row_ai_recap_desc, m.settings_row_ai_recap_kw),
          row("ai-ask", m.settings_row_ai_ask, m.settings_row_ai_ask_desc, m.settings_row_ai_ask_kw),
          row(
            "ai-statements",
            m.settings_row_ai_statements,
            m.settings_row_ai_statements_desc,
            m.settings_row_ai_statements_kw
          ),
          row("ai-privacy", m.settings_row_ai_privacy, m.settings_row_ai_privacy_desc, m.settings_row_ai_privacy_kw),
          row("ai-log", m.settings_row_ai_log, m.settings_row_ai_log_desc, m.settings_row_ai_log_kw),
          row("ai-usage", m.settings_row_ai_usage, m.settings_row_ai_usage_desc, m.settings_row_ai_usage_kw),
        ],
      },
    ],
  },
  {
    id: "data",
    label: m.settings_group_data,
    sections: [
      {
        id: "data",
        title: m.settings_section_data,
        icon: DatabaseIcon,
        description: m.settings_section_data_desc,
        component: ImportExport,
        rows: [
          row("statements", m.settings_row_statements, m.settings_row_statements_desc, m.settings_row_statements_kw),
          row("export", m.settings_row_export, m.settings_row_export_desc, m.settings_row_export_kw),
        ],
      },
      {
        id: "api",
        title: m.settings_section_api,
        icon: PlugsConnectedIcon,
        description: m.settings_section_api_desc,
        component: ApiAccess,
        rows: [
          row("mcp-url", m.settings_row_mcp_url, m.settings_row_mcp_url_desc, m.settings_row_mcp_url_kw),
          row(
            "connected-apps",
            m.settings_row_connected_apps,
            m.settings_row_connected_apps_desc,
            m.settings_row_connected_apps_kw
          ),
          row("api-keys", m.settings_row_api_keys, m.settings_row_api_keys_desc, m.settings_row_api_keys_kw),
          row("api-docs", m.settings_row_api_docs, m.settings_row_api_docs_desc, m.settings_row_api_docs_kw),
        ],
      },
      {
        id: "delete",
        title: m.settings_section_delete,
        icon: WarningIcon,
        description: m.settings_section_delete_desc,
        component: DeleteReset,
        rows: [
          row(
            "delete-transactions",
            m.settings_row_delete_transactions,
            m.settings_row_delete_transactions_desc,
            m.settings_row_delete_transactions_kw
          ),
          row(
            "delete-account",
            m.settings_row_delete_account,
            m.settings_row_delete_account_desc,
            m.settings_row_delete_account_kw
          ),
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

/** A text in the visitor's language and in English, so words from either find it. */
const both = (t: Text) => `${t()} ${t({}, { locale: "en" })}`

/** Rows and sections matching every word typed, case-insensitively. */
export function searchSettings(query: string): SearchResult[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const hit = (text: string) => words.every((w) => text.toLowerCase().includes(w))
  return sections.flatMap((s) => [
    ...(hit(`${both(s.title)} ${both(s.description)}`) ? [{ section: s, row: null }] : []),
    ...s.rows
      .filter((r) => hit(`${both(r.title)} ${both(r.description)} ${both(r.keywords)} ${both(s.title)}`))
      .map((row) => ({ section: s, row })),
  ])
}
