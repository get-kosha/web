import { useRef, useState } from "react"
import { useMeta } from "@/components/shell"
import { Avatar } from "@/components/account-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SettingGroup, SettingRow } from "@/components/settings/row"
import { useSave } from "@/components/settings/saved"
import { authClient, signOut } from "@/lib/auth-client"
import { removeAvatar, uploadAvatar } from "@/lib/api"
import { m } from "@/paraglide/messages"

/** Crops an image to its centre square and shrinks it to a 256px JPEG, so uploads stay small. */
async function squareJpeg(file: File) {
  const img = await createImageBitmap(file).catch(() => {
    throw new Error(m.settings_profile_unreadable())
  })
  const side = Math.min(img.width, img.height)
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext("2d")!
  // JPEG has no transparency, so a transparent PNG gets a white background rather than black.
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, 256, 256)
  ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256)
  return new Promise<Blob>((done, fail) =>
    canvas.toBlob((b) => (b ? done(b) : fail(new Error(m.settings_profile_unreadable()))), "image/jpeg", 0.85)
  )
}

function Photo() {
  const { user, avatars } = useMeta()
  const save = useSave()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    await save(fn)
    setBusy(false)
  }
  if (!avatars)
    return <SettingRow id="photo" title={m.settings_row_photo()} description={m.settings_profile_no_storage()} />
  const button = "h-9 bg-card px-3 text-[13px] font-normal"
  return (
    <SettingRow
      id="photo"
      title={m.settings_row_photo()}
      description={m.settings_profile_photo_desc()}
      control={
        <>
          <input
            ref={input}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (!file) return
              void run(async () => {
                const data = new FormData()
                data.append("file", await squareJpeg(file), "avatar.jpg")
                return uploadAvatar({ data })
              })
            }}
          />
          {user.image && (
            <Button variant="outline" className={button} disabled={busy} onClick={() => run(() => removeAvatar())}>
              {m.common_remove()}
            </Button>
          )}
          <Button variant="outline" className={button} disabled={busy} onClick={() => input.current?.click()}>
            {busy
              ? m.settings_profile_saving()
              : user.image
                ? m.settings_profile_change()
                : m.settings_profile_upload()}
          </Button>
        </>
      }
    />
  )
}

export function Profile() {
  const { user } = useMeta()
  const save = useSave()
  const [name, setName] = useState(user.name)
  return (
    <>
      <SettingGroup>
        <div className="flex items-center gap-4 px-5 py-4 max-md:px-4">
          <Avatar user={user} className="size-14 text-lg" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{user.name || user.email}</div>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {user.image ? user.email : m.settings_profile_avatar_hint()}
            </p>
          </div>
        </div>
        <Photo />
        <SettingRow
          id="name"
          title={m.settings_row_name()}
          description={m.settings_profile_name_desc()}
          control={
            <Input
              aria-label={m.settings_row_name()}
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
          title={m.settings_row_email()}
          description={m.settings_profile_email_desc()}
          control={
            <Input
              aria-label={m.settings_row_email()}
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
          {m.settings_profile_sign_out()}
        </button>
      </SettingGroup>
    </>
  )
}
