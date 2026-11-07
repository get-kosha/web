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
export function LanguageSwitch({ className, onChange }: { className?: string; onChange?: (l: Locale) => void }) {
  return (
    <label
      className={cn(
        "relative inline-flex h-9 items-center gap-1.5 rounded-md text-[13px] text-muted-foreground transition-colors hover:text-foreground max-md:h-11",
        className
      )}
    >
      <GlobeIcon aria-hidden className="size-4 shrink-0" />
      <select
        aria-label={m.common_language()}
        value={getLocale()}
        onChange={(e) => {
          const l = e.target.value as Locale
          if (onChange) onChange(l)
          else setLocale(l)
        }}
        className="cursor-pointer appearance-none bg-transparent pr-1 outline-none focus-visible:underline"
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
