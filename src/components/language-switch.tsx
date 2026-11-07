import { GlobeIcon } from "@phosphor-icons/react/ssr"
import { cn } from "cn"
import { m } from "@/paraglide/messages"
import { getLocale, locales, setLocale, type Locale } from "@/paraglide/runtime"

/** A language in its own words: "Deutsch", "English". */
const languageName = (l: Locale) => new Intl.DisplayNames([l], { type: "language" }).of(l) ?? l

/**
 * Picks the language. By default it only sets this browser's cookie and reloads, which is all a signed-out
 * page can do. Settings passes `onChange` to save the choice to the account first.
 */
export function LanguageSwitch({
  className,
  short,
  onChange,
}: {
  className?: string
  /** Show the two-letter code instead of the name on phones. */
  short?: boolean
  onChange?: (l: Locale) => void
}) {
  const locale = getLocale()
  const name = languageName(locale)
  return (
    <label
      className={cn(
        "relative inline-flex h-9 items-center gap-1.5 rounded-md text-[13px] text-muted-foreground transition-colors hover:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 max-md:h-11",
        className
      )}
    >
      <GlobeIcon aria-hidden className="size-4 shrink-0" />
      {/* The select lies invisibly over this label, so the closed control can show a short code while the
          open list still names each language in full. */}
      <span aria-hidden className="pr-1">
        {short ? (
          <>
            <span className="sm:hidden">{locale.toUpperCase()}</span>
            <span className="max-sm:hidden">{name}</span>
          </>
        ) : (
          name
        )}
      </span>
      <select
        aria-label={m.common_language()}
        value={locale}
        onChange={(e) => {
          const l = e.target.value as Locale
          if (onChange) onChange(l)
          else setLocale(l)
        }}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {languageName(l)}
          </option>
        ))}
      </select>
    </label>
  )
}
