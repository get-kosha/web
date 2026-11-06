import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import {
  DesktopIcon,
  EyeSlashIcon,
  GearSixIcon,
  KeyboardIcon,
  MoonIcon,
  ShieldCheckIcon,
  SignOutIcon,
  SparkleIcon,
  SunIcon,
  TagIcon,
} from "@phosphor-icons/react/ssr"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { usePref } from "@/components/settings/saved"
import { Pill } from "@/components/settings/row"
import { authClient } from "@/lib/auth-client"
import { setDevicePref, setTheme } from "@/lib/theme"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

export const initials = (name: string, email: string) =>
  (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("") || email[0]
  ).toUpperCase()

const THEMES = [
  ["light", "Light", SunIcon],
  ["dark", "Dark", MoonIcon],
  ["system", "System", DesktopIcon],
] as const

const item =
  "h-9 gap-2.5 rounded-lg px-2.5 text-[13.5px] [&_svg:not([class*='size-'])]:size-[18px] [&_svg]:text-subtle-foreground"

export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded-[5px] border px-[5px] font-mono text-[11px] leading-[1.4] text-muted-foreground">
    {children}
  </kbd>
)

/** The avatar menu: who you are, theme, the Settings pages you visit most, shortcuts, sign out. */
export function AccountMenu({ user, onShortcuts }: { user: { name: string; email: string }; onShortcuts: () => void }) {
  const [theme, saveTheme] = usePref("theme", "theme", setTheme)
  const [hidden, saveHidden] = usePref("hide_amounts", "hide-amounts", (v) => setDevicePref("hide_amounts", v))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account and settings"
        className="inline-flex size-9 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-foreground transition-shadow duration-200 hover:shadow-[0_0_0_3px_var(--brand-soft)] aria-expanded:shadow-[0_0_0_3px_var(--brand-soft)] max-md:size-11"
      >
        {initials(user.name, user.email)}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="data-[side=bottom]:slide-in-from-top-1.5 w-[300px] rounded-[14px] p-1.5 shadow-[0_12px_32px_rgba(17,17,19,0.12),0_2px_6px_rgba(17,17,19,0.06)] duration-[220ms] dark:bg-[#1a1a1d] dark:shadow-[0_16px_40px_rgba(0,0,0,0.55),0_2px_6px_rgba(0,0,0,0.3)] data-open:zoom-in-[0.97]"
      >
        <div className="flex items-center gap-3 px-2.5 pt-2.5 pb-3">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-foreground"
          >
            {initials(user.name, user.email)}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{user.name || user.email}</div>
            <div className="truncate text-xs text-muted-foreground">{user.email}</div>
          </div>
        </div>
        <div className="flex min-h-10 items-center justify-between gap-2.5 px-2.5 py-1.5 text-[13.5px]">
          Theme
          <div role="group" aria-label="Theme" className="inline-flex gap-0.5 rounded-[9px] bg-muted p-[3px]">
            {THEMES.map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                aria-label={label}
                aria-pressed={theme === v}
                onClick={() => saveTheme(v)}
                className="inline-flex h-[26px] w-8 items-center justify-center rounded-[7px] text-muted-foreground transition-[background-color,color] duration-200 hover:text-foreground aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-[0_1px_2px_rgba(0,0,0,0.1)] max-md:h-9 max-md:w-11 dark:aria-pressed:bg-[#2a2a2f]"
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        </div>
        <label className="flex min-h-10 items-center justify-between gap-2.5 px-2.5 py-1.5 text-[13.5px]">
          <span className="flex items-center gap-2.5">
            <EyeSlashIcon className="size-[18px] text-subtle-foreground" /> Hide amounts
          </span>
          <Switch checked={hidden === "1"} onCheckedChange={(on) => saveHidden(on ? "1" : "0")} />
        </label>
        <DropdownMenuSeparator className="-mx-1.5 my-1.5" />
        <DropdownMenuItem className={item} render={<Link to="/settings" />}>
          <GearSixIcon /> Settings
          <span className="ml-auto">
            <Kbd>⌘,</Kbd>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem className={item} render={<Link to="/settings/$section" params={{ section: "security" }} />}>
          <ShieldCheckIcon /> Sign-in &amp; security
        </DropdownMenuItem>
        <DropdownMenuItem className={item} render={<Link to="/settings/$section" params={{ section: "categories" }} />}>
          <TagIcon /> Categories
        </DropdownMenuItem>
        <DropdownMenuItem className={item} render={<Link to="/settings/$section" params={{ section: "ai" }} />}>
          <SparkleIcon /> AI
          <span className="ml-auto">
            <Pill>Beta</Pill>
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="-mx-1.5 my-1.5" />
        <DropdownMenuItem className={item} onClick={onShortcuts}>
          <KeyboardIcon /> Keyboard shortcuts
          <span className="ml-auto">
            <Kbd>?</Kbd>
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="-mx-1.5 my-1.5" />
        <DropdownMenuItem
          className={item}
          onClick={async () => {
            await authClient.signOut()
            window.location.assign("/login")
          }}
        >
          <SignOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const SHORTCUTS: [area: string, rows: [keys: string[], what: string][]][] = [
  [
    "Anywhere",
    [
      [["⌘", "K"], "Search payees, categories, accounts and pages"],
      [["⌘", ","], "Open Settings"],
      [["?"], "Show these shortcuts"],
      [["Esc"], "Close a dialog, menu or panel"],
    ],
  ],
  [
    "Search and quick add",
    [
      [["↑", "↓"], "Move through the list"],
      [["↵"], "Open, or add the transaction"],
      [["⌘", "↵"], "Search activity for what you typed"],
    ],
  ],
  [
    "Activity",
    [
      [["↑", "↓"], "Move between transactions"],
      [["Esc"], "Close the side panel"],
    ],
  ],
  [
    "Settings",
    [
      [["/"], "Search settings"],
      [["↑", "↓", "↵"], "Pick a search result"],
    ],
  ],
]

/** Every shortcut Kosha has, grouped by where it works. */
export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>On Windows and Linux, use Ctrl for ⌘.</DialogDescription>
        </DialogHeader>
        {SHORTCUTS.map(([area, rows]) => (
          <section key={area}>
            <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">{area}</h3>
            <ul>
              {rows.map(([keys, what]) => (
                <li key={what} className={cn("flex min-h-9 items-center justify-between gap-4 border-t text-[13px]")}>
                  {what}
                  <span className="flex shrink-0 gap-1">
                    {keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </DialogContent>
    </Dialog>
  )
}
