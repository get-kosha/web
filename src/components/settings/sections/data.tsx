import { useState } from "react"
import {
  BracketsCurlyIcon,
  CheckIcon,
  DownloadSimpleIcon,
  FileCsvIcon,
  SpinnerGapIcon,
} from "@phosphor-icons/react/ssr"
import type { Icon } from "@phosphor-icons/react"
import { toast } from "sonner"
import { SettingGroup } from "@/components/settings/row"
import { errorOf } from "@/components/settings/saved"
import { cn } from "@/lib/utils"

const EXPORTS: [href: string, file: string, icon: Icon, title: string, sub: string][] = [
  [
    "/api/export/transactions.csv",
    "kosha-transactions.csv",
    FileCsvIcon,
    "Transactions",
    "CSV · opens in any spreadsheet",
  ],
  [
    "/api/export/kosha.json",
    "kosha.json",
    BracketsCurlyIcon,
    "Everything",
    "JSON · accounts, categories, rules, recurring, settings",
  ],
]

export function ImportExport() {
  return (
    <SettingGroup label="Export" plain>
      <div id="export" className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        {EXPORTS.map(([href, file, icon, title, sub]) => (
          <ExportTile key={href} href={href} file={file} icon={icon} title={title} sub={sub} />
        ))}
      </div>
    </SettingGroup>
  )
}

/** Fetches the file, then saves it. The label reads "Preparing…" while the server builds it, then "Downloaded". */
function ExportTile({
  href,
  file,
  icon: I,
  title,
  sub,
}: {
  href: string
  file: string
  icon: Icon
  title: string
  sub: string
}) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle")
  return (
    <button
      type="button"
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy")
        try {
          const res = await fetch(href)
          if (!res.ok) throw new Error(`Export failed (${res.status})`)
          const a = document.createElement("a")
          a.href = URL.createObjectURL(await res.blob())
          a.download = file
          a.click()
          URL.revokeObjectURL(a.href)
          setState("done")
        } catch (e) {
          setState("idle")
          toast.error(errorOf(e))
        }
      }}
      className="flex flex-col gap-1.5 rounded-xl border bg-card p-4 text-left transition-[border-color,translate] duration-200 ease-out hover:-translate-y-0.5 hover:border-muted-foreground/50 disabled:cursor-progress"
    >
      <I className="size-[22px] text-subtle-foreground" />
      <span className="mt-1 text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{sub}</span>
      <span
        className={cn(
          "mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-subtle-foreground",
          state === "done" && "text-positive"
        )}
      >
        {state === "busy" ? (
          <SpinnerGapIcon className="size-3.5 animate-spin" />
        ) : state === "done" ? (
          <CheckIcon className="size-3.5" />
        ) : (
          <DownloadSimpleIcon className="size-3.5" />
        )}
        {state === "busy" ? "Preparing…" : state === "done" ? "Downloaded" : "Download"}
      </span>
    </button>
  )
}
