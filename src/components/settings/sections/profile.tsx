import { useState } from "react"
import { useMeta } from "@/components/shell"
import { initials } from "@/components/account-menu"
import { Input } from "@/components/ui/input"
import { SettingGroup, SettingRow } from "@/components/settings/row"
import { useSave } from "@/components/settings/saved"
import { authClient, signOut } from "@/lib/auth-client"

export function Profile() {
  const { user } = useMeta()
  const save = useSave()
  const [name, setName] = useState(user.name)
  return (
    <>
      <SettingGroup>
        <div className="flex items-center gap-4 px-5 py-4 max-md:px-4">
          <span
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-semibold text-brand-foreground"
          >
            {initials(user.name, user.email)}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{user.name || user.email}</div>
            <p className="mt-0.5 text-[13px] text-muted-foreground">Your avatar takes your accent colour.</p>
          </div>
        </div>
        <SettingRow
          id="name"
          title="Name"
          description="Shown in the menu and on anything you export."
          control={
            <Input
              aria-label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              onBlur={() => {
                const next = name.trim()
                if (!next || next === user.name) return setName(user.name)
                void save(
                  () => authClient.updateUser({ name: next }),
                  () => setName(user.name)
                )
              }}
              autoComplete="name"
              data-full
              className="h-9 w-60 bg-background max-md:w-full"
            />
          }
        />
        <SettingRow
          id="email"
          title="Email"
          description="You sign in with it."
          control={
            <Input
              aria-label="Email"
              value={user.email}
              readOnly
              data-full
              className="h-9 w-60 bg-background text-muted-foreground max-md:w-full"
            />
          }
        />
      </SettingGroup>
      <SettingGroup className="md:hidden">
        <button
          type="button"
          onClick={signOut}
          className="flex min-h-[52px] w-full items-center px-4 text-left text-sm font-medium text-destructive"
        >
          Sign out
        </button>
      </SettingGroup>
    </>
  )
}
