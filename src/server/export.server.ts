import { dayOf, tagList } from "@/lib/core"
import { USER_TABLES } from "@/server/auth.server"
import { db, getSettings } from "@/server/db.server"

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Every transaction as CSV, newest first, amounts in their account's currency. Scoped by user_id, joins too. */
export async function transactionsCsv(uid: string) {
  const { tz } = await getSettings(uid)
  const { results } = await db()
    .prepare(`SELECT t.date, t.name, c.name AS category, s.name AS subcategory, w.name AS account, w.currency,
        t.amount, t.note, t.paid, t.kind, t.transfer_id, t.tags, e.name AS event
      FROM transactions t
      JOIN wallets w ON w.user_id = t.user_id AND w.id = t.wallet_id
      LEFT JOIN categories c ON c.user_id = t.user_id AND c.id = t.category_id
      LEFT JOIN categories s ON s.user_id = t.user_id AND s.id = t.subcategory_id
      LEFT JOIN events e ON e.user_id = t.user_id AND e.id = t.event_id
      WHERE t.user_id = ? ORDER BY t.date DESC`)
    .bind(uid)
    .all<{
      date: number
      name: string
      category: string | null
      subcategory: string | null
      account: string
      currency: string
      amount: number
      note: string
      paid: number
      kind: string | null
      transfer_id: string | null
      tags: string
      event: string | null
    }>()
  const head = [
    "date",
    "payee",
    "category",
    "subcategory",
    "account",
    "currency",
    "amount",
    "note",
    "status",
    "transfer",
    "tags",
    "event",
  ]
  const rows = results.map((r) =>
    [
      dayOf(r.date, tz),
      r.name,
      r.category,
      r.subcategory,
      r.account,
      r.currency.toUpperCase(),
      (r.amount / 100).toFixed(2),
      r.note,
      r.kind === "skipped" ? "skipped" : r.paid ? "paid" : "upcoming",
      r.transfer_id ?? "",
      tagList(r.tags)
        .map((t) => `#${t}`)
        .join(" "),
      r.event,
    ]
      .map(cell)
      .join(",")
  )
  return [head.join(","), ...rows].join("\r\n") + "\r\n"
}

/** Everything the user owns, table by table, without the user_id column. */
export async function everythingJson(uid: string) {
  const DB = db()
  // AI keys stay out: they're ciphertext only this server can read.
  const tables = USER_TABLES.filter((t) => t !== "ai_providers")
  const res = await DB.batch(tables.map((t) => DB.prepare(`SELECT * FROM ${t} WHERE user_id = ?`).bind(uid)))
  const data = Object.fromEntries(
    tables.map((t, i) => [
      t,
      (res[i].results as Record<string, unknown>[]).map((row) => {
        delete row.user_id
        return row
      }),
    ])
  )
  return { app: "kosha", version: 1, exported_at: new Date().toISOString(), ...data }
}
