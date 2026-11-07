import { useState } from "react"
import { CaretRightIcon } from "@phosphor-icons/react/ssr"
import { AiMark } from "@/components/ai"
import { Pick } from "@/components/pick"
import { intlLocale } from "@/lib/core"
import { guessDateFormat, type Layout } from "@/lib/statement"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

/** Reads a file as text, falling back to Windows-1252 when it isn't UTF-8 (older bank exports). */
export async function fileText(file: File) {
  const bytes = await file.arrayBuffer()
  const utf8 = new TextDecoder("utf-8").decode(bytes)
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf8
}

/** A file as base64, for sending a PDF to the AI model. */
export async function fileBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let bin = ""
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

const ROLES = [
  ["", m.import_role_ignore],
  ["date", m.import_role_date],
  ["description", m.import_role_description],
  ["amount", m.import_role_amount],
  ["debit", m.import_role_debit],
  ["credit", m.import_role_credit],
  ["balance", m.import_role_balance],
] as const
type Role = (typeof ROLES)[number][0]

/** Where a CSV's columns came from, for the Columns header. */
export const columnsStatus = (f: { remembered?: boolean; byAi?: boolean; confident?: boolean }) =>
  f.remembered
    ? m.import_columns_remembered()
    : f.byAi
      ? m.import_columns_by_ai()
      : f.confident
        ? m.import_columns_confident()
        : m.import_columns_check()

/**
 * A CSV's columns, each with what it holds, to fix what Kosha guessed. Open when Kosha wasn't sure; the
 * choice is remembered on import. `status` says where the columns came from.
 */
export function Columns({
  rows,
  layout,
  count,
  status,
  byAi,
  open: startOpen,
  onChange,
}: {
  rows: string[][]
  layout: Layout
  count: number
  status: string
  byAi?: boolean
  open: boolean
  onChange: (l: Layout) => void
}) {
  const [open, setOpen] = useState(startOpen)
  const head = layout.header >= 0 ? rows[layout.header] : rows[0].map((_, i) => m.import_columns_column({ n: i + 1 }))
  const sample = rows.slice(layout.header + 1, layout.header + 4)
  const roleOf = (i: number): Role =>
    i === layout.date
      ? "date"
      : layout.description.includes(i)
        ? "description"
        : i === layout.amount
          ? "amount"
          : i === layout.debit
            ? "debit"
            : i === layout.credit
              ? "credit"
              : i === layout.balance
                ? "balance"
                : ""
  function set(i: number, role: Role) {
    const next: Layout = {
      ...layout,
      description: layout.description.filter((d) => d !== i),
      ...(layout.amount === i && { amount: null }),
      ...(layout.debit === i && { debit: null }),
      ...(layout.credit === i && { credit: null }),
      ...(layout.balance === i && { balance: null }),
    }
    if (role === "date") {
      next.date = i
      next.dateFormat = guessDateFormat(rows.slice(layout.header + 1).map((r) => r[i] ?? "")) ?? next.dateFormat
    }
    if (role === "description") next.description = [...next.description, i].slice(-2)
    if (role === "amount") Object.assign(next, { amount: i, debit: null, credit: null })
    if (role === "debit") Object.assign(next, { debit: i, amount: null })
    if (role === "credit") Object.assign(next, { credit: i, amount: null })
    if (role === "balance") next.balance = i
    onChange(next)
  }
  return (
    <div className="rounded-xl border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-left text-sm"
      >
        <CaretRightIcon
          className={cn("size-4 text-muted-foreground transition-transform duration-150", open && "rotate-90")}
        />
        <span className="font-medium">{m.import_columns()}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {byAi && <AiMark className="size-3" />}
          {status}
        </span>
      </button>
      {open && (
        <div className="grid gap-3 border-t p-4">
          <div className="overflow-x-auto">
            <table className="text-left text-xs">
              <thead>
                <tr>
                  {head.map((h, i) => (
                    <th key={i} className="min-w-32 p-1 align-bottom font-normal">
                      <Pick
                        value={roleOf(i)}
                        onChange={(v) => set(i, v as Role)}
                        placeholder={m.import_role_ignore()}
                        options={ROLES.slice(1).map(([value, label]) => ({ value, label: label() }))}
                        className={cn("h-8 w-full bg-background text-xs", !roleOf(i) && "text-muted-foreground")}
                      />
                      <div className="mt-1 truncate px-1 text-muted-foreground">{h}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sample.map((r, j) => (
                  <tr key={j} className="border-t">
                    {head.map((_, i) => (
                      <td key={i} className="max-w-48 truncate p-1 px-2 text-subtle-foreground">
                        {r[i]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <label className="flex items-center gap-2">
              {m.import_columns_dates()}
              <Pick
                value={layout.dateFormat}
                onChange={(v) => v && onChange({ ...layout, dateFormat: v as Layout["dateFormat"] })}
                placeholder={m.import_columns_format()}
                options={[
                  { value: "dmy", label: m.import_date_dmy() },
                  { value: "mdy", label: m.import_date_mdy() },
                  { value: "ymd", label: m.import_date_ymd() },
                  { value: "text", label: m.import_date_text() },
                ]}
                className="h-8 bg-background text-xs"
              />
            </label>
            {layout.amount !== null && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={layout.invert}
                  onChange={(e) => onChange({ ...layout, invert: e.target.checked })}
                  className="size-4 accent-[var(--brand)]"
                />
                {m.import_columns_invert()}
              </label>
            )}
            <span className="text-muted-foreground">
              {m.import_columns_lines_read({ count, n: count.toLocaleString(intlLocale()) })}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
