// Statement import, reconciliation and spotting recurring payments. Parsing and matching are pure and live in
// lib/statement.ts; this file reads and writes what they need. Every query is scoped by user_id.

import { z } from "zod"
import { m } from "@/paraglide/messages"
import {
  CORRECTION_CATEGORY,
  NEUTRAL_SQL,
  convert,
  dayOf,
  findRecurring,
  addDays,
  fmt,
  guessCategory,
  unixOf,
  type AccountType,
  type TitleRule,
} from "@/lib/core"
import {
  descriptorKey,
  differenceHints,
  guessDateFormat,
  guessLayout,
  isOfx,
  layoutSignature,
  parseCsv,
  parseOfx,
  payeeFor,
  planReconciliation,
  readCsv,
  type Layout,
  type Line,
} from "@/lib/statement"
import * as ai from "@/server/ai-tasks.server"
import { HttpError, db, ensureSettled, getRates, getSettings } from "@/server/db.server"
import { saveTransactions, saveTransfers } from "@/server/finance.server"

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const ids = (list: string[]) => JSON.stringify(list)

// ---------- reconcile ----------

export type ReconcileEntry = {
  id: string
  date: number
  day: string
  amount: number
  name: string
  note: string
  category_id: string
  paid: number
  transfer_id: string | null
  counter_wallet_id: string | null
  bank_ref: string | null
  reconciled_id: string | null
}

/**
 * Everything the Reconcile page needs for one account: the account, its past reconciliations, the balance
 * they confirmed, every entry not yet reconciled (paid, or unpaid and due within a week), the reconciled
 * entries of the last two months (so a re-imported statement finds them), and remembered CSV layouts and payees.
 */
export async function reconcileData(uid: string, walletId: string) {
  await ensureSettled(uid)
  const DB = db()
  const { tz } = await getSettings(uid)
  const account = await DB.prepare(`SELECT id, name, currency, type, credit_limit, archived,
      COALESCE((SELECT SUM(amount) FROM transactions WHERE user_id = w.user_id AND wallet_id = w.id AND paid = 1), 0) AS balance
      FROM wallets w WHERE user_id = ? AND id = ?`)
    .bind(uid, walletId)
    .first<{
      id: string
      name: string
      currency: string
      type: AccountType
      credit_limit: number | null
      archived: number
      balance: number
    }>()
  if (!account) throw new HttpError(404, m.server_account_not_found())
  const cols = `t.id, t.date, t.amount, t.name, t.note, t.category_id, t.paid, t.transfer_id, t.bank_ref, t.reconciled_id,
    (SELECT x.wallet_id FROM transactions x WHERE x.user_id = t.user_id AND x.transfer_id = t.transfer_id AND x.id <> t.id) AS counter_wallet_id`
  const [history, open, done, settled, layouts, aliases] = await DB.batch([
    DB.prepare(`SELECT id, statement_day, balance, credit_limit, entries, adjustment, created_at FROM reconciliations
      WHERE user_id = ? AND wallet_id = ? ORDER BY statement_day DESC, created_at DESC LIMIT 12`).bind(uid, walletId),
    DB.prepare(`SELECT ${cols} FROM transactions t WHERE t.user_id = ? AND t.wallet_id = ? AND t.reconciled_id IS NULL
      AND COALESCE(t.kind, '') <> 'skipped' AND (t.paid = 1 OR t.date <= unixepoch() + 7 * 86400) ORDER BY t.date`).bind(
      uid,
      walletId
    ),
    DB.prepare(`SELECT ${cols} FROM transactions t WHERE t.user_id = ? AND t.wallet_id = ? AND t.reconciled_id IS NOT NULL
      AND t.date >= unixepoch() - 62 * 86400 ORDER BY t.date`).bind(uid, walletId),
    DB.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
      WHERE user_id = ? AND wallet_id = ? AND reconciled_id IS NOT NULL AND paid = 1`).bind(uid, walletId),
    DB.prepare("SELECT signature, layout FROM import_layouts WHERE user_id = ?").bind(uid),
    DB.prepare("SELECT descriptor, payee FROM payee_aliases WHERE user_id = ?").bind(uid),
  ])
  const withDay = (rows: unknown[]) =>
    (rows as Omit<ReconcileEntry, "day">[]).map((r) => ({ ...r, day: dayOf(r.date, tz) }))
  return {
    account,
    // `printed` is the balance as the statement showed it: what was owed, for a card, at the limit it had then.
    history: (
      history.results as {
        id: string
        statement_day: string
        balance: number
        credit_limit: number | null
        entries: number
        adjustment: number
        created_at: number
      }[]
    ).map((h) => ({ ...h, printed: account.type === "credit" ? (h.credit_limit ?? 0) - h.balance : h.balance })),
    reconciled: (settled.results[0] as { total: number }).total,
    open: withDay(open.results),
    done: withDay(done.results),
    layouts: Object.fromEntries(
      (layouts.results as { signature: string; layout: string }[]).map((l) => [
        l.signature,
        JSON.parse(l.layout) as Layout,
      ])
    ),
    aliases: Object.fromEntries(
      (aliases.results as { descriptor: string; payee: string }[]).map((a) => [a.descriptor, a.payee])
    ),
  }
}

export const finishInput = z.object({
  walletId: z.string().min(1),
  statementDay: day,
  /** The statement's closing balance as Kosha keeps it for this account (available credit for a card). */
  balance: z.number().int(),
  /** The entries ticked as on the statement. */
  ids: z.array(z.string()).max(20_000),
  /** Book the remaining difference as a correction instead of refusing. */
  adjust: z.boolean().default(false),
})

/**
 * Finishes a reconciliation: the ticked entries are reconciled (and paid, for a bill that was still due), and
 * with `adjust` any difference left becomes a correction. Without it, a difference is refused, since the
 * reconciled balance would no longer match the statement.
 */
export async function finishReconcile(uid: string, data: z.infer<typeof finishInput>) {
  const DB = db()
  const { tz } = await getSettings(uid)
  const [found, settled] = await DB.batch([
    DB.prepare(`SELECT id, amount FROM transactions WHERE user_id = ? AND wallet_id = ? AND reconciled_id IS NULL
      AND id IN (SELECT value FROM json_each(?))`).bind(uid, data.walletId, ids(data.ids)),
    DB.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
      WHERE user_id = ? AND wallet_id = ? AND reconciled_id IS NOT NULL AND paid = 1`).bind(uid, data.walletId),
  ])
  const rows = found.results as { id: string; amount: number }[]
  if (rows.length !== new Set(data.ids).size) throw new HttpError(409, m.server_entries_changed())
  const cleared = (settled.results[0] as { total: number }).total + rows.reduce((t, r) => t + r.amount, 0)
  const diff = data.balance - cleared
  const { results: acc } = await DB.prepare(
    "SELECT currency, type, credit_limit FROM wallets WHERE user_id = ? AND id = ?"
  )
    .bind(uid, data.walletId)
    .all<{ currency: string; type: AccountType; credit_limit: number | null }>()
  if (!acc.length) throw new HttpError(404, m.server_account_not_found())
  if (diff && !data.adjust) throw new HttpError(409, m.server_still_off_by({ amount: fmt(diff, acc[0].currency) }))
  const id = crypto.randomUUID()
  const adjustId = diff ? crypto.randomUUID() : null
  await DB.batch([
    DB.prepare(`UPDATE transactions SET reconciled_id = ?, paid = 1, updated_at = unixepoch()
      WHERE user_id = ? AND wallet_id = ? AND id IN (SELECT value FROM json_each(?))`).bind(
      id,
      uid,
      data.walletId,
      ids(data.ids)
    ),
    ...(adjustId
      ? [
          DB.prepare(`INSERT INTO transactions (user_id, id, wallet_id, category_id, name, amount, date, reconciled_id)
            VALUES (?, ?, ?, '${CORRECTION_CATEGORY}', ?, ?, ?, ?)`).bind(
            uid,
            adjustId,
            data.walletId,
            m.server_reconciliation_adjustment(),
            diff,
            unixOf(data.statementDay, tz, 23, 59),
            id
          ),
        ]
      : []),
    DB.prepare(`INSERT INTO reconciliations (user_id, id, wallet_id, statement_day, balance, credit_limit, entries, adjustment, adjustment_tx_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      uid,
      id,
      data.walletId,
      data.statementDay,
      data.balance,
      acc[0].type === "credit" ? (acc[0].credit_limit ?? 0) : null,
      rows.length,
      diff,
      adjustId
    ),
  ])
  return { id, adjustment: diff }
}

/** Undoes an account's latest reconciliation: its entries are open again and its correction goes. */
export async function undoReconcile(uid: string, id: string) {
  const DB = db()
  const r = await DB.prepare("SELECT wallet_id, adjustment_tx_id FROM reconciliations WHERE user_id = ? AND id = ?")
    .bind(uid, id)
    .first<{ wallet_id: string; adjustment_tx_id: string | null }>()
  if (!r) throw new HttpError(404, m.server_reconciliation_not_found())
  const latest = await DB.prepare(
    "SELECT id FROM reconciliations WHERE user_id = ? AND wallet_id = ? ORDER BY statement_day DESC, created_at DESC LIMIT 1"
  )
    .bind(uid, r.wallet_id)
    .first<{ id: string }>()
  if (latest?.id !== id) throw new HttpError(409, m.server_undo_latest_only())
  await DB.batch([
    DB.prepare("DELETE FROM transactions WHERE user_id = ? AND id = ?").bind(uid, r.adjustment_tx_id),
    DB.prepare("UPDATE transactions SET reconciled_id = NULL WHERE user_id = ? AND reconciled_id = ?").bind(uid, id),
    DB.prepare("DELETE FROM reconciliations WHERE user_id = ? AND id = ?").bind(uid, id),
  ])
}

// ---------- import ----------

export const layoutSchema = z.object({
  header: z.number().int().min(-1),
  date: z.number().int().min(0),
  dateFormat: z.enum(["ymd", "dmy", "mdy", "text"]),
  description: z.array(z.number().int().min(0)).max(4),
  amount: z.number().int().min(0).nullable(),
  debit: z.number().int().min(0).nullable(),
  credit: z.number().int().min(0).nullable(),
  invert: z.boolean(),
  balance: z.number().int().min(0).nullable(),
})

export const importInput = z.object({
  walletId: z.string().min(1),
  /** CSV layouts, remembered under their header so the next file from that bank reads straight away. */
  layouts: z
    .array(z.object({ signature: z.string().max(2000), layout: layoutSchema }))
    .max(50)
    .default([]),
  /** Payees chosen for bank descriptions, remembered for next time. */
  aliases: z.array(z.object({ key: z.string().min(1).max(200), payee: z.string().trim().min(1).max(200) })).max(2000),
  lines: z
    .array(
      z.object({
        day,
        amount: z
          .number()
          .int()
          .refine((n) => n !== 0),
        name: z.string().trim().max(200),
        note: z.string().max(2000).default(""),
        /** A category, or for a transfer the other account. */
        categoryId: z.string().optional(),
        transferWith: z.string().optional(),
        ref: z.string().max(200),
      })
    )
    .max(2000),
})

/**
 * Adds statement lines that are missing from Kosha, as entries or as transfers with another account, each
 * keeping the bank's id. Returns the new entries' ids in this account, in line order.
 */
export async function importLines(uid: string, data: z.infer<typeof importInput>) {
  const DB = db()
  const { results: wallets } = await DB.prepare("SELECT id, currency FROM wallets WHERE user_id = ?")
    .bind(uid)
    .all<{ id: string; currency: string }>()
  const own = wallets.find((w) => w.id === data.walletId)
  if (!own) throw new HttpError(404, m.server_account_not_found())
  for (const [i, l] of data.lines.entries()) {
    if (l.transferWith ? !wallets.some((w) => w.id === l.transferWith && w.id !== data.walletId) : !l.categoryId)
      throw new HttpError(400, m.server_line_pick_category({ n: i + 1 }))
  }
  const plain = data.lines.flatMap((l, i) => (l.transferWith ? [] : [{ l, i }]))
  const moves = data.lines.flatMap((l, i) => (l.transferWith ? [{ l, i }] : []))
  const out: string[] = Array(data.lines.length).fill("")
  const saved = await saveTransactions(
    uid,
    plain.map(({ l }) => ({
      walletId: data.walletId,
      categoryId: l.categoryId!,
      name: l.name,
      note: l.note,
      amount: l.amount,
      day: l.day,
      paid: true,
      bankRef: l.ref,
    }))
  )
  plain.forEach(({ i }, n) => (out[i] = saved[n]))
  if (moves.length) {
    const rates = await getRates()
    // ponytail: a transfer to an account in another currency arrives at today's rate; edit it if the bank's differs
    const transferIds = await saveTransfers(
      uid,
      moves.map(({ l }) => {
        const other = wallets.find((w) => w.id === l.transferWith)!
        const outgoing = l.amount < 0
        const [from, to] = outgoing ? [own, other] : [other, own]
        const sent = Math.abs(l.amount)
        return {
          fromWalletId: from.id,
          toWalletId: to.id,
          sent,
          fee: 0,
          received: Math.max(1, Math.round(convert(sent, from.currency, to.currency, rates))),
          provider: "",
          day: l.day,
          note: l.note,
        }
      })
    )
    const legs = await DB.prepare(
      "SELECT id, transfer_id FROM transactions WHERE user_id = ? AND wallet_id = ? AND transfer_id IN (SELECT value FROM json_each(?))"
    )
      .bind(uid, data.walletId, ids(transferIds))
      .all<{ id: string; transfer_id: string }>()
    const leg = new Map(legs.results.map((r) => [r.transfer_id, r.id]))
    await DB.batch(
      moves.map(({ l, i }, n) => {
        out[i] = leg.get(transferIds[n]) ?? ""
        return DB.prepare("UPDATE transactions SET bank_ref = ? WHERE user_id = ? AND id = ?").bind(l.ref, uid, out[i])
      })
    )
  }
  const remember = [
    ...data.layouts.map((l) =>
      DB.prepare(`INSERT INTO import_layouts (user_id, signature, layout) VALUES (?, ?, ?)
        ON CONFLICT(user_id, signature) DO UPDATE SET layout = excluded.layout, updated_at = unixepoch()`).bind(
        uid,
        l.signature,
        JSON.stringify(l.layout)
      )
    ),
    ...data.aliases.map((a) =>
      DB.prepare(`INSERT INTO payee_aliases (user_id, descriptor, payee) VALUES (?, ?, ?)
        ON CONFLICT(user_id, descriptor) DO UPDATE SET payee = excluded.payee`).bind(uid, a.key, a.payee)
    ),
  ]
  if (remember.length) await DB.batch(remember)
  return out
}

// ---------- spotting recurring payments ----------

/**
 * Payments that look recurring but aren't set up as such, most costly first, leaving out dismissed payees.
 * Transfer fees are left out too: they come with their transfer.
 */
export async function recurringSuggestions(uid: string) {
  const DB = db()
  const { tz } = await getSettings(uid)
  const today = dayOf(Date.now() / 1000, tz)
  const [rows, subs, dismissed] = await DB.batch([
    DB.prepare(`SELECT id, name, amount, date, category_id, wallet_id FROM transactions WHERE user_id = ? AND paid = 1
      AND subscription_id IS NULL AND transfer_id IS NULL AND name <> '' AND category_id NOT IN ${NEUTRAL_SQL}
      AND category_id <> 'transfer_fee'
      AND date >= unixepoch() - 800 * 86400`).bind(uid),
    DB.prepare(
      "SELECT lower(trim(name)) AS name FROM subscriptions WHERE user_id = ? AND (end_day IS NULL OR end_day >= ?)"
    ).bind(uid, today),
    DB.prepare("SELECT payee FROM recurring_dismissed WHERE user_id = ?").bind(uid),
  ])
  const skip = new Set([
    ...(subs.results as { name: string }[]).map((s) => s.name),
    ...(dismissed.results as { payee: string }[]).map((d) => d.payee),
  ])
  const payments = (
    rows.results as { id: string; name: string; amount: number; date: number; category_id: string; wallet_id: string }[]
  ).map((r) => ({ ...r, day: dayOf(r.date, tz) }))
  return findRecurring(payments, today)
    .filter((g) => !skip.has(g.name.toLowerCase()))
    .slice(0, 12)
}

export async function dismissRecurring(uid: string, payee: string) {
  await db()
    .prepare("INSERT OR IGNORE INTO recurring_dismissed (user_id, payee) VALUES (?, ?)")
    .bind(uid, payee.trim().toLowerCase())
    .run()
}

/**
 * Files past payments under a new recurring schedule, so its history shows them and they stop being
 * suggested. Each keeps its own day as its due day. Transfers and payments already filed are left alone.
 */
export async function linkPayments(uid: string, subscriptionId: string, list: string[]) {
  const DB = db()
  const { tz } = await getSettings(uid)
  const sub = await DB.prepare("SELECT 1 FROM subscriptions WHERE user_id = ? AND id = ?")
    .bind(uid, subscriptionId)
    .first()
  if (!sub) throw new HttpError(404, m.server_recurring_not_found())
  const { results } = await DB.prepare(`SELECT id, date FROM transactions WHERE user_id = ? AND subscription_id IS NULL
    AND transfer_id IS NULL AND id IN (SELECT value FROM json_each(?))`)
    .bind(uid, ids(list))
    .all<{ id: string; date: number }>()
  const seen = new Set<string>()
  const writes = results.flatMap((r) => {
    const due = dayOf(r.date, tz)
    if (seen.has(due)) return []
    seen.add(due)
    return [
      DB.prepare("UPDATE transactions SET subscription_id = ?, due_day = ? WHERE user_id = ? AND id = ?").bind(
        subscriptionId,
        due,
        uid,
        r.id
      ),
    ]
  })
  if (writes.length) await DB.batch(writes)
  return writes.length
}

// ---------- the public API's statement check and reconcile ----------

const base64Pdf = (content: string) => content.trimStart().startsWith("JVBER") // "%PDF" in base64

/**
 * Reads a statement file (CSV, OFX or QFX here; a PDF through the AI model) and checks it against the
 * account, as the Reconcile page does: matches, missing lines with suggested payees and categories, entries
 * not on the statement, the difference with the closing balance, and the hints for it. With `explain`,
 * the AI model also says what most likely explains a difference. A CSV's columns are remembered.
 */
export async function checkStatement(
  uid: string,
  input: {
    accountId: string
    file: { name: string; content: string; format?: "csv" | "ofx" | "qfx" | "pdf" }
    columns?: Layout
    explain: boolean
  }
) {
  const data = await reconcileData(uid, input.accountId)
  const a = data.account
  if (a.type === "investment")
    throw new HttpError(400, "Investments are valued, not reconciled. Record the broker's value with record_gains.")
  const credit = a.type === "credit"
  const limit = a.credit_limit ?? 0
  const { prefs, primary } = await getSettings(uid)
  const ext = input.file.name.toLowerCase().match(/\.(csv|ofx|qfx|pdf|txt)$/)?.[1]
  const format =
    input.file.format ??
    (ext === "pdf" || base64Pdf(input.file.content)
      ? "pdf"
      : isOfx(input.file.content)
        ? "ofx"
        : ext === "qfx"
          ? "qfx"
          : "csv")
  let lines: (Line & { payee?: string })[] = []
  let withdrawn: string[] = []
  let closing: number | null = null
  let closingDay: string | null = null
  let addsUp: boolean | null = null
  let columns: Layout | null = null
  if (format === "pdf") {
    const r = await ai.readStatement(uid, { walletId: a.id, name: input.file.name, data: input.file.content })
    lines = r.lines
    closing = r.closing
    closingDay = r.to
    addsUp = r.off === null ? null : r.off === 0
  } else if (format === "ofx" || format === "qfx") {
    const r = parseOfx(input.file.content)
    lines = r.lines
    withdrawn = r.withdrawn
    // Cards report what's owed as a negative balance.
    closing = r.closing === null ? null : credit ? -r.closing : r.closing
    closingDay = r.closingDay
  } else {
    const rows = parseCsv(input.file.content)
    if (rows.length < 2) throw new HttpError(400, "That file has no rows Kosha can read.")
    const guess = guessLayout(rows, credit)
    const signature = layoutSignature(rows, guess.layout)
    columns = input.columns ?? data.layouts[signature] ?? guess.layout
    if (!input.columns && !data.layouts[signature] && !guess.confident && (await ai.aiLive(uid, "statements"))) {
      const roles = await ai.readLayout(uid, { rows: rows.slice(0, 12).map((r) => r.slice(0, 60)) })
      columns = {
        ...columns,
        ...roles,
        dateFormat: guessDateFormat(rows.slice(roles.header + 1).map((r) => r[roles.date] ?? "")) ?? columns.dateFormat,
      }
    }
    lines = readCsv(rows, columns).lines
    if (lines.length) {
      // The running balance after the latest line is the closing balance. A card's balance column is ambiguous.
      const ascending = lines[0].day <= lines[lines.length - 1].day
      closing = credit ? null : ascending ? lines[lines.length - 1].balance : lines[0].balance
      await db()
        .prepare(`INSERT INTO import_layouts (user_id, signature, layout) VALUES (?, ?, ?)
          ON CONFLICT(user_id, signature) DO UPDATE SET layout = excluded.layout, updated_at = unixepoch()`)
        .bind(uid, signature, JSON.stringify(columns))
        .run()
    }
  }
  if (!lines.length) throw new HttpError(400, "Kosha found no transactions in that file. Check its format and columns.")
  const statementDay = closingDay ?? lines.reduce((m, l) => (l.day > m ? l.day : m), lines[0].day)

  const entry = (e: ReconcileEntry) => ({
    id: e.id,
    day: e.day,
    amount: e.amount,
    name: e.name,
    ref: e.bank_ref,
    paid: e.paid,
  })
  const plan = planReconciliation({
    lines,
    open: data.open.map(entry),
    done: data.done.map(entry),
    statementDay,
    lastDay: data.history[0]?.statement_day ?? null,
    withdrawn,
  })

  // Payees and categories for the lines missing from Kosha: remembered names, past payees, rules, then AI.
  const [{ results: titles }, { results: rules }] = await Promise.all([
    db()
      .prepare(
        "SELECT name FROM transactions WHERE user_id = ? AND name <> '' GROUP BY name ORDER BY COUNT(*) DESC LIMIT 300"
      )
      .bind(uid)
      .all<{ name: string }>(),
    db().prepare("SELECT title, category_id, exact FROM title_rules WHERE user_id = ?").bind(uid).all<TitleRule>(),
  ])
  const known = titles.map((t) => t.name)
  const guessing = prefs.suggest_category === "1"
  const suggested = new Map<number, { payee: string; categoryId: string | null }>()
  for (const i of plan.missing) {
    const l = lines[i]
    const payee = l.payee || payeeFor(l.description, known, data.aliases)
    const category = guessing ? (guessCategory(payee, rules) ?? guessCategory(l.description, rules)) : null
    suggested.set(i, { payee, categoryId: category })
  }
  if (prefs.ai_share_payee === "1" && (await ai.aiLive(uid, "statements"))) {
    const todo = plan.missing.filter((i) => {
      const key = descriptorKey(lines[i].description)
      return key && !data.aliases[key] && (!known.includes(suggested.get(i)!.payee) || !suggested.get(i)!.categoryId)
    })
    if (todo.length) {
      const named = await ai
        .tidyLines(uid, {
          items: [...new Map(todo.map((i) => [descriptorKey(lines[i].description), lines[i]])).entries()]
            .slice(0, 300)
            .map(([key, l]) => ({ key, text: l.description, amount: l.amount })),
        })
        .catch(() => ({}) as Awaited<ReturnType<typeof ai.tidyLines>>)
      for (const i of todo) {
        const n = named[descriptorKey(lines[i].description)]
        const s = suggested.get(i)!
        if (n) suggested.set(i, { payee: lines[i].payee || n.payee, categoryId: s.categoryId ?? n.categoryId })
      }
    }
  }

  const ticked = data.open.filter((e) => plan.ticks(entry(e)))
  const cleared = data.reconciled + ticked.reduce((t, e) => t + e.amount, 0)
  const toKosha = (v: number) => (credit ? limit - v : v)
  const fromKosha = (v: number) => (credit ? limit - v : v)
  const diff = closing === null ? null : toKosha(closing) - cleared
  const money = (v: number) => fmt(v, a.currency)
  const item = (e: ReconcileEntry) => ({ id: e.id, amount: e.amount, day: e.day, name: e.name || "a transfer" })
  const missingTotal = plan.missing.reduce((t, i) => t + lines[i].amount, 0)
  const unticked = data.open.filter((e) => e.day <= statementDay && !plan.ticks(entry(e)))
  const hints =
    diff === null || diff === 0
      ? []
      : [
          ...(plan.missing.length
            ? [
                {
                  text:
                    missingTotal === diff
                      ? `Adding the ${plan.missing.length} statement lines missing from Kosha closes the difference exactly.`
                      : `${plan.missing.length} statement lines aren't in Kosha yet (${money(missingTotal)}).`,
                  ids: [],
                },
              ]
            : []),
          ...plan.withdrawn.map((id) => {
            const e = data.open.find((x) => x.id === id)!
            return {
              text: `The bank withdrew ${e.name || "a transfer"} (${money(e.amount)}) after Kosha imported it. Delete it if it's gone.`,
              ids: [id],
            }
          }),
          ...plan.splits.map((g) => {
            const names = g.entries.map((id) => data.open.find((x) => x.id === id)!.name || "a transfer")
            return {
              text:
                g.lines.length === 1
                  ? `The statement's ${money(lines[g.lines[0]].amount)} may be ${names.join(" + ")} together.`
                  : `${names[0]} may be the statement's ${g.lines.map((i) => money(lines[i].amount)).join(" + ")} together.`,
              ids: g.entries,
            }
          }),
          ...plan.close.map((p) => {
            const e = data.open.find((x) => x.id === p.entry)!
            return {
              text: `${e.name || "A transfer"}: Kosha has ${money(e.amount)}, the statement ${money(lines[p.line].amount)}.`,
              ids: [e.id],
            }
          }),
          ...differenceHints(diff, ticked.map(item), unticked.map(item), statementDay, money).filter(
            (h) => h.ids.length || (!plan.missing.length && !plan.close.length)
          ),
        ].slice(0, 6)
  const explanation =
    input.explain && diff
      ? await ai.explainDifference(uid, {
          statementDay,
          diff,
          currency: a.currency,
          ticked: ticked.slice(-400).map(item),
          unticked: unticked.slice(-400).map(item),
          missing: plan.missing
            .slice(0, 400)
            .map((i) => ({ day: lines[i].day, amount: lines[i].amount, text: lines[i].description })),
          close: plan.close.map((p) => ({ id: p.entry, statementAmount: lines[p.line].amount })),
        })
      : null
  const openIds = new Set(data.open.map((e) => e.id))
  const KIND = {
    ref: "bank_ref",
    exact: "same_amount",
    split: "split",
    close: "close_amount",
    corrected: "bank_correction",
  } as const
  return {
    format: format === "qfx" ? ("ofx" as const) : format,
    primary,
    statement: {
      from: lines.reduce((m, l) => (l.day < m ? l.day : m), lines[0].day),
      to: statementDay,
      closingBalance: closing,
      linesAddUp: addsUp,
    },
    columns,
    lines: lines.map((l, i) => {
      // A split line matches several entries.
      const ps = plan.pairs.filter((x) => x.line === i)
      const p = ps[0]
      const s = suggested.get(i)
      return {
        index: i,
        day: l.day,
        amount: l.amount,
        description: l.description,
        bankRef: l.ref ?? "",
        match: p
          ? {
              transactionId: p.entry,
              transactionIds: ps.map((x) => x.entry),
              kind: KIND[p.kind],
              reconciled: ps.every((x) => !openIds.has(x.entry)),
            }
          : null,
        payee: s?.payee ?? null,
        categoryId: s?.categoryId ?? null,
      }
    }),
    withdrawn: plan.withdrawn,
    notOnStatement: data.open
      .filter((e) => plan.inPeriod(e) && !plan.matched.has(e.id) && !plan.close.some((p) => p.entry === e.id))
      .map((e) => e.id),
    reconciliation: {
      statementDay,
      statementBalance: closing,
      tickedBalance: fromKosha(cleared),
      difference: diff === null ? null : credit ? -diff : diff,
      transactionIds: ticked.map((e) => e.id),
      hints: hints.map((h) => ({ text: h.text, transactionIds: h.ids })),
    },
    explanation: explanation && {
      summary: explanation.summary,
      suggestions: explanation.suggestions.map((s) => ({ text: s.text, transactionIds: s.ids })),
    },
  }
}

/**
 * Reconciles an account to a statement balance as printed (for a card, what is owed). Without ids, every
 * paid entry up to the statement day counts. A difference is refused unless `correct` books it as a correction.
 */
export async function reconcileAccount(
  uid: string,
  input: {
    accountId: string
    statementDay: string
    statementBalance: number
    transactionIds?: string[]
    correct: boolean
  }
) {
  const data = await reconcileData(uid, input.accountId)
  const a = data.account
  if (a.type === "investment")
    throw new HttpError(400, "Investments are valued, not reconciled. Record the broker's value with record_gains.")
  const credit = a.type === "credit"
  const balance = credit ? (a.credit_limit ?? 0) - input.statementBalance : input.statementBalance
  const ids = input.transactionIds ?? data.open.filter((e) => e.paid && e.day <= input.statementDay).map((e) => e.id)
  const open = new Map(data.open.map((e) => [e.id, e]))
  const unknown = ids.filter((id) => !open.has(id))
  if (unknown.length)
    throw new HttpError(
      409,
      `Not open entries of ${a.name}: ${unknown.slice(0, 5).join(", ")}. Reconciled entries and other accounts' can't be ticked again.`
    )
  const cleared = data.reconciled + ids.reduce((t, id) => t + open.get(id)!.amount, 0)
  const diff = balance - cleared
  const money = (v: number) => fmt(v, a.currency)
  if (diff && !input.correct)
    throw new HttpError(
      409,
      `Off by ${money(Math.abs(diff))}: the statement says ${money(input.statementBalance)}${credit ? " owed" : ""}, and the entries come to ${money(credit ? (a.credit_limit ?? 0) - cleared : cleared)}. Call check_statement with the statement file to see why, or pass correctDifference: true to book the difference as a correction.`
    )
  const r = await finishReconcile(uid, {
    walletId: a.id,
    statementDay: input.statementDay,
    balance,
    ids,
    adjust: input.correct,
  })
  return { id: r.id, entries: ids.length, adjustment: r.adjustment }
}

/** Undoes an account's latest reconciliation. */
export async function undoLatest(uid: string, walletId: string) {
  const last = await db()
    .prepare(
      "SELECT id, statement_day, entries FROM reconciliations WHERE user_id = ? AND wallet_id = ? ORDER BY statement_day DESC, created_at DESC LIMIT 1"
    )
    .bind(uid, walletId)
    .first<{ id: string; statement_day: string; entries: number }>()
  if (!last) throw new HttpError(404, "That account has no reconciliation to undo.")
  await undoReconcile(uid, last.id)
  return { statementDay: last.statement_day, entries: last.entries }
}

// ---------- getting started: importing many statements ----------

/** What earlier imports taught Kosha: CSV layouts by header, and payees for bank descriptions. */
export async function importMemory(uid: string) {
  const DB = db()
  const [layouts, aliases] = await DB.batch([
    DB.prepare("SELECT signature, layout FROM import_layouts WHERE user_id = ?").bind(uid),
    DB.prepare("SELECT descriptor, payee FROM payee_aliases WHERE user_id = ?").bind(uid),
  ])
  return {
    layouts: Object.fromEntries(
      (layouts.results as { signature: string; layout: string }[]).map((l) => [
        l.signature,
        JSON.parse(l.layout) as Layout,
      ])
    ),
    aliases: Object.fromEntries(
      (aliases.results as { descriptor: string; payee: string }[]).map((a) => [a.descriptor, a.payee])
    ),
  }
}

export const entriesInput = z.object({ walletId: z.string().min(1), from: day, to: day })

/** An account's entries over some days, so an import can leave out the statement lines it already has. */
export async function importEntries(uid: string, { walletId, from, to }: z.infer<typeof entriesInput>) {
  const { tz } = await getSettings(uid)
  const { results } = await db()
    .prepare(`SELECT id, date, amount, name, bank_ref FROM transactions WHERE user_id = ? AND wallet_id = ?
      AND category_id <> '${CORRECTION_CATEGORY}' AND COALESCE(kind, '') <> 'skipped' AND date >= ? AND date < ?`)
    .bind(uid, walletId, unixOf(addDays(from, -7), tz), unixOf(addDays(to, 8), tz))
    .all<{ id: string; date: number; amount: number; name: string; bank_ref: string | null }>()
  return results.map((r) => ({ id: r.id, day: dayOf(r.date, tz), amount: r.amount, name: r.name, ref: r.bank_ref }))
}

export const pairsInput = z.object({
  pairs: z
    .array(
      z.object({
        fromWalletId: z.string().min(1),
        toWalletId: z.string().min(1),
        /** What left the first account and what arrived in the second, both positive. */
        sent: z.number().int().positive(),
        received: z.number().int().positive(),
        day,
        refFrom: z.string().max(200),
        refTo: z.string().max(200),
      })
    )
    .min(1)
    .max(200),
})

/** Saves statement lines from two accounts that are one transfer, as one transfer, each half keeping its bank id. */
export async function importTransferPairs(uid: string, data: z.infer<typeof pairsInput>) {
  const DB = db()
  const ids = await saveTransfers(
    uid,
    data.pairs.map((p) => ({
      fromWalletId: p.fromWalletId,
      toWalletId: p.toWalletId,
      sent: p.sent,
      fee: 0,
      received: p.received,
      provider: "",
      day: p.day,
      note: "",
    }))
  )
  await DB.batch(
    data.pairs.flatMap((p, i) => [
      DB.prepare("UPDATE transactions SET bank_ref = ? WHERE user_id = ? AND transfer_id = ? AND amount < 0").bind(
        p.refFrom,
        uid,
        ids[i]
      ),
      DB.prepare("UPDATE transactions SET bank_ref = ? WHERE user_id = ? AND transfer_id = ? AND amount > 0").bind(
        p.refTo,
        uid,
        ids[i]
      ),
    ])
  )
  return ids.length
}

export const finishImportInput = z.object({
  walletId: z.string().min(1),
  /** The first imported day; an opening balance goes at its start. */
  firstDay: day,
  /** The latest statement's closing balance as Kosha keeps it (available credit for a card), and its day. */
  closing: z.object({ day, balance: z.number().int() }).nullable(),
  /** For an account that existed before the import, its balance then, which it keeps. Null for a new account. */
  keep: z.number().int().nullable(),
})

/**
 * Finishes one account after an import. An opening balance, dated at its first line, makes the account meet
 * the latest statement's closing balance, and everything up to that statement is reconciled to it. An account
 * that existed keeps today's balance: one correction now replaces those made after the statement, since the
 * statements fill in its past, not its present. An account reconciled before keeps its history as it is.
 */
export async function finishImport(uid: string, data: z.infer<typeof finishImportInput>) {
  const DB = db()
  const { tz } = await getSettings(uid)
  const account = await DB.prepare(`SELECT id, (SELECT COUNT(*) FROM reconciliations
    WHERE user_id = wallets.user_id AND wallet_id = wallets.id) AS done FROM wallets WHERE user_id = ? AND id = ?`)
    .bind(uid, data.walletId)
    .first<{ id: string; done: number }>()
  if (!account) throw new HttpError(404, m.server_account_not_found())
  let opening = 0
  let reconciled = false
  if (data.closing && !account.done) {
    const end = unixOf(addDays(data.closing.day, 1), tz)
    const sum = await DB.prepare(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE user_id = ? AND wallet_id = ? AND paid = 1 AND date < ?"
    )
      .bind(uid, data.walletId, end)
      .first<{ total: number }>()
    opening = data.closing.balance - (sum?.total ?? 0)
    await DB.batch([
      ...(opening
        ? [
            DB.prepare(`INSERT INTO transactions (user_id, id, wallet_id, category_id, name, amount, date)
            VALUES (?, ?, ?, '${CORRECTION_CATEGORY}', ?, ?, ?)`).bind(
              uid,
              crypto.randomUUID(),
              data.walletId,
              m.server_opening_balance(),
              opening,
              unixOf(data.firstDay, tz)
            ),
          ]
        : []),
      ...(data.keep !== null
        ? [
            DB.prepare(`DELETE FROM transactions WHERE user_id = ? AND wallet_id = ? AND category_id = '${CORRECTION_CATEGORY}'
            AND transfer_id IS NULL AND date >= ?`).bind(uid, data.walletId, end),
          ]
        : []),
    ])
    const { results } = await DB.prepare(`SELECT id FROM transactions WHERE user_id = ? AND wallet_id = ?
      AND reconciled_id IS NULL AND paid = 1 AND date < ?`)
      .bind(uid, data.walletId, end)
      .all<{ id: string }>()
    try {
      await finishReconcile(uid, {
        walletId: data.walletId,
        statementDay: data.closing.day,
        balance: data.closing.balance,
        ids: results.map((r) => r.id),
        adjust: false,
      })
      reconciled = true
    } catch {} // it stays open, to reconcile by hand
  }
  if (data.keep !== null)
    await DB.prepare(`INSERT INTO transactions (user_id, id, wallet_id, category_id, name, amount, date)
      SELECT ?1, ?2, ?3, '${CORRECTION_CATEGORY}', ?5, diff, unixepoch()
      FROM (SELECT ?4 - COALESCE(SUM(amount), 0) AS diff FROM transactions WHERE user_id = ?1 AND wallet_id = ?3 AND paid = 1)
      WHERE diff <> 0`)
      .bind(uid, crypto.randomUUID(), data.walletId, data.keep, m.server_balance_correction())
      .run()
  return { opening, reconciled }
}
