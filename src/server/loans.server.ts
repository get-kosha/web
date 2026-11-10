import { z } from "zod"
import { m } from "@/paraglide/messages"
import { dayOf, entryDate, isNeutral, LOAN_CATEGORY } from "@/lib/core"
import { loanInput, loanRepaymentInput, loanEditInput, loanUnlinkInput, type Loan, type LoanPayment } from "@/lib/loans"
import { db, getRates, getSettings, HttpError } from "@/server/db.server"

const fail = (message: string, status = 400): never => {
  throw new HttpError(status, message)
}
const hash = async (data: unknown) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(data)))))
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")
async function write(statements: D1PreparedStatement[]) {
  try {
    await db().batch(statements)
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (message.includes("loan_overpaid")) fail(m.loans_overpaid(), 409)
    if (message.includes("loan_unlink_repayments")) fail(m.loans_unlink_repayments(), 409)
    if (message.includes("loan_")) fail(m.loans_invalid_payment(), 409)
    throw error
  }
}

export async function listLoans(uid: string, at = Number.MAX_SAFE_INTEGER): Promise<Loan[]> {
  const { tz } = await getSettings(uid)
  const { results } = await db()
    .prepare(`SELECT l.*, COALESCE((SELECT SUM(p.principal) FROM loan_payments p
    JOIN transactions t ON t.user_id = p.user_id AND t.id = p.transaction_id
    WHERE p.user_id = l.user_id AND p.loan_id = l.id AND p.kind = 'repayment' AND t.date <= ?2), 0) AS repaid
    FROM loans l WHERE l.user_id = ?1 AND l.started_at <= ?2 ORDER BY l.created_at DESC, l.id`)
    .bind(uid, at)
    .all<{
      id: string
      direction: "lent" | "borrowed"
      person: string
      purpose: string
      note: string
      currency: string
      principal: number
      started_at: number
      due_day: string | null
      opening: number
      repaid: number
    }>()
  return results.map((l) => ({
    id: l.id,
    direction: l.direction,
    person: l.person,
    purpose: l.purpose,
    note: l.note,
    currency: l.currency,
    principal: l.principal,
    repaid: l.repaid,
    remaining: l.principal - l.repaid,
    day: dayOf(l.started_at, tz),
    dueDay: l.due_day,
    opening: !!l.opening,
  }))
}

export async function loanDetails(uid: string, id: string) {
  const loan = (await listLoans(uid)).find((l) => l.id === id)
  if (!loan) return fail(m.loans_not_found(), 404)
  const { tz } = await getSettings(uid)
  const { results } = await db()
    .prepare(`SELECT p.transaction_id, p.kind, p.principal, t.amount, t.date, t.note,
      t.wallet_id, t.reconciled_id, w.name, w.currency FROM loan_payments p
    JOIN transactions t ON t.user_id = p.user_id AND t.id = p.transaction_id
    JOIN wallets w ON w.user_id = t.user_id AND w.id = t.wallet_id
    WHERE p.user_id = ? AND p.loan_id = ? ORDER BY t.date DESC, t.id`)
    .bind(uid, id)
    .all<{
      transaction_id: string
      kind: "funding" | "repayment"
      principal: number
      amount: number
      date: number
      note: string
      wallet_id: string
      reconciled_id: string | null
      name: string
      currency: string
    }>()
  const payments: LoanPayment[] = results.map((p) => ({
    transactionId: p.transaction_id,
    kind: p.kind,
    principal: p.principal,
    amount: p.amount,
    day: dayOf(p.date, tz),
    note: p.note,
    currency: p.currency,
    accountId: p.wallet_id,
    accountName: p.name,
    reconciled: !!p.reconciled_id,
  }))
  return { loan, payments }
}

/** Dated changes to receivables/liabilities, kept separate from cash for historical net worth. */
export async function loanChanges(uid: string) {
  return (
    await db()
      .prepare(`SELECT started_at AS date, currency, CASE WHEN direction = 'lent' THEN principal ELSE -principal END AS amount FROM loans WHERE user_id = ?1
    UNION ALL SELECT t.date, l.currency, CASE WHEN l.direction = 'lent' THEN -p.principal ELSE p.principal END
    FROM loan_payments p JOIN loans l ON l.user_id = p.user_id AND l.id = p.loan_id
    JOIN transactions t ON t.user_id = p.user_id AND t.id = p.transaction_id
    WHERE p.user_id = ?1 AND p.kind = 'repayment' ORDER BY date`)
      .bind(uid)
      .all<{ date: number; currency: string; amount: number }>()
  ).results
}

async function movement(uid: string, transactionId: string) {
  const row = await db()
    .prepare(`SELECT t.*, w.currency, w.archived,
    EXISTS (SELECT 1 FROM loan_payments p WHERE p.user_id = t.user_id AND p.transaction_id = t.id) AS linked,
    EXISTS (SELECT 1 FROM transactions r WHERE r.user_id = t.user_id AND r.refund_of = t.id) AS refunds
    FROM transactions t JOIN wallets w ON w.user_id = t.user_id AND w.id = t.wallet_id
    WHERE t.user_id = ? AND t.id = ?`)
    .bind(uid, transactionId)
    .first<{
      id: string
      amount: number
      date: number
      wallet_id: string
      currency: string
      archived: number
      paid: number
      transfer_id: string | null
      subscription_id: string | null
      refund_of: string | null
      category_id: string
      linked: number
      refunds: number
    }>()
  if (
    !row ||
    row.linked ||
    !row.paid ||
    row.transfer_id ||
    row.subscription_id ||
    row.refund_of ||
    row.refunds ||
    isNeutral(row.category_id)
  )
    return fail(m.loans_invalid_payment())
  return row
}
async function account(uid: string, id: string | undefined) {
  if (!id) return fail(m.loans_choose_account())
  const row = await db()
    .prepare("SELECT id, currency, archived FROM wallets WHERE user_id = ? AND id = ?")
    .bind(uid, id)
    .first<{ id: string; currency: string; archived: number }>()
  if (!row || row.archived) return fail(m.loans_choose_account())
  return row
}
function checkDay(day: string, tz: string, due?: string | null) {
  if (day > dayOf(Date.now() / 1000, tz) || (due && due < day)) fail(m.loans_invalid_date())
}
const insertMovement = (
  uid: string,
  id: string,
  accountId: string,
  person: string,
  amount: number,
  date: number,
  note: string
) =>
  db()
    .prepare(
      `INSERT INTO transactions (user_id, id, wallet_id, category_id, name, amount, date, note, paid) VALUES (?, ?, ?, '${LOAN_CATEGORY}', ?, ?, ?, ?, 1)`
    )
    .bind(uid, id, accountId, person, amount, date, note)
const insertPayment = (uid: string, id: string, loanId: string, kind: string, amount: number, receipt: string) =>
  db()
    .prepare(
      "INSERT INTO loan_payments (user_id, transaction_id, loan_id, kind, principal, request_hash) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(uid, id, loanId, kind, amount, receipt)

export async function createLoan(uid: string, data: z.infer<typeof loanInput>) {
  const receipt = await hash(data)
  const old = await db()
    .prepare("SELECT request_hash FROM loans WHERE user_id = ? AND id = ?")
    .bind(uid, data.id)
    .first<{ request_hash: string }>()
  if (old) {
    if (old.request_hash !== receipt) return fail(m.loans_retry_conflict(), 409)
    return data.id
  }
  const { tz } = await getSettings(uid)
  checkDay(data.day, tz, data.dueDay)
  if (!(data.currency in (await getRates()))) return fail(m.loans_invalid_payment())
  let date = entryDate(data.day, tz, Math.floor(Date.now() / 1000))
  let transactionId: string | null = null
  const writes: D1PreparedStatement[] = []
  if (data.source === "existing") {
    if (!data.transactionId) return fail(m.loans_invalid_payment())
    const tx = await movement(uid, data.transactionId)
    if (
      tx.currency !== data.currency ||
      Math.abs(tx.amount) !== data.amount ||
      dayOf(tx.date, tz) !== data.day ||
      tx.amount < 0 !== (data.direction === "lent")
    )
      return fail(m.loans_invalid_payment())
    date = tx.date
    transactionId = tx.id
  } else if (data.source === "new") {
    const wallet = await account(uid, data.accountId)
    if (wallet.currency !== data.currency) return fail(m.loans_invalid_payment())
    transactionId = data.id
    writes.push(
      insertMovement(
        uid,
        transactionId,
        wallet.id,
        data.person,
        data.amount * (data.direction === "lent" ? -1 : 1),
        date,
        data.note
      )
    )
  }
  writes.unshift(
    db()
      .prepare(
        `INSERT INTO loans (user_id, id, direction, person, purpose, currency, principal, started_at, due_day, note, opening, request_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        uid,
        data.id,
        data.direction,
        data.person,
        data.purpose,
        data.currency,
        data.amount,
        date,
        data.dueDay,
        data.note,
        data.source === "opening" ? 1 : 0,
        receipt
      )
  )
  if (transactionId) writes.push(insertPayment(uid, transactionId, data.id, "funding", data.amount, receipt))
  try {
    await write(writes)
  } catch (error) {
    const completed = await db()
      .prepare("SELECT request_hash FROM loans WHERE user_id = ? AND id = ?")
      .bind(uid, data.id)
      .first<{ request_hash: string }>()
    if (completed && completed.request_hash !== receipt) return fail(m.loans_retry_conflict(), 409)
    if (!completed) throw error
  }
  return data.id
}

export async function recordLoanRepayment(uid: string, data: z.infer<typeof loanRepaymentInput>) {
  const receipt = await hash(data)
  const txId = data.transactionId ?? data.id
  const old = await db()
    .prepare("SELECT request_hash FROM loan_payments WHERE user_id = ? AND transaction_id = ?")
    .bind(uid, txId)
    .first<{ request_hash: string }>()
  if (old) {
    if (old.request_hash !== receipt) return fail(m.loans_retry_conflict(), 409)
    return data.loanId
  }
  const { loan } = await loanDetails(uid, data.loanId)
  if (data.amount > loan.remaining) return fail(m.loans_overpaid(), 409)
  const { tz } = await getSettings(uid)
  checkDay(data.day, tz)
  if (data.day < loan.day) return fail(m.loans_invalid_date())
  let date = entryDate(data.day, tz, Math.floor(Date.now() / 1000))
  const writes: D1PreparedStatement[] = []
  if (data.transactionId) {
    const tx = await movement(uid, data.transactionId)
    if (
      dayOf(tx.date, tz) !== data.day ||
      tx.amount > 0 !== (loan.direction === "lent") ||
      (tx.currency === loan.currency && Math.abs(tx.amount) !== data.amount)
    )
      return fail(m.loans_invalid_payment())
  } else {
    const wallet = await account(uid, data.accountId)
    const amount = wallet.currency === loan.currency ? data.amount : data.accountAmount
    if (!amount) return fail(m.loans_invalid_payment())
    // Same-day repayments can follow funding recorded seconds earlier; keep the bank day and use now.
    if (data.day === loan.day)
      date = Math.max(
        date,
        (await db()
          .prepare("SELECT started_at FROM loans WHERE user_id = ? AND id = ?")
          .bind(uid, loan.id)
          .first<{ started_at: number }>())!.started_at
      )
    writes.push(
      insertMovement(uid, txId, wallet.id, loan.person, amount * (loan.direction === "lent" ? 1 : -1), date, data.note)
    )
  }
  writes.push(insertPayment(uid, txId, loan.id, "repayment", data.amount, receipt))
  try {
    await write(writes)
  } catch (error) {
    const completed = await db()
      .prepare("SELECT request_hash FROM loan_payments WHERE user_id = ? AND transaction_id = ?")
      .bind(uid, txId)
      .first<{ request_hash: string }>()
    if (completed && completed.request_hash !== receipt) return fail(m.loans_retry_conflict(), 409)
    if (!completed) throw error
  }
  return loan.id
}

export async function editLoan(uid: string, data: z.infer<typeof loanEditInput>) {
  const { loan } = await loanDetails(uid, data.id)
  if (data.dueDay && data.dueDay < loan.day) return fail(m.loans_invalid_date())
  await db()
    .prepare("UPDATE loans SET person = ?, purpose = ?, note = ?, due_day = ? WHERE user_id = ? AND id = ?")
    .bind(
      data.person ?? loan.person,
      data.purpose ?? loan.purpose,
      data.note ?? loan.note,
      data.dueDay === undefined ? loan.dueDay : data.dueDay,
      uid,
      data.id
    )
    .run()
}

/** Detach a bank movement with an explicit ordinary category; keep bank references and reconciliation. */
export async function unlinkLoanPayment(uid: string, data: z.infer<typeof loanUnlinkInput>) {
  const p = await db()
    .prepare(
      `SELECT p.loan_id, p.kind, t.amount FROM loan_payments p JOIN transactions t ON t.user_id = p.user_id AND t.id = p.transaction_id WHERE p.user_id = ? AND p.transaction_id = ?`
    )
    .bind(uid, data.transactionId)
    .first<{ loan_id: string; kind: string; amount: number }>()
  if (!p) return fail(m.loans_not_found(), 404)
  const category = await db()
    .prepare(
      "SELECT id FROM categories WHERE user_id = ? AND id = ? AND archived = 0 AND parent_id IS NULL AND income = ?"
    )
    .bind(uid, data.categoryId, p.amount > 0 ? 1 : 0)
    .first()
  if (!category || isNeutral(data.categoryId)) return fail(m.loans_choose_category())
  await write([
    db().prepare("DELETE FROM loan_payments WHERE user_id = ? AND transaction_id = ?").bind(uid, data.transactionId),
    db()
      .prepare(
        "UPDATE transactions SET category_id = ?, subcategory_id = NULL, updated_at = unixepoch() WHERE user_id = ? AND id = ?"
      )
      .bind(data.categoryId, uid, data.transactionId),
    ...(p.kind === "funding"
      ? [db().prepare("DELETE FROM loans WHERE user_id = ? AND id = ?").bind(uid, p.loan_id)]
      : []),
  ])
}
export async function deleteLoan(uid: string, id: string) {
  await loanDetails(uid, id)
  await write([db().prepare("DELETE FROM loans WHERE user_id = ? AND id = ?").bind(uid, id)])
}
