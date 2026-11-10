import { z } from "zod"
import { m } from "../paraglide/messages.js"
import { netWorth, type Rates } from "./core.ts"

const id = z.string().min(1).max(100)
const cents = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d, {
    error: () => m.loans_invalid_date(),
  })
export const loanInput = z.object({
  id: z.uuid(),
  direction: z.enum(["lent", "borrowed"]),
  person: z.string().trim().min(1).max(200),
  purpose: z.string().trim().max(200).default(""),
  note: z.string().trim().max(2000).default(""),
  dueDay: day.nullable().default(null),
  source: z.enum(["new", "existing", "opening"]),
  amount: cents,
  currency: z.string().regex(/^[a-z]{3,6}$/),
  day,
  accountId: id.optional(),
  transactionId: id.optional(),
})
export const loanRepaymentInput = z.object({
  id: z.uuid(),
  loanId: id,
  amount: cents.describe("Principal applied in the loan currency."),
  accountAmount: cents.optional().describe("Actual bank amount when the currencies differ."),
  accountId: id.optional(),
  transactionId: id.optional(),
  day,
  note: z.string().trim().max(2000).default(""),
})
export const loanEditInput = z.object({
  id,
  person: z.string().trim().min(1).max(200).optional(),
  purpose: z.string().trim().max(200).optional(),
  note: z.string().trim().max(2000).optional(),
  dueDay: day.nullable().optional(),
})
export const loanUnlinkInput = z.object({ transactionId: id, categoryId: id })
export const loanSchema = z.object({
  id,
  direction: z.enum(["lent", "borrowed"]),
  person: z.string(),
  purpose: z.string(),
  note: z.string(),
  currency: z.string(),
  principal: z.number().int(),
  repaid: z.number().int(),
  remaining: z.number().int(),
  day: z.string(),
  dueDay: z.string().nullable(),
  opening: z.boolean(),
})
export type Loan = z.infer<typeof loanSchema>
export const loanPaymentSchema = z.object({
  transactionId: id,
  kind: z.enum(["funding", "repayment"]),
  principal: z.number().int(),
  amount: z.number().int(),
  currency: z.string(),
  accountId: id,
  accountName: z.string(),
  day: z.string(),
  note: z.string(),
  reconciled: z.boolean(),
})
export type LoanPayment = z.infer<typeof loanPaymentSchema>
export function loanTotals(
  loans: Pick<Loan, "remaining" | "currency" | "direction">[],
  currency: string,
  rates: Rates
) {
  const total = netWorth([], currency, rates, loans)
  return { lent: total.receivables, borrowed: total.personalDebt }
}
export const loanStatus = (loan: Pick<Loan, "remaining" | "repaid">) =>
  loan.remaining === 0 ? "paid" : loan.repaid > 0 ? "partial" : "unpaid"
