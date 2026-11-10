import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import { readFileSync, readdirSync } from "node:fs"
import { INCOME_SQL, NEUTRAL_SQL, SPENDING_SQL, isNeutral, canRefund } from "./core.ts"
import { loanInput, loanRepaymentInput, loanEditInput, loanStatus, loanTotals } from "./loans.ts"

// Exercise the real migration and write guards: generic clients and stale reads must not corrupt a loan.
const sql = new DatabaseSync(":memory:")
sql.exec("PRAGMA foreign_keys = ON")
for (const file of readdirSync("migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort())
  sql.exec(readFileSync(`migrations/${file}`, "utf8"))
for (const uid of ["a", "b"]) {
  for (const [id, currency] of [
    ["eur", "eur"],
    ["usd", "usd"],
  ])
    sql.prepare("INSERT INTO wallets (user_id, id, name, currency) VALUES (?, ?, ?, ?)").run(uid, id, id, currency)
  for (const id of ["0", "dining", "salary", "loan_principal"])
    sql.prepare("INSERT INTO categories (user_id, id, name) VALUES (?, ?, ?)").run(uid, id, id)
}
const transaction = (id: string, amount: number, date = 1000, uid = "a", wallet = "eur") =>
  sql
    .prepare(
      "INSERT INTO transactions (user_id, id, wallet_id, category_id, name, amount, date, bank_ref, reconciled_id) VALUES (?, ?, ?, 'dining', 'Sam', ?, ?, 'bank-1', 'reconciliation-1')"
    )
    .run(uid, id, wallet, amount, date)
const agreement = (id: string, direction = "lent", uid = "a", opening = 0) =>
  sql
    .prepare(
      "INSERT INTO loans (user_id, id, direction, person, currency, principal, started_at, opening, request_hash) VALUES (?, ?, ?, 'Sam', 'eur', 100000, 1000, ?, 'receipt')"
    )
    .run(uid, id, direction, opening)
const payment = (tx: string, loan: string, principal: number, kind = "repayment", uid = "a") =>
  sql
    .prepare(
      "INSERT INTO loan_payments (user_id, transaction_id, loan_id, principal, kind, request_hash) VALUES (?, ?, ?, ?, ?, 'receipt')"
    )
    .run(uid, tx, loan, principal, kind)
const remaining = (uid = "a", loan = "loan") =>
  (
    sql
      .prepare(
        "SELECT principal - COALESCE((SELECT SUM(principal) FROM loan_payments WHERE user_id = l.user_id AND loan_id = l.id AND kind = 'repayment'), 0) AS n FROM loans l WHERE user_id = ? AND id = ?"
      )
      .get(uid, loan) as { n: number }
  ).n
const atomic = (work: () => void) => {
  sql.exec("BEGIN")
  try {
    work()
    sql.exec("COMMIT")
  } catch (error) {
    sql.exec("ROLLBACK")
    throw error
  }
}
transaction("opening", 200000)
agreement("loan")
transaction("funding", -100000)
payment("funding", "loan", 100000, "funding")
assert.deepEqual(
  {
    ...sql
      .prepare("SELECT category_id, bank_ref, reconciled_id FROM transactions WHERE user_id = 'a' AND id = 'funding'")
      .get(),
  },
  { category_id: "loan_principal", bank_ref: "bank-1", reconciled_id: "reconciliation-1" }
)
assert.throws(
  () =>
    sql
      .prepare(
        "INSERT INTO transactions (user_id, id, wallet_id, category_id, amount, date, refund_of) VALUES ('a', 'refund', 'eur', 'dining', 100, 2000, 'funding')"
      )
      .run(),
  /loan_invalid_payment/
)
assert.equal(remaining(), 100000)
transaction("partial", 40000, 2000)
payment("partial", "loan", 40000)
assert.equal(remaining(), 60000)
assert.equal(
  (sql.prepare("SELECT SUM(amount) AS n FROM transactions WHERE user_id = 'a'").get() as { n: number }).n + remaining(),
  200000,
  "principal repayment preserves net worth"
)

// Both callers may have read the old balance; the second write must still fail and roll back its bank row.
assert.throws(
  () =>
    atomic(() => {
      transaction("excess", 70000, 3000)
      payment("excess", "loan", 70000)
    }),
  /loan_overpaid/
)
assert.equal(sql.prepare("SELECT id FROM transactions WHERE id = 'excess'").get(), undefined)
transaction("full", 60000, 3000)
payment("full", "loan", 60000)
assert.equal(remaining(), 0)
assert.equal(loanStatus({ remaining: remaining(), repaid: 100000 }), "paid")
sql.prepare("DELETE FROM transactions WHERE user_id = 'a' AND id = 'full'").run()
assert.equal(remaining(), 60000, "deleting an actual repayment reopens its agreement")
assert.equal(sql.prepare("SELECT * FROM loan_payments WHERE transaction_id = 'full'").get(), undefined)

assert.throws(
  () => sql.prepare("UPDATE transactions SET amount = 20 WHERE user_id = 'a' AND id = 'partial'").run(),
  /loan_edit_payment/
)
assert.throws(
  () => sql.prepare("UPDATE transactions SET category_id = 'salary' WHERE user_id = 'a' AND id = 'partial'").run(),
  /loan_edit_payment/
)
assert.throws(
  () => sql.prepare("UPDATE transactions SET date = 999 WHERE user_id = 'a' AND id = 'partial'").run(),
  /loan_edit_payment/
)
sql
  .prepare(
    "UPDATE transactions SET note = 'Retain history', tags = '[\"friends\"]' WHERE user_id = 'a' AND id = 'partial'"
  )
  .run()
assert.throws(
  () => sql.prepare("DELETE FROM transactions WHERE user_id = 'a' AND id = 'funding'").run(),
  /loan_edit_payment/
)
assert.throws(
  () => sql.prepare("DELETE FROM loan_payments WHERE user_id = 'a' AND transaction_id = 'funding'").run(),
  /loan_unlink_repayments/
)
assert.throws(() => sql.prepare("DELETE FROM loans WHERE user_id = 'a' AND id = 'loan'").run(), /loan_edit_payment/)
assert.throws(
  () => sql.prepare("UPDATE loans SET principal = 1 WHERE user_id = 'a' AND id = 'loan'").run(),
  /loan_edit_payment/
)

// Same ids in another user's data never contribute to the balance or the payment association.
agreement("loan", "lent", "b")
transaction("funding", -100000, 1000, "b")
payment("funding", "loan", 100000, "funding", "b")
transaction("partial", 90000, 2000, "b")
payment("partial", "loan", 90000, "repayment", "b")
assert.equal(remaining("b"), 10000)
assert.equal(remaining(), 60000)
transaction("foreign-only", 1, 2000, "b")
assert.throws(() => payment("foreign-only", "loan", 1), /loan_invalid_payment/)
transaction("early", 1, 999)
assert.throws(() => payment("early", "loan", 1), /loan_invalid_payment/)
transaction("correction", 1, 3000)
sql.prepare("UPDATE transactions SET category_id = '0' WHERE user_id = 'a' AND id = 'correction'").run()
assert.throws(() => payment("correction", "loan", 1), /loan_invalid_payment/)
transaction("wrong-sign", -1, 3000)
assert.throws(() => payment("wrong-sign", "loan", 1), /loan_invalid_payment/)
transaction("wrong-amount", 100, 3000)
assert.throws(() => payment("wrong-amount", "loan", 99), /loan_invalid_payment/)
transaction("dollars", 11000, 3000, "a", "usd")
payment("dollars", "loan", 10000)
assert.equal(remaining(), 50000, "bank currency and loan principal are independent")

agreement("borrowed", "borrowed")
transaction("borrowed-funding", 100000)
payment("borrowed-funding", "borrowed", 100000, "funding")
transaction("borrowed-repayment", -15000, 2000)
payment("borrowed-repayment", "borrowed", 15000)
assert.equal(remaining("a", "borrowed"), 85000)
agreement("old", "lent", "a", 1)
assert.equal(
  sql.prepare("SELECT * FROM loan_payments WHERE loan_id = 'old'").all().length,
  0,
  "tracked opening balance creates no bank movement"
)

const totals = sql
  .prepare(
    `SELECT SUM(CASE WHEN ${INCOME_SQL()} AND t.category_id NOT IN ${NEUTRAL_SQL} THEN t.amount ELSE 0 END) AS income, SUM(CASE WHEN ${SPENDING_SQL()} AND t.category_id NOT IN ${NEUTRAL_SQL} THEN -t.amount ELSE 0 END) AS spending FROM transactions t WHERE t.user_id = 'a' AND t.category_id = 'loan_principal'`
  )
  .get()
assert.deepEqual({ ...totals }, { income: 0, spending: 0 })
assert.equal(isNeutral("loan_principal"), true)
assert.equal(
  canRefund({ amount: -100000, paid: 1, transfer_id: null, refund_of: null, category_id: "loan_principal" }),
  false
)
assert.deepEqual(
  loanTotals(
    [
      { remaining: 60000, currency: "eur", direction: "lent" },
      { remaining: 15000, currency: "usd", direction: "borrowed" },
    ],
    "eur",
    { eur: 1, usd: 1.5 }
  ),
  { lent: 60000, borrowed: 10000 }
)
const input = {
  id: "00000000-0000-4000-8000-000000000001",
  direction: "lent",
  source: "opening",
  person: "Sam",
  amount: 100,
  currency: "eur",
  day: "2026-01-01",
}
assert.equal(loanInput.safeParse(input).success, true)
assert.deepEqual(
  loanEditInput.parse({ id: "loan", person: "Sam" }),
  { id: "loan", person: "Sam" },
  "partial edits do not reset unspecified agreement terms"
)
for (const day of ["2026-02-30", "2026-13-01", "not a date"])
  assert.equal(loanInput.safeParse({ ...input, day }).success, false)
for (const amount of [0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1])
  assert.equal(loanRepaymentInput.safeParse({ id: input.id, loanId: "loan", day: input.day, amount }).success, false)

// Explicit unlink preserves the bank row; full reset must be possible without dangling obligations.
atomic(() => {
  sql.prepare("DELETE FROM loan_payments WHERE user_id = 'a' AND transaction_id = 'partial'").run()
  sql.prepare("UPDATE transactions SET category_id = 'salary' WHERE user_id = 'a' AND id = 'partial'").run()
})
assert.equal(remaining(), 90000)
assert.equal(
  (
    sql.prepare("SELECT bank_ref FROM transactions WHERE user_id = 'a' AND id = 'partial'").get() as {
      bank_ref: string
    }
  ).bank_ref,
  "bank-1"
)
atomic(() => {
  sql.exec(
    "DELETE FROM loan_payments WHERE user_id = 'a' AND kind = 'repayment'; DELETE FROM loan_payments WHERE user_id = 'a'; DELETE FROM loans WHERE user_id = 'a'; DELETE FROM transactions WHERE user_id = 'a'"
  )
})
assert.equal(sql.prepare("SELECT id FROM loans WHERE user_id = 'a'").all().length, 0)
assert.equal(remaining("b"), 10000, "reset leaves other tenants intact")
sql.close()
console.log("loan ledger and write guards ok")
