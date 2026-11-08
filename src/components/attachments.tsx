import { useEffect, useRef, useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { DownloadSimpleIcon, FilePdfIcon, PaperclipIcon, XIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useMeta } from "@/components/shell"
import {
  deleteAttachment,
  listAttachments,
  listScheduleAttachments,
  uploadAttachment,
  type Attachment,
} from "@/lib/api"
import { ATTACHMENT_ACCEPT, ATTACHMENT_LIMIT, BROWSER_IMAGES, intlLocale, archiveNames } from "@/lib/core"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const fileUrl = (id: string, download = false) => `/api/attachments/${id}${download ? "?download=1" : ""}`
/** "Nov 2026" for a YYYY-MM-DD day. */
const monthLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(intlLocale(), { month: "short", year: "numeric", timeZone: "UTC" })
const sizeLabel = (n: number) =>
  n < 1024 * 1024
    ? `${Math.max(1, Math.round(n / 1024))} KB`
    : `${(n / 1048576).toLocaleString(intlLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`

/** Uploads files to a transaction one by one. Returns how many failed, after saying why. */
export async function uploadFiles(transactionId: string, files: File[]) {
  let failed = 0
  for (const file of files) {
    const data = new FormData()
    data.set("transactionId", transactionId)
    data.set("file", file)
    try {
      await uploadAttachment({ data })
    } catch (err) {
      failed++
      toast.error(`${file.name}: ${err instanceof Error ? err.message : m.tx_attach_failed()}`)
    }
  }
  return failed
}

/** Keeps only files under the size limit, saying which were too big. */
function underLimit(files: File[]) {
  const big = files.filter((f) => f.size > ATTACHMENT_LIMIT)
  if (big.length) toast.error(m.tx_file_too_big({ files: big.map((f) => f.name).join(", ") }))
  return files.filter((f) => f.size <= ATTACHMENT_LIMIT)
}

/**
 * Receipts, payslips and other files on a transaction. With `transactionId` it lists and uploads straight away.
 * Without one (a transaction not saved yet) it holds the chosen files in `staged` for the form to upload after saving.
 * It renders nothing when the server has no attachments bucket.
 */
export function Attachments({
  transactionId,
  staged,
  onStage,
  className,
}: {
  transactionId?: string
  staged?: File[]
  onStage?: (files: File[]) => void
  className?: string
}) {
  const meta = useMeta()
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [list, setList] = useState<Attachment[]>([])
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<Attachment | null>(null)

  async function load() {
    if (transactionId) setList(await listAttachments({ data: { transactionId } }))
  }
  useEffect(() => {
    if (!meta.attachments || !transactionId) return
    let live = true
    listAttachments({ data: { transactionId } }).then(
      (l) => live && setList(l),
      () => {}
    )
    return () => {
      live = false
    }
  }, [transactionId, meta.attachments])

  if (!meta.attachments) return null

  async function pick(files: File[]) {
    const ok = underLimit(files)
    if (!ok.length) return
    if (!transactionId) return onStage?.([...(staged ?? []), ...ok])
    setBusy(true)
    const failed = await uploadFiles(transactionId, ok)
    if (failed < ok.length) toast.success(m.tx_attached({ count: ok.length - failed }))
    await load().catch(() => {})
    setBusy(false)
    // Activity's paperclip counts files, so refresh it.
    void router.invalidate()
  }

  async function remove(a: Attachment) {
    setRemoving(null)
    try {
      await deleteAttachment({ data: { id: a.id } })
      setList((l) => l.filter((x) => x.id !== a.id))
      toast.success(m.tx_removed())
      void router.invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.tx_remove_failed())
    }
  }

  const rows = transactionId
    ? list.map((a) => ({ key: a.id, name: a.name, size: a.size, type: a.type, id: a.id as string | null, a }))
    : (staged ?? []).map((f, i) => ({
        key: `${i}:${f.name}`,
        name: f.name,
        size: f.size,
        type: f.type,
        id: null,
        a: null,
      }))

  return (
    <div className={cn("grid gap-1.5", className)}>
      {rows.length > 0 && <span className="text-xs text-muted-foreground">{m.tx_attachments()}</span>}
      {rows.map((r, i) => (
        <div key={r.key} className="flex min-h-11 items-center gap-2.5 rounded-md border bg-card px-2 text-sm">
          <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
            {r.type === "application/pdf" ? (
              <FilePdfIcon className="size-4 text-muted-foreground" />
            ) : r.id && BROWSER_IMAGES.has(r.type) ? (
              <img src={fileUrl(r.id)} alt="" loading="lazy" className="size-full object-cover" />
            ) : (
              <PaperclipIcon className="size-4 text-muted-foreground" />
            )}
          </span>
          {r.id ? (
            <a
              href={fileUrl(r.id)}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate hover:underline"
            >
              {r.name}
            </a>
          ) : (
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
          )}
          <span className="num shrink-0 text-xs text-muted-foreground">{sizeLabel(r.size)}</span>
          <button
            type="button"
            aria-label={m.tx_remove_file({ name: r.name })}
            onClick={() => (r.a ? setRemoving(r.a) : onStage?.((staged ?? []).filter((_, j) => j !== i)))}
            className="-mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground max-md:size-11"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      ))}
      <div>
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="-ml-2 inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60 max-md:min-h-11 [&_svg]:size-4"
        >
          <PaperclipIcon />
          {busy ? m.tx_attaching() : rows.length ? m.tx_attach_another() : m.tx_attach_receipt()}
        </button>
        <input
          ref={input}
          type="file"
          accept={ATTACHMENT_ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ""
            void pick(files)
          }}
        />
      </div>

      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.tx_remove_file_title({ name: removing?.name ?? "" })}</DialogTitle>
            <DialogDescription>{m.tx_remove_file_body()}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{m.common_cancel()}</DialogClose>
            <Button variant="destructive" onClick={() => removing && remove(removing)}>
              {m.common_remove()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type ScheduleFile = Awaited<ReturnType<typeof listScheduleAttachments>>[number]

/**
 * Every file on a recurring schedule's payments, such as a salary's payslips, newest first. Tick some and download
 * them together as a zip. `version` changes when a payment's files may have changed, so the list reloads.
 */
export function ScheduleDocuments({
  subscriptionId,
  name,
  version,
}: {
  subscriptionId: string
  name: string
  version: number
}) {
  const meta = useMeta()
  const [files, setFiles] = useState<ScheduleFile[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!meta.attachments) return
    let live = true
    listScheduleAttachments({ data: { subscriptionId } }).then(
      (l) => {
        if (!live) return
        setFiles(l)
        setPicked((p) => new Set([...p].filter((id) => l.some((f) => f.id === id))))
      },
      () => {}
    )
    return () => {
      live = false
    }
  }, [subscriptionId, version, meta.attachments])

  if (!meta.attachments || !files.length) return null
  const chosen = files.filter((f) => picked.has(f.id))
  const all = chosen.length === files.length
  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p)
      if (!next.delete(id)) next.add(id)
      return next
    })

  async function download() {
    if (chosen.length === 1) {
      location.assign(fileUrl(chosen[0].id, true))
      return
    }
    setBusy(true)
    try {
      const { zipSync } = await import("fflate")
      const names = archiveNames(chosen.map((f) => ({ day: f.dueDay ?? f.day, name: f.name })))
      const entries: Record<string, Uint8Array> = {}
      for (const [i, f] of chosen.entries()) {
        const res = await fetch(fileUrl(f.id))
        if (!res.ok) throw new Error(m.tx_fetch_failed({ name: f.name }))
        entries[names[i]] = new Uint8Array(await res.arrayBuffer())
      }
      // Photos and PDFs are compressed already, so the zip only stores them.
      const zip = zipSync(entries, { level: 0 })
      const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" }))
      const a = document.createElement("a")
      a.href = url
      a.download = `${m.tx_docs_zip_name({ name })}.zip`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.tx_zip_failed())
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="docs-h">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h3 id="docs-h" className="text-[13px] font-medium">
          {m.tx_documents()} <span className="num font-normal text-muted-foreground">{files.length}</span>
        </h3>
        <button
          type="button"
          onClick={() => setPicked(all ? new Set() : new Set(files.map((f) => f.id)))}
          className="-my-2 inline-flex min-h-9 items-center text-xs text-muted-foreground hover:text-foreground max-md:min-h-11"
        >
          {all ? m.tx_select_none() : m.tx_select_all()}
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto border-b">
        {files.map((f) => (
          <label
            key={f.id}
            className="grid min-h-10 cursor-pointer grid-cols-[auto_4.5rem_minmax(0,1fr)] items-center gap-3 border-t px-1 text-[13px] transition-colors hover:bg-muted max-md:min-h-11"
          >
            <input type="checkbox" checked={picked.has(f.id)} onChange={() => toggle(f.id)} />
            <span className="num text-xs text-muted-foreground">{monthLabel(f.dueDay ?? f.day)}</span>
            <span className="truncate">{f.name}</span>
          </label>
        ))}
      </div>
      <Button
        variant="outline"
        size="lg"
        className="mt-2.5 w-full gap-2 bg-card"
        disabled={!chosen.length || busy}
        onClick={download}
      >
        <DownloadSimpleIcon />
        {busy
          ? m.tx_preparing()
          : chosen.length > 1
            ? m.tx_download_zip({ count: chosen.length })
            : chosen.length
              ? m.tx_download()
              : m.tx_tick_to_download()}
      </Button>
    </section>
  )
}
