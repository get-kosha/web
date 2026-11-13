// The public API contract: every operation the REST API (/api/v1) and the MCP server (/mcp) offer.
// One entry drives both: its REST route, its MCP tool name, its schemas, descriptions and examples.
// Pure (zod only), so core.test.ts checks every example against its schemas. Handlers live in
// server/api.server.ts, keyed by the same names.

import {
  loanInput,
  loanRepaymentInput,
  loanEditInput,
  loanUnlinkInput,
  loanSchema,
  loanPaymentSchema,
} from "./loans.ts"
import { z } from "zod"
import { MAX_TAGS, PREFS } from "./core.ts"
import { m } from "../paraglide/messages.js"

export type Scope = "read" | "write"
type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
const TAGS = {
  Accounts: "Bank accounts, cash, credit cards and investments, with their balances.",
  Loans:
    "Personal lending and borrowing agreements with flexible principal repayments. No interest or instalment schedules yet.",
  Transactions: "Spending and income. Bulk create, update and delete, up to 500 at a time.",
  Tags: "Hashtags on transactions. A tag exists as soon as an entry uses it; there is nothing to create first.",
  Transfers: "Money moved between your own accounts, including currency exchanges. Never income or spending.",
  Events: "Trips, weddings and other occasions that group transactions across categories.",
  Categories: "Spending and income categories, one level of subcategories.",
  "Payee rules": "Payee → category rules that categorise new transactions.",
  Recurring: "Subscriptions, bills and recurring transfers, as schedules.",
  Gains: "Investment gains recorded by hand. The latest one per account counts toward net worth.",
  Reports: "Read-only summaries: a month's overview and net worth.",
  Settings: "Currency, time zone and display preferences.",
  Reconciliation:
    "Check an account against a bank statement: match its lines to entries, add what's missing, and mark entries reconciled.",
  AI: "Help from the AI model connected in Kosha under Settings › AI, using your provider's tokens; each call shows in its request log. Without a provider, or with the feature off, these answer ai_unavailable with what to turn on.",
} as const
type Tag = keyof typeof TAGS

export type Operation<I extends z.ZodObject = z.ZodObject, O extends z.ZodObject = z.ZodObject> = {
  title: string
  tag: Tag
  method: Method
  /** REST path under /api/v1. `{name}` segments are input fields. */
  path: string
  /** What it does, when to use it, what it returns. Shown as the MCP tool description and in the OpenAPI docs. */
  description: string
  /** Read operations work with read-only keys and connections; write operations need write access. */
  scope: Scope
  /** Deletes or overwrites data that can't be recovered. */
  destructive?: boolean
  /** Repeating the same call leaves the same result. */
  idempotent?: boolean
  /** Uses the AI model: always, or only for some inputs. It can then fail with ai_unavailable or ai_provider_error. */
  ai?: "always" | "sometimes"
  input: I
  output: O
  example: { input: z.input<I>; output: z.input<O> }
}
const op = <I extends z.ZodObject, O extends z.ZodObject>(o: Operation<I, O>) => o

// ---------- shared shapes ----------

const Id = z.string().min(1).max(100)
const Cents = z
  .number()
  .int()
  .describe("Minor units (cents). Negative is money out, positive is money in. €12.50 = 1250.")
// Messages a person can trigger are localized: Kosha's apps call /api/v1 in their own language.
const Amount = Cents.refine((n) => n !== 0, { error: () => m.server_amount_required() })
const Positive = z.number().int().positive()
const Day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("A day, YYYY-MM-DD, in your Kosha time zone.")
const Month = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .describe("A month, YYYY-MM, in your Kosha time zone.")
const Currency = z
  .string()
  .regex(/^[a-z]{3,6}$/)
  .describe("Lowercase currency code, e.g. eur, usd, gbp.")
const AccountType = z
  .enum(["bank", "cash", "credit", "investment"])
  .describe(
    "bank or cash: balance is the money held. credit: balance is the credit left to spend, so what you owe is creditLimit − balance. investment: balance is the money put in; recorded gains are added on top."
  )
const CategoryType = z.enum(["expense", "income"])
const Note = z.string().max(2000)
const Payee = z.string().max(200).describe("Who was paid or who paid you, e.g. “Tesco” or “Salary”.")
const Bulk = <T extends z.ZodType>(item: T, max: number) => z.array(item).min(1).max(max)
const Tags = z
  .array(z.string().max(32))
  .max(MAX_TAGS)
  .describe('Hashtags without the #, e.g. ["trip", "work"]. Stored lowercase.')

const Account = z.object({
  id: Id,
  name: z.string(),
  type: AccountType,
  currency: Currency,
  balance: Cents.describe("Current balance in the account's currency, paid transactions only."),
  worth: Cents.describe("What the account adds to net worth, in its own currency (see type)."),
  creditLimit: z.number().int().nullable().describe("Credit cards only, in cents."),
  gain: z.number().int().nullable().describe("Investments only: the latest recorded gain, in cents."),
  gainDay: Day.nullable(),
  archived: z.boolean(),
  transactionCount: z.number().int(),
  reconciledTo: Day.nullable().describe("The statement day of its latest reconciliation, if any."),
})
const Category = z.object({
  id: Id,
  name: z.string(),
  icon: z.string().nullable().describe("An emoji."),
  type: CategoryType,
  parentId: Id.nullable().describe("Set on subcategories."),
  archived: z.boolean(),
  transactionCount: z.number().int(),
  recurringCount: z.number().int(),
  ruleCount: z.number().int(),
})
const Transfer = z.object({
  id: Id.describe("The transfer id. Both halves share it."),
  day: Day,
  fromAccountId: Id,
  toAccountId: Id,
  sent: Positive.describe("Total that left the source account, fee included, in its currency."),
  received: Positive.describe("What arrived, in the destination account's currency."),
  fee: z.number().int().min(0).describe("Part of `sent` charged as a fee, in the source currency."),
  provider: z.string().describe("Wise, Revolut, your bank… Empty if not given."),
  fromCurrency: Currency,
  toCurrency: Currency,
  note: z.string(),
})
const Time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .describe("24-hour HH:MM in your Kosha time zone.")
const Transaction = z.object({
  id: Id,
  day: Day,
  time: Time.describe("When it happened, 24-hour HH:MM in your Kosha time zone."),
  payee: z.string(),
  amount: Cents,
  currency: Currency.describe("The account's currency."),
  accountId: Id,
  accountName: z.string(),
  categoryId: Id,
  categoryName: z.string(),
  subcategoryId: Id.nullable(),
  note: z.string(),
  tags: z.array(z.string()),
  eventId: Id.nullable(),
  status: z.enum(["paid", "upcoming"]).describe("Upcoming entries are left out of balances until paid."),
  recurringId: Id.nullable().describe("Set when the row is a payment of a recurring schedule."),
  dueDay: Day.nullable().describe("The scheduled day of that payment."),
  transfer: z
    .object({
      id: Id,
      counterAccountId: Id.nullable(),
      counterAmount: z.number().int().nullable(),
      fee: z.number().int(),
      provider: z.string().describe("Wise, Revolut, your bank… Empty if not given."),
      marketRate: z
        .number()
        .nullable()
        .describe("Mid-market rate that day between the two currencies, when they differ and it's known."),
    })
    .nullable()
    .describe("Set on both halves of a transfer."),
  loan: z
    .object({
      id: Id,
      kind: z.enum(["funding", "repayment"]),
      principal: Positive,
      person: z.string(),
      direction: z.enum(["lent", "borrowed"]),
    })
    .optional()
    .describe("Linked personal-loan principal. Neutral in income/spending reports."),
  reconciled: z
    .boolean()
    .describe("Checked against a bank statement. Changing its amount, account or day un-reconciles it."),
  bankRef: z.string().nullable().describe("The bank's id for the statement line it was imported from."),
  attachmentCount: z.number().int().describe("How many receipts or other files are attached."),
  refundOf: z
    .string()
    .nullable()
    .describe(
      "A refund: the spending entry it gave money back for. Totals count a refund as spending undone, never as income."
    ),
  refunds: z
    .array(
      z.object({
        id: Id.describe("The refund's own transaction id. Delete it with delete_transactions."),
        accountId: Id.describe("The account the money came back to, which may not be the one that paid."),
        amount: z.number().int().describe("What came back, positive, in that account's currency."),
        currency: z.string(),
        day: Day,
      })
    )
    .describe("A spending entry's refunds. Empty for anything else."),
  refunded: z
    .number()
    .int()
    .describe(
      "The refunds' total in this entry's currency (other currencies at today's rate). It is refunded in full when this reaches -amount."
    ),
})
const Payment = z.object({
  dueDay: Day.describe("The scheduled day; identifies the payment."),
  day: Day.describe("The day it is or was paid; differs from dueDay when moved."),
  amount: Cents,
  note: z.string(),
  status: z.enum(["paid", "skipped", "overdue", "due", "upcoming"]),
  edited: z.boolean().describe("Amount, day, note or account changed for this payment only."),
  transactionId: Id.nullable(),
  accountId: Id.describe("The account it's paid from: the schedule's, unless changed for this payment."),
})
const Unit = z.enum(["day", "week", "month", "year"])
const Recurring = z.object({
  id: Id,
  name: z.string(),
  accountId: Id,
  categoryId: Id,
  amount: Cents.describe("Each payment, in the account's currency. Bills are negative."),
  currency: Currency,
  note: z.string(),
  every: z.number().int(),
  unit: Unit,
  startDay: Day.describe("First payment of the current schedule."),
  endDay: Day.nullable(),
  autoPay: z.boolean().describe("Payments are recorded as paid on their day."),
  kind: z.enum(["subscription", "repetitive"]),
  toAccountId: Id.nullable().describe("Recurring transfers only."),
  toAmount: z.number().int().nullable().describe("Recurring transfers between currencies: what arrives each time."),
  variable: z.boolean().describe("The amount changes each time, so payments wait for you to enter it."),
  ended: z.boolean(),
  monthlyCost: Cents.describe("Amount normalised to one month (0 once ended)."),
  next: Payment.nullable(),
  payments: z.array(Payment).describe("Overdue payments plus the next six."),
})
const Gain = z.object({
  id: Id,
  accountId: Id,
  day: Day,
  gain: Cents.describe("Market value minus money invested, on that day."),
  invested: z.number().int().describe("Money invested on that day."),
  note: z.string(),
})
const Rule = z.object({
  payee: z.string(),
  categoryId: Id,
  match: z.enum(["exact", "contains"]),
  source: z.enum(["manual", "learned"]).describe("learned rules come from your edits and never replace manual ones."),
  matches: z.number().int().describe("Transactions this rule matches today."),
})
const Event = z.object({
  id: Id,
  name: z.string(),
  startDay: Day.nullable(),
  endDay: Day.nullable().describe("null while it's still going."),
  transactionCount: z.number().int(),
})
const Deleted = z.object({ deleted: z.boolean() })

// Preferences an API client may change. AI settings and security bookkeeping stay in the app.
export const API_PREFS = Object.keys(PREFS).filter(
  (k) => !k.startsWith("ai_") && k !== "backup_codes_saved_at"
) as Exclude<keyof typeof PREFS, `ai_${string}` | "backup_codes_saved_at">[]
const Preferences = z.object(
  Object.fromEntries(API_PREFS.map((k) => [k, PREFS[k].schema])) as {
    [K in (typeof API_PREFS)[number]]: (typeof PREFS)[K]["schema"]
  }
)
const Settings = z.object({
  user: z.object({ name: z.string(), email: z.string() }),
  primaryCurrency: Currency.describe("Reports and net worth are converted to this currency."),
  timeZone: z.string().describe("IANA zone, e.g. Europe/Paris. Days and months follow it."),
  currencyOrder: z.array(Currency),
  preferences: Preferences,
  exchangeRates: z.object({
    updatedAt: z.number().int().describe("Unix seconds of the last refresh."),
    perUsd: z.record(z.string(), z.number()).describe("Units of each currency you use per 1 USD."),
  }),
})

const tx = {
  id: "9b2f1c6e-5d3a-4f1b-8c7e-2a6d0e4f1b3c",
  day: "2026-11-04",
  time: "18:42",
  payee: "Tesco",
  amount: -2350,
  currency: "eur",
  accountId: "a1",
  accountName: "Current account",
  categoryId: "groceries",
  categoryName: "Groceries",
  subcategoryId: null,
  note: "",
  tags: [],
  eventId: null,
  status: "paid" as const,
  recurringId: null,
  dueDay: null,
  transfer: null,
  reconciled: false,
  bankRef: null,
  attachmentCount: 0,
  refundOf: null,
  refunds: [],
  refunded: 0,
}
const account = {
  id: "a1",
  name: "Current account",
  type: "bank" as const,
  currency: "eur",
  balance: 254300,
  worth: 254300,
  creditLimit: null,
  gain: null,
  gainDay: null,
  archived: false,
  transactionCount: 412,
  reconciledTo: "2026-10-31",
}
const category = {
  id: "groceries",
  name: "Groceries",
  icon: "🛒",
  type: "expense" as const,
  parentId: null,
  archived: false,
  transactionCount: 128,
  recurringCount: 0,
  ruleCount: 6,
}
const payment = {
  dueDay: "2026-11-15",
  day: "2026-11-15",
  amount: -1299,
  note: "",
  status: "upcoming" as const,
  edited: false,
  transactionId: null,
  accountId: "a1",
}
const recurring = {
  id: "s1",
  name: "Netflix",
  accountId: "a1",
  categoryId: "entertainment",
  amount: -1299,
  currency: "eur",
  note: "",
  every: 1,
  unit: "month" as const,
  startDay: "2025-01-15",
  endDay: null,
  autoPay: true,
  kind: "subscription" as const,
  toAccountId: null,
  toAmount: null,
  variable: false,
  ended: false,
  monthlyCost: -1299,
  next: payment,
  payments: [payment],
}
const transfer = {
  id: "t1",
  day: "2026-11-02",
  fromAccountId: "a1",
  toAccountId: "a3",
  sent: 100000,
  received: 107546,
  fee: 420,
  provider: "Wise",
  fromCurrency: "eur",
  toCurrency: "usd",
  note: "",
}

// ---------- operations ----------

export const OPERATIONS = {
  // Accounts
  list_accounts: op({
    title: "List accounts",
    tag: "Accounts",
    method: "GET",
    path: "/accounts",
    scope: "read",
    description:
      "Lists your accounts with their balances. Use the ids when you add transactions or transfers. Balances are in each account's own currency.",
    input: z.object({ includeArchived: z.boolean().default(false).describe("Also list archived accounts.") }),
    output: z.object({ accounts: z.array(Account) }),
    example: { input: {}, output: { accounts: [account] } },
  }),
  create_account: op({
    title: "Create account",
    tag: "Accounts",
    method: "POST",
    path: "/accounts",
    scope: "write",
    description:
      "Creates an account. `balance` sets its opening balance (for a credit card, the credit left to spend; for an investment, the amount put in), booked as a balance correction.",
    input: z.object({
      name: z.string().trim().min(1).max(100),
      type: AccountType,
      currency: Currency,
      creditLimit: z.number().int().min(0).optional().describe("Credit cards only, in cents."),
      balance: z.number().int().optional().describe("Opening balance in cents."),
    }),
    output: Account,
    example: {
      input: { name: "Current account", type: "bank", currency: "eur", balance: 254300 },
      output: { ...account, transactionCount: 1 },
    },
  }),
  update_account: op({
    title: "Update account",
    tag: "Accounts",
    method: "PATCH",
    path: "/accounts/{id}",
    scope: "write",
    idempotent: true,
    description:
      "Changes an account. Only the fields you pass change. `balance` sets what the balance should be now; the difference is booked as a balance correction. The currency can't change once the account has transactions. Archive an account instead of deleting it to keep its history.",
    input: z.object({
      id: Id,
      name: z.string().trim().min(1).max(100).optional(),
      type: AccountType.optional(),
      currency: Currency.optional(),
      creditLimit: z.number().int().min(0).nullable().optional(),
      archived: z.boolean().optional(),
      balance: z.number().int().optional().describe("What the balance should be now, in cents."),
    }),
    output: Account,
    example: { input: { id: "a1", balance: 250000 }, output: { ...account, balance: 250000, worth: 250000 } },
  }),
  delete_account: op({
    title: "Delete account",
    tag: "Accounts",
    method: "DELETE",
    path: "/accounts/{id}",
    scope: "write",
    destructive: true,
    idempotent: true,
    description:
      "Deletes an account that has no transactions and no recurring payments. An account in use is archived instead (update_account with archived: true).",
    input: z.object({ id: Id }),
    output: Deleted,
    example: { input: { id: "a9" }, output: { deleted: true } },
  }),

  // Transactions
  search_transactions: op({
    title: "Search transactions",
    tag: "Transactions",
    method: "GET",
    path: "/transactions",
    scope: "read",
    description:
      "Finds transactions, newest first. Without a month or day range it covers every date when you pass a query, tag or event, and the current month otherwise. `query` matches the payee, note, tags, event name and category name, or an exact amount (“12.50”). A transfer appears once, as its outgoing half, unless you filter by account. Totals sum the matching paid rows per currency. Page with `offset` and `nextOffset`.",
    input: z.object({
      query: z
        .string()
        .trim()
        .max(40)
        .optional()
        .describe("Text in the payee, note, a tag, the event name or the category name, or an amount such as 12.50."),
      accountId: Id.optional(),
      categoryId: Id.optional().describe("Matches the category and its subcategories."),
      tag: z.string().max(32).optional().describe("A tag without the #."),
      eventId: Id.optional().describe("An event's transactions, whatever their dates."),
      month: Month.optional(),
      from: Day.optional().describe("First day of a range. Overrides month."),
      to: Day.optional().describe("Last day of a range, included."),
      type: z.enum(["expense", "income", "transfer", "loan"]).optional(),
      minAmount: z.number().int().min(0).optional().describe("Smallest amount in cents, by absolute value."),
      maxAmount: z.number().int().min(0).optional().describe("Largest amount in cents, by absolute value."),
      includeCorrections: z.boolean().default(false).describe("Include balance corrections."),
      reconciled: z
        .boolean()
        .optional()
        .describe("true: only entries checked against a statement. false: only those not yet."),
      limit: z.number().int().min(1).max(500).default(50),
      offset: z.number().int().min(0).default(0),
    }),
    output: z.object({
      transactions: z.array(Transaction),
      total: z.number().int().describe("Matching rows across all pages."),
      nextOffset: z.number().int().nullable().describe("Pass as offset for the next page; null on the last page."),
      totals: z.array(
        z.object({
          currency: Currency,
          spent: z.number().int().describe("Sum of spending (negative)."),
          received: z.number().int().describe("Sum of income."),
          transferred: z.number().int().describe("Sum moved out by transfers."),
        })
      ),
      byCategory: z
        .array(
          z.object({
            categoryId: Id,
            categoryName: z.string(),
            currency: Currency,
            amount: Cents.describe("Paid spending and income in this category, net (refunds lower it)."),
            count: z.number().int(),
          })
        )
        .optional()
        .describe(
          "Only with a tag or eventId: what it cost per category and currency, most spent first. Transfers and corrections are left out."
        ),
    }),
    example: {
      input: { query: "tesco", from: "2026-01-01", to: "2026-11-06", limit: 20 },
      output: {
        transactions: [tx],
        total: 1,
        nextOffset: null,
        totals: [{ currency: "eur", spent: -2350, received: 0, transferred: 0 }],
      },
    },
  }),
  create_transactions: op({
    title: "Create transactions",
    tag: "Transactions",
    method: "POST",
    path: "/transactions",
    scope: "write",
    description:
      "Adds 1 to 500 spending or income entries in one all-or-nothing batch. Spending is a negative amount. Pass your own id to make a retry safe. Leave out categoryId to use your payee rules, then the AI model when Auto-categorise is on in Settings › AI; the call fails if neither places one. `day` defaults to today. To add lines from a bank statement, pass each line's bankRef from check_statement. Record money moved between your own accounts with create_transfers instead.",
    input: z.object({
      transactions: Bulk(
        z.object({
          id: z
            .uuid()
            .optional()
            .describe(
              "A UUID you choose for the new entry, so sending the same request again (say, after a lost reply) saves it once and returns it. The same id with different details fails with conflict (409). Left out: Kosha picks one."
            ),
          accountId: Id,
          payee: Payee,
          amount: Amount,
          categoryId: Id.optional().describe("Left out: your payee rules, then AI when Auto-categorise is on."),
          subcategoryId: Id.optional().describe("A subcategory of categoryId."),
          day: Day.optional(),
          time: Time.optional().describe("Left out: now for today, else noon."),
          note: Note.default(""),
          tags: Tags.default([]),
          eventId: Id.nullable()
            .optional()
            .describe("Left out: the event whose dates cover the day, if any. null: none."),
          status: z.enum(["paid", "upcoming"]).default("paid"),
          refundOf: Id.optional().describe(
            "Makes this entry a refund: money coming back, in full or in part, for that paid spending entry, into any account. The amount is positive, in this account's currency, and the category is the entry's. Totals count it as spending undone, never as income. Send one per part of a partial refund; the entry's refunds and refunded show what is back. Delete a refund with delete_transactions; deleting the entry deletes its refunds."
          ),
          bankRef: z
            .string()
            .min(1)
            .max(200)
            .optional()
            .describe(
              "A statement line's bankRef from check_statement, so checking that statement again matches this entry."
            ),
        }),
        500
      ),
    }),
    output: z.object({ transactions: z.array(Transaction) }),
    example: {
      input: {
        transactions: [{ accountId: "a1", payee: "Tesco", amount: -2350, categoryId: "groceries", day: "2026-11-04" }],
      },
      output: { transactions: [tx] },
    },
  }),
  update_transactions: op({
    title: "Update transactions",
    tag: "Transactions",
    method: "PATCH",
    path: "/transactions",
    scope: "write",
    idempotent: true,
    description:
      "Changes 1 to 500 transactions in one all-or-nothing batch. Only the fields you pass change, so recategorising is { id, categoryId }. Changing the category clears the subcategory unless you pass one. Transfer halves are changed with update_transfer.",
    input: z.object({
      transactions: Bulk(
        z.object({
          id: Id,
          accountId: Id.optional(),
          payee: Payee.optional(),
          amount: Amount.optional(),
          categoryId: Id.optional(),
          subcategoryId: Id.nullable().optional().describe("null clears it."),
          day: Day.optional(),
          time: Time.optional().describe("Left out: an entry that keeps its day keeps its time."),
          note: Note.optional(),
          tags: Tags.optional().describe("Replaces the tags."),
          eventId: Id.nullable().optional().describe("null removes it from its event."),
          status: z.enum(["paid", "upcoming"]).optional(),
        }),
        500
      ),
    }),
    output: z.object({ transactions: z.array(Transaction) }),
    example: {
      input: { transactions: [{ id: tx.id, categoryId: "dining" }] },
      output: { transactions: [{ ...tx, categoryId: "dining", categoryName: "Dining" }] },
    },
  }),
  delete_transactions: op({
    title: "Delete transactions",
    tag: "Transactions",
    method: "POST",
    path: "/transactions/delete",
    scope: "write",
    destructive: true,
    idempotent: true,
    description:
      "Deletes 1 to 500 transactions. Deleting either half of a transfer deletes both halves and its fee. Deleting a recurring payment marks it skipped, so it isn't recorded again. Ids that don't exist are listed in notFound.",
    input: z.object({ ids: Bulk(Id, 500) }),
    output: z.object({ deleted: z.array(Id), notFound: z.array(Id) }),
    example: { input: { ids: [tx.id, "missing-id"] }, output: { deleted: [tx.id], notFound: ["missing-id"] } },
  }),

  // Tags
  list_tags: op({
    title: "List tags",
    tag: "Tags",
    method: "GET",
    path: "/tags",
    scope: "read",
    description:
      "Lists the tags in use, most used first, with how many transactions carry each and when it was last used. Reuse these spellings when you tag entries, so one idea keeps one tag. Tags are created simply by using them in create_transactions or update_transactions.",
    input: z.object({
      prefix: z.string().max(32).default("").describe("Only tags starting with this, e.g. “tr” for trip and travel."),
      limit: z.number().int().min(1).max(500).default(100),
    }),
    output: z.object({
      tags: z.array(
        z.object({
          tag: z.string().describe("Without the #."),
          count: z.number().int().describe("Transactions with this tag."),
          lastDay: Day.describe("Day of the latest transaction with it."),
        })
      ),
    }),
    example: {
      input: { prefix: "tr" },
      output: {
        tags: [
          { tag: "trip", count: 23, lastDay: "2026-10-17" },
          { tag: "travel", count: 4, lastDay: "2026-06-02" },
        ],
      },
    },
  }),

  // Transfers
  create_transfers: op({
    title: "Create transfers",
    tag: "Transfers",
    method: "POST",
    path: "/transfers",
    scope: "write",
    description:
      "Records 1 to 50 movements of money between your own accounts, in one all-or-nothing batch. Kosha only records them; no money moves. Each is two linked rows, never income or spending. Between currencies, give `received` in the destination currency (otherwise today's rate is used) and any `fee` the provider charged.",
    input: z.object({
      transfers: Bulk(
        z
          .object({
            fromAccountId: Id,
            toAccountId: Id,
            sent: Positive.describe("Total that left the source account, fee included, in cents."),
            received: Positive.optional().describe(
              "What arrived, in the destination currency. Left out: same as sent minus fee, converted."
            ),
            fee: z.number().int().min(0).default(0).describe("Part of `sent` charged as a fee."),
            provider: z.string().trim().max(60).default(""),
            day: Day.optional(),
            time: Time.optional().describe("Left out: now for today, else noon."),
            note: Note.default(""),
          })
          .refine((t) => t.fromAccountId !== t.toAccountId, { error: () => m.server_pick_two_accounts() })
          .refine((t) => t.fee < t.sent, { error: () => m.server_fee_too_high() }),
        50
      ),
    }),
    output: z.object({ transfers: z.array(Transfer) }),
    example: {
      input: {
        transfers: [
          {
            fromAccountId: "a1",
            toAccountId: "a3",
            sent: 100000,
            received: 9150000,
            fee: 420,
            provider: "Wise",
            day: "2026-11-02",
          },
        ],
      },
      output: { transfers: [transfer] },
    },
  }),
  update_transfer: op({
    title: "Update transfer",
    tag: "Transfers",
    method: "PATCH",
    path: "/transfers/{id}",
    scope: "write",
    idempotent: true,
    description:
      "Changes a transfer and keeps both halves in step. `id` is the transfer id (transaction.transfer.id). Only the fields you pass change. Delete a transfer with delete_transactions and either half's id.",
    input: z.object({
      id: Id,
      fromAccountId: Id.optional(),
      toAccountId: Id.optional(),
      sent: Positive.optional(),
      received: Positive.optional(),
      fee: z.number().int().min(0).optional(),
      provider: z.string().trim().max(60).optional(),
      day: Day.optional(),
      note: Note.optional(),
    }),
    output: Transfer,
    example: { input: { id: "t1", fee: 380 }, output: { ...transfer, fee: 380 } },
  }),
  list_currency_exchanges: op({
    title: "List currency exchanges",
    tag: "Transfers",
    method: "GET",
    path: "/exchanges",
    scope: "read",
    description:
      "Lists transfers between accounts in different currencies, newest first, with the rate you got, the market rate that day and the fee. Use it to compare what providers cost.",
    input: z.object({ limit: z.number().int().min(1).max(500).default(50) }),
    output: z.object({
      exchanges: z.array(
        Transfer.extend({
          rate: z.number().describe("Units received per unit converted (sent minus fee)."),
          marketRate: z.number().nullable().describe("Mid-market rate that day, when known."),
        })
      ),
    }),
    example: { input: { limit: 10 }, output: { exchanges: [{ ...transfer, rate: 91.89, marketRate: 92.4 }] } },
  }),

  // Events
  list_events: op({
    title: "List events",
    tag: "Events",
    method: "GET",
    path: "/events",
    scope: "read",
    description:
      "Lists events (a trip, a wedding), newest first, with how many transactions each holds. Find what one cost with search_transactions and its eventId.",
    input: z.object({}),
    output: z.object({ events: z.array(Event) }),
    example: {
      input: {},
      output: {
        events: [{ id: "e1", name: "Rome trip", startDay: "2026-10-10", endDay: "2026-10-17", transactionCount: 23 }],
      },
    },
  }),
  create_event: op({
    title: "Create event",
    tag: "Events",
    method: "POST",
    path: "/events",
    scope: "write",
    description:
      "Creates an event. New one-off transactions dated between startDay and endDay join it unless they name another; both dates are optional, and no endDay means it's still going. Existing transactions join with update_transactions.",
    input: z
      .object({
        name: z.string().trim().min(1).max(80),
        startDay: Day.nullable().default(null),
        endDay: Day.nullable().default(null),
      })
      .refine((e) => !e.startDay || !e.endDay || e.endDay >= e.startDay, {
        error: () => m.server_event_end_before_start(),
      }),
    output: Event,
    example: {
      input: { name: "Rome trip", startDay: "2026-10-10", endDay: "2026-10-17" },
      output: { id: "e1", name: "Rome trip", startDay: "2026-10-10", endDay: "2026-10-17", transactionCount: 0 },
    },
  }),
  update_event: op({
    title: "Update event",
    tag: "Events",
    method: "PATCH",
    path: "/events/{id}",
    scope: "write",
    idempotent: true,
    description:
      "Renames an event or changes its dates. Only the fields you pass change. Transactions already in it stay in it.",
    input: z.object({
      id: Id,
      name: z.string().trim().min(1).max(80).optional(),
      startDay: Day.nullable().optional(),
      endDay: Day.nullable().optional(),
    }),
    output: Event,
    example: {
      input: { id: "e1", endDay: "2026-10-18" },
      output: { id: "e1", name: "Rome trip", startDay: "2026-10-10", endDay: "2026-10-18", transactionCount: 23 },
    },
  }),
  delete_event: op({
    title: "Delete event",
    tag: "Events",
    method: "DELETE",
    path: "/events/{id}",
    scope: "write",
    destructive: true,
    idempotent: true,
    description: "Deletes an event. Its transactions stay; they no longer belong to it.",
    input: z.object({ id: Id }),
    output: Deleted,
    example: { input: { id: "e1" }, output: { deleted: true } },
  }),

  // Categories
  list_categories: op({
    title: "List categories",
    tag: "Categories",
    method: "GET",
    path: "/categories",
    scope: "read",
    description:
      "Lists spending and income categories with how often each is used. Subcategories carry a parentId. Transfers and balance corrections have their own system categories and aren't listed.",
    input: z.object({ includeArchived: z.boolean().default(false) }),
    output: z.object({
      categories: z.array(Category),
      correctionCount: z.number().int().describe("Balance corrections, which use the unlisted system category 0."),
    }),
    example: { input: {}, output: { categories: [category], correctionCount: 3 } },
  }),
  create_category: op({
    title: "Create category",
    tag: "Categories",
    method: "POST",
    path: "/categories",
    scope: "write",
    description:
      "Creates a category, or a subcategory when parentId is set. A subcategory has the type of its parent, and can't have its own subcategories.",
    input: z.object({
      name: z.string().trim().min(1).max(60),
      icon: z.string().max(40).optional().describe("An emoji."),
      type: CategoryType.optional().describe("Defaults to the parent's type, or expense."),
      parentId: Id.optional(),
    }),
    output: Category,
    example: {
      input: { name: "Coffee", icon: "☕", type: "expense", parentId: "dining" },
      output: {
        ...category,
        id: "c7",
        name: "Coffee",
        icon: "☕",
        parentId: "dining",
        transactionCount: 0,
        ruleCount: 0,
      },
    },
  }),
  update_category: op({
    title: "Update category",
    tag: "Categories",
    method: "PATCH",
    path: "/categories/{id}",
    scope: "write",
    idempotent: true,
    description:
      "Renames, re-icons, retypes, moves or archives a category. Only the fields you pass change. Moving a category under a parent moves its transactions with it. Archiving a parent archives its subcategories; archived categories keep their history but leave pickers.",
    input: z.object({
      id: Id,
      name: z.string().trim().min(1).max(60).optional(),
      icon: z.string().max(40).nullable().optional(),
      type: CategoryType.optional(),
      parentId: Id.nullable().optional().describe("null makes it top-level."),
      archived: z.boolean().optional(),
    }),
    output: Category,
    example: { input: { id: "groceries", name: "Food shopping" }, output: { ...category, name: "Food shopping" } },
  }),
  merge_category: op({
    title: "Merge category",
    tag: "Categories",
    method: "POST",
    path: "/categories/{id}/merge",
    scope: "write",
    destructive: true,
    description:
      "Moves every transaction, recurring payment, payee rule and subcategory of one category into another of the same type, then deletes the first. It can't be undone.",
    input: z.object({
      id: Id.describe("The category to remove."),
      intoId: Id.describe("The category that takes its place."),
    }),
    output: z.object({ merged: z.boolean() }),
    example: { input: { id: "c7", intoId: "dining" }, output: { merged: true } },
  }),
  delete_category: op({
    title: "Delete category",
    tag: "Categories",
    method: "DELETE",
    path: "/categories/{id}",
    scope: "write",
    destructive: true,
    idempotent: true,
    description: "Deletes a category nothing uses. A category in use is merged (merge_category) or archived instead.",
    input: z.object({ id: Id }),
    output: Deleted,
    example: { input: { id: "c7" }, output: { deleted: true } },
  }),

  // Payee rules
  list_payee_rules: op({
    title: "List payee rules",
    tag: "Payee rules",
    method: "GET",
    path: "/payee-rules",
    scope: "read",
    description:
      "Lists payee rules, most used first. A rule sets the category of new transactions whose payee is (exact) or contains its text; the longest match wins.",
    input: z.object({
      query: z.string().max(100).default("").describe("Text in the payee."),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }),
    output: z.object({ rules: z.array(Rule), total: z.number().int(), nextOffset: z.number().int().nullable() }),
    example: {
      input: { query: "tes" },
      output: {
        rules: [{ payee: "tesco", categoryId: "groceries", match: "contains", source: "manual", matches: 52 }],
        total: 1,
        nextOffset: null,
      },
    },
  }),
  save_payee_rules: op({
    title: "Save payee rules",
    tag: "Payee rules",
    method: "PUT",
    path: "/payee-rules",
    scope: "write",
    idempotent: true,
    description:
      "Creates or replaces 1 to 500 payee rules in one batch. A rule for the same payee text (case-insensitive) is replaced. To rename a rule's text, pass the old text as previousPayee.",
    input: z.object({
      rules: Bulk(
        z.object({
          payee: z.string().trim().min(1).max(100),
          categoryId: Id,
          match: z.enum(["exact", "contains"]).default("contains"),
          previousPayee: z.string().max(100).optional(),
        }),
        500
      ),
    }),
    output: z.object({ saved: z.number().int() }),
    example: { input: { rules: [{ payee: "tesco", categoryId: "groceries" }] }, output: { saved: 1 } },
  }),
  delete_payee_rules: op({
    title: "Delete payee rules",
    tag: "Payee rules",
    method: "POST",
    path: "/payee-rules/delete",
    scope: "write",
    destructive: true,
    idempotent: true,
    description: "Deletes payee rules by their payee text (case-insensitive). Transactions keep their categories.",
    input: z.object({ payees: Bulk(z.string().max(100), 500) }),
    output: z.object({ deleted: z.number().int() }),
    example: { input: { payees: ["tesco"] }, output: { deleted: 1 } },
  }),
  search_payees: op({
    title: "Search payees",
    tag: "Payee rules",
    method: "GET",
    path: "/payees",
    scope: "read",
    description:
      "Finds payees you have used before, most used first, with the category and account they last used, the amount they usually come to (the amount entered most often) and their average. Use it to fill in a new transaction the way you usually do.",
    input: z.object({
      query: z.string().trim().max(40).default(""),
      limit: z.number().int().min(1).max(20).default(5),
    }),
    output: z.object({
      payees: z.array(
        z.object({
          payee: z.string(),
          count: z.number().int(),
          categoryId: Id,
          accountId: Id,
          currency: Currency,
          usualAmount: Cents.describe(
            'The amount entered most often, the newest on a tie. Kosha shows it as "usually".'
          ),
          averageAmount: Cents.describe(
            "The average of every payment. Kept for older clients; show usualAmount instead."
          ),
        })
      ),
    }),
    example: {
      input: { query: "tes" },
      output: {
        payees: [
          {
            payee: "Tesco",
            count: 52,
            categoryId: "groceries",
            accountId: "a1",
            currency: "eur",
            usualAmount: -2850,
            averageAmount: -3120,
          },
        ],
      },
    },
  }),

  // Recurring
  list_recurring: op({
    title: "List recurring payments",
    tag: "Recurring",
    method: "GET",
    path: "/recurring",
    scope: "read",
    description:
      "Lists subscriptions, bills and recurring transfers with their next payments. Due payments with auto-pay are recorded when Kosha loads; others wait as due or overdue. With includeSuggestions, it also lists payees you pay on a steady rhythm that aren't set up yet; pass one's fields to create_recurring, with its transactionIds as linkTransactionIds.",
    input: z.object({
      includeEnded: z.boolean().default(false),
      includeSuggestions: z.boolean().default(false).describe("Also spot regular payments not set up as recurring."),
    }),
    output: z.object({
      recurring: z.array(Recurring),
      suggestions: z
        .array(
          z.object({
            payee: z.string(),
            amount: Cents.describe("The latest amount, or the typical one when it varies."),
            variable: z.boolean().describe("The amount varies, like an energy bill."),
            every: z.number().int(),
            unit: Unit,
            nextDay: Day.describe("When the next payment is expected."),
            lastDay: Day,
            count: z.number().int().describe("Payments seen."),
            categoryId: Id,
            accountId: Id,
            transactionIds: z.array(Id).describe("The past payments, oldest first."),
          })
        )
        .optional(),
    }),
    example: {
      input: { includeSuggestions: true },
      output: {
        recurring: [recurring],
        suggestions: [
          {
            payee: "Spotify",
            amount: -1099,
            variable: false,
            every: 1,
            unit: "month",
            nextDay: "2026-11-20",
            lastDay: "2026-10-20",
            count: 9,
            categoryId: "entertainment",
            accountId: "a1",
            transactionIds: ["x41", "x52"],
          },
        ],
      },
    },
  }),
  create_recurring: op({
    title: "Create recurring payment",
    tag: "Recurring",
    method: "POST",
    path: "/recurring",
    scope: "write",
    description:
      "Creates a schedule: a subscription or bill (negative amount), recurring income (positive), or a recurring transfer (set toAccountId). Payments repeat every `every` `unit`s from startDay.",
    input: z.object({
      name: z.string().trim().min(1).max(200),
      accountId: Id,
      amount: Amount,
      categoryId: Id.optional().describe("Required unless toAccountId is set."),
      every: z.number().int().min(1).max(365).default(1),
      unit: Unit.default("month"),
      startDay: Day.describe("Day of the first payment."),
      endDay: Day.nullable().default(null),
      autoPay: z.boolean().optional().describe("Record payments on their day. Defaults to your Recurring setting."),
      kind: z.enum(["subscription", "repetitive"]).default("subscription"),
      note: Note.default(""),
      toAccountId: Id.optional().describe("Makes it a recurring transfer to this account."),
      toAmount: Positive.optional().describe("Transfers between currencies: what arrives each time."),
      variable: z
        .boolean()
        .default(false)
        .describe(
          "The amount changes each time, like an energy bill: payments wait for you to enter it instead of being recorded on their day, and amount is the usual one."
        ),
      linkTransactionIds: z
        .array(Id)
        .max(500)
        .optional()
        .describe("Past payments to file under it, e.g. a suggestion's transactionIds. They show in its history."),
    }),
    output: Recurring,
    example: {
      input: { name: "Netflix", accountId: "a1", amount: -1299, categoryId: "entertainment", startDay: "2025-01-15" },
      output: recurring,
    },
  }),
  update_recurring: op({
    title: "Update recurring payment",
    tag: "Recurring",
    method: "PATCH",
    path: "/recurring/{id}",
    scope: "write",
    idempotent: true,
    description:
      "Changes a schedule. Only the fields you pass change, and only future payments are affected. Changing every, unit or startDay starts a new schedule and drops edits and skips made to unpaid payments. Set endDay to end it.",
    input: z.object({
      id: Id,
      name: z.string().trim().min(1).max(200).optional(),
      accountId: Id.optional(),
      amount: Amount.optional(),
      categoryId: Id.optional(),
      every: z.number().int().min(1).max(365).optional(),
      unit: Unit.optional(),
      startDay: Day.optional(),
      endDay: Day.nullable().optional(),
      autoPay: z.boolean().optional(),
      kind: z.enum(["subscription", "repetitive"]).optional(),
      note: Note.optional(),
      toAccountId: Id.nullable().optional(),
      toAmount: Positive.nullable().optional(),
      variable: z.boolean().optional(),
    }),
    output: Recurring,
    example: { input: { id: "s1", amount: -1499 }, output: { ...recurring, amount: -1499, monthlyCost: -1499 } },
  }),
  delete_recurring: op({
    title: "Delete recurring payment",
    tag: "Recurring",
    method: "DELETE",
    path: "/recurring/{id}",
    scope: "write",
    destructive: true,
    idempotent: true,
    description: "Deletes a schedule and its unpaid payments. Payments already made stay as ordinary transactions.",
    input: z.object({ id: Id }),
    output: Deleted,
    example: { input: { id: "s1" }, output: { deleted: true } },
  }),
  update_recurring_payment: op({
    title: "Update one recurring payment",
    tag: "Recurring",
    method: "PATCH",
    path: "/recurring/{id}/payments/{dueDay}",
    scope: "write",
    idempotent: true,
    description:
      "Changes one payment of a schedule, named by its dueDay, without touching the others. status paid records it now (with any amount, day or note you pass); skipped skips it; scheduled keeps it unpaid with your changes, or with none restores the schedule's defaults. A payment already paid is changed with update_transactions.",
    input: z.object({
      id: Id.describe("The recurring schedule's id."),
      dueDay: Day,
      status: z.enum(["paid", "skipped", "scheduled"]),
      amount: Amount.optional(),
      received: Positive.optional().describe("Transfers between currencies: what arrived."),
      day: Day.optional().describe("Moves the payment to another day."),
      note: Note.optional(),
      accountId: Id.optional().describe(
        "Pays this one from another account (for a transfer, the account it leaves). Give amount in that account's currency when it differs."
      ),
    }),
    output: z.object({
      payment: Payment.nullable().describe("The payment after the change; null once it is paid and in the past."),
    }),
    example: {
      input: { id: "s1", dueDay: "2026-11-15", status: "paid", amount: -1399 },
      output: { payment: { ...payment, amount: -1399, status: "paid", transactionId: "x1" } },
    },
  }),

  // Gains
  list_gains: op({
    title: "List investment gains",
    tag: "Gains",
    method: "GET",
    path: "/gains",
    scope: "read",
    description: "Lists recorded investment gains, newest first. The latest one per account counts toward net worth.",
    input: z.object({ accountId: Id.optional() }),
    output: z.object({ gains: z.array(Gain) }),
    example: {
      input: { accountId: "a4" },
      output: { gains: [{ id: "g1", accountId: "a4", day: "2026-10-31", gain: 182000, invested: 1200000, note: "" }] },
    },
  }),
  record_gains: op({
    title: "Record investment gains",
    tag: "Gains",
    method: "POST",
    path: "/gains",
    scope: "write",
    idempotent: true,
    description:
      "Records 1 to 500 investment gains, one per account and day; a second one for the same day replaces it. Pass either the gain itself or the portfolio's market value, and Kosha subtracts what you put in.",
    input: z.object({
      gains: Bulk(
        z
          .object({
            accountId: Id,
            day: Day,
            gain: z.number().int().optional().describe("Market value minus money invested, in cents."),
            value: z.number().int().optional().describe("Market value in cents, instead of gain."),
            note: z.string().max(500).default(""),
          })
          .refine((g) => (g.gain === undefined) !== (g.value === undefined), "Pass gain or value, not both"),
        500
      ),
    }),
    output: z.object({ recorded: z.number().int() }),
    example: { input: { gains: [{ accountId: "a4", day: "2026-10-31", value: 1382000 }] }, output: { recorded: 1 } },
  }),
  delete_gain: op({
    title: "Delete investment gain",
    tag: "Gains",
    method: "DELETE",
    path: "/gains/{id}",
    scope: "write",
    destructive: true,
    idempotent: true,
    description: "Deletes one recorded gain.",
    input: z.object({ id: Id }),
    output: Deleted,
    example: { input: { id: "g1" }, output: { deleted: true } },
  }),

  // Reports
  get_month_overview: op({
    title: "Get month overview",
    tag: "Reports",
    method: "GET",
    path: "/reports/month",
    scope: "read",
    description:
      "Summarises a month (default: this one), converted to one currency: income, spending and its change from last month, spending by category against your usual by the same day, the pace against the 6 months before, the largest income, and bills due in the next 30 days. Transfers and corrections are left out.",
    input: z.object({
      month: Month.optional(),
      currency: Currency.optional().describe("Defaults to your primary currency."),
    }),
    output: z.object({
      month: Month,
      currency: Currency,
      income: z.number().int(),
      spending: z.number().int().describe("Positive: money spent."),
      previous: z.object({ income: z.number().int(), spending: z.number().int() }),
      categories: z.array(
        z.object({
          id: Id,
          name: z.string(),
          spent: z.number().int(),
          count: z.number().int(),
          recurringOnly: z.boolean().describe("Every payment came from a recurring schedule."),
          usualByNow: z.number().int().nullable().describe("Average spent by the same day in the 6 months before."),
        })
      ),
      pace: z.object({
        daysInMonth: z.number().int(),
        day: z.number().int().nullable().describe("Today's day of month when it is this month."),
        spentSoFar: z.number().int(),
        usualByNow: z.number().int().nullable(),
        usualWholeMonth: z.number().int().nullable(),
      }),
      largestIncome: z.object({ payee: z.string(), day: Day, amount: z.number().int() }).nullable(),
      upcoming: z.array(
        z.object({
          name: z.string(),
          day: Day,
          amount: Cents,
          currency: Currency,
          kind: z.string(),
          recurringId: Id.nullable(),
          categoryId: Id,
        })
      ),
      history: z
        .array(
          z.object({ month: Month, income: z.number().int(), spending: z.number().int(), netWorth: z.number().int() })
        )
        .describe("The 12 months up to this one."),
    }),
    example: {
      input: { month: "2026-11" },
      output: {
        month: "2026-11",
        currency: "eur",
        income: 420000,
        spending: 61850,
        previous: { income: 420000, spending: 198200 },
        categories: [
          { id: "groceries", name: "Groceries", spent: 18400, count: 7, recurringOnly: false, usualByNow: 16100 },
        ],
        pace: { daysInMonth: 30, day: 6, spentSoFar: 61850, usualByNow: 52300, usualWholeMonth: 201400 },
        largestIncome: { payee: "Salary", day: "2026-11-01", amount: 420000 },
        upcoming: [
          {
            name: "Netflix",
            day: "2026-11-15",
            amount: -1299,
            currency: "eur",
            kind: "subscription",
            recurringId: "s1",
            categoryId: "entertainment",
          },
        ],
        history: [{ month: "2026-11", income: 420000, spending: 61850, netWorth: 3954300 }],
      },
    },
  }),
  get_net_worth: op({
    title: "Get net worth",
    tag: "Reports",
    method: "GET",
    path: "/reports/net-worth",
    scope: "read",
    description:
      "Net worth today converted to one currency, split into cash, investments (money in plus gains) and credit card debt, with each account's share and the month-end history.",
    input: z.object({ currency: Currency.optional().describe("Defaults to your primary currency.") }),
    output: z.object({
      currency: Currency,
      total: z.number().int(),
      receivables: z.number().int(),
      personalDebt: z.number().int(),
      cash: z.number().int(),
      investments: z.number().int(),
      invested: z.number().int(),
      gains: z.number().int(),
      debt: z.number().int().describe("Owed on credit cards, positive."),
      availableCredit: z.number().int(),
      accounts: z
        .array(z.object({ id: Id, name: z.string(), type: AccountType, worth: z.number().int() }))
        .describe("Active accounts, worth converted."),
      history: z.array(z.object({ month: Month, netWorth: z.number().int() })),
    }),
    example: {
      input: {},
      output: {
        currency: "eur",
        total: 3954300,
        receivables: 0,
        personalDebt: 0,
        cash: 2754300,
        investments: 1382000,
        invested: 1200000,
        gains: 182000,
        debt: 182000,
        availableCredit: 318000,
        accounts: [{ id: "a1", name: "Current account", type: "bank", worth: 254300 }],
        history: [{ month: "2026-10", netWorth: 3880100 }],
      },
    },
  }),

  // Settings
  get_settings: op({
    title: "Get settings",
    tag: "Settings",
    method: "GET",
    path: "/settings",
    scope: "read",
    description:
      "Your name, primary currency, time zone, display preferences and the exchange rates for the currencies you use. Days and months everywhere follow the time zone.",
    input: z.object({}),
    output: Settings,
    example: {
      input: {},
      output: {
        user: { name: "Ada", email: "ada@example.com" },
        primaryCurrency: "eur",
        timeZone: "Europe/Paris",
        currencyOrder: ["eur", "usd"],
        preferences: {
          language: null,
          theme: "system",
          layout: "boxed",
          motion: "on",
          accent: "teal",
          density: "comfortable",
          figures: "mono",
          hide_amounts: "0",
          account_colours: "1",
          round_hero: "0",
          default_wallet: "last",
          add_kind: "expense",
          suggest_category: "1",
          default_auto_pay: "1",
          upcoming_horizon: "month",
          learn_rules: "1",
        },
        exchangeRates: { updatedAt: 1793900000, perUsd: { eur: 0.92, gbp: 0.78, usd: 1 } },
      },
    },
  }),
  update_settings: op({
    title: "Update settings",
    tag: "Settings",
    method: "PATCH",
    path: "/settings",
    scope: "write",
    idempotent: true,
    description:
      "Changes your primary currency, time zone, currency order or preferences. Only the fields you pass change.",
    input: z.object({
      primaryCurrency: Currency.optional(),
      timeZone: z.string().max(64).optional().describe("IANA zone, e.g. America/New_York."),
      currencyOrder: z.array(Currency).max(50).optional(),
      preferences: Preferences.partial().optional(),
    }),
    output: Settings,
    example: {
      input: { timeZone: "America/New_York", preferences: { theme: "dark" } },
      output: {
        user: { name: "Ada", email: "ada@example.com" },
        primaryCurrency: "eur",
        timeZone: "America/New_York",
        currencyOrder: ["eur", "usd"],
        preferences: {
          language: null,
          theme: "dark",
          layout: "boxed",
          motion: "on",
          accent: "teal",
          density: "comfortable",
          figures: "mono",
          hide_amounts: "0",
          account_colours: "1",
          round_hero: "0",
          default_wallet: "last",
          add_kind: "expense",
          suggest_category: "1",
          default_auto_pay: "1",
          upcoming_horizon: "month",
          learn_rules: "1",
        },
        exchangeRates: { updatedAt: 1793900000, perUsd: { eur: 0.92, gbp: 0.78, usd: 1 } },
      },
    },
  }),
  refresh_exchange_rates: op({
    title: "Refresh exchange rates",
    tag: "Settings",
    method: "POST",
    path: "/exchange-rates/refresh",
    scope: "write",
    idempotent: true,
    description:
      "Fetches today's exchange rates now. Kosha refreshes them daily on its own; this runs at most once every 10 minutes.",
    input: z.object({}),
    output: z.object({ refreshed: z.boolean(), updatedAt: z.number().int() }),
    example: { input: {}, output: { refreshed: true, updatedAt: 1793955600 } },
  }),

  // Cursor passes only the first 40 tools to its agent, so everything after reconcile_account is a tool an
  // agent rarely needs: undoing, dismissing, and the AI tools an AI assistant can do for itself.

  // Reconciliation
  check_statement: op({
    title: "Check a statement",
    tag: "Reconciliation",
    method: "POST",
    path: "/statements/check",
    scope: "write",
    ai: "sometimes",
    description:
      "Reads a bank statement file and checks it against an account, saving nothing but the CSV's column layout. CSV, OFX and QFX are read by Kosha; a PDF needs the AI model (Statements on in Settings › AI). Each line comes back matched to an entry (same bank id, same amount within a few days, a split where one line is 2 or 3 entries or the other way round, a close amount such as a tip, or an OFX bank correction to another amount) or as missing, with a suggested payee and category. A split is matched only when it is the one way to make the sum; other ways come back as hints. Then: add missing lines with create_transactions, passing each line's bankRef; fix close amounts and bank corrections with update_transactions; delete entries in withdrawn with delete_transactions if the bank dropped them; and finish with reconcile_account, passing reconciliation.transactionIds and the statement balance. reconciliation.hints explain a difference; explain: true also asks the AI model.",
    input: z.object({
      accountId: Id,
      file: z.object({
        name: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe("The file name, e.g. october.csv. Its extension tells the format."),
        content: z.string().min(1).max(15_000_000).describe("The file as text for CSV, OFX and QFX; base64 for a PDF."),
        format: z.enum(["csv", "ofx", "qfx", "pdf"]).optional().describe("Left out: from the name and content."),
      }),
      columns: z
        .object({
          header: z.number().int().min(-1).describe("Row of the header, from 0; -1 for none."),
          date: z.number().int().min(0),
          dateFormat: z.enum(["ymd", "dmy", "mdy", "text"]),
          description: z.array(z.number().int().min(0)).max(4),
          amount: z
            .number()
            .int()
            .min(0)
            .nullable()
            .describe("One signed amount column, or null with debit and credit."),
          debit: z.number().int().min(0).nullable().describe("Money out column."),
          credit: z.number().int().min(0).nullable().describe("Money in column."),
          invert: z.boolean().describe("Spending is shown as positive."),
          balance: z.number().int().min(0).nullable(),
        })
        .optional()
        .describe("CSV only: which column holds what, from 0, when the reply's columns were read wrong."),
      explain: z
        .boolean()
        .default(false)
        .describe("When it doesn't match, also ask the AI model what explains the difference."),
    }),
    output: z.object({
      format: z.enum(["csv", "ofx", "pdf"]),
      statement: z.object({
        from: Day,
        to: Day.describe("The statement day: the closing day, or the last line's."),
        closingBalance: z
          .number()
          .int()
          .nullable()
          .describe("As printed: for a credit card, what is owed (positive). null when the file has none."),
        linesAddUp: z
          .boolean()
          .nullable()
          .describe("PDF only: whether the lines take the opening balance to the closing one."),
      }),
      columns: z
        .object({
          header: z.number().int(),
          date: z.number().int(),
          dateFormat: z.enum(["ymd", "dmy", "mdy", "text"]),
          description: z.array(z.number().int()),
          amount: z.number().int().nullable(),
          debit: z.number().int().nullable(),
          credit: z.number().int().nullable(),
          invert: z.boolean(),
          balance: z.number().int().nullable(),
        })
        .nullable()
        .describe("CSV only: the columns used. Remembered for the next file with the same header."),
      lines: z.array(
        z.object({
          index: z.number().int(),
          day: Day,
          amount: Cents,
          description: z.string().describe("The bank's text."),
          bankRef: z.string().describe("Pass it to create_transactions when you add this line."),
          match: z
            .object({
              transactionId: Id,
              transactionIds: z.array(Id).describe("Every entry this line matches: more than one for a split."),
              kind: z
                .enum(["bank_ref", "same_amount", "split", "close_amount", "bank_correction"])
                .describe(
                  "bank_correction: the bank's OFX correction of an entry imported earlier, now with another amount."
                ),
              reconciled: z.boolean().describe("The entries were already reconciled."),
            })
            .nullable()
            .describe("null: missing from Kosha."),
          payee: z.string().nullable().describe("Missing lines: the payee Kosha suggests."),
          categoryId: Id.nullable().describe("Missing lines: the category Kosha suggests, if any."),
        })
      ),
      withdrawn: z
        .array(Id)
        .describe(
          "Open entries imported from an earlier file that this OFX file's bank corrections delete. Kosha leaves them as they are."
        ),
      notOnStatement: z.array(Id).describe("Open entries in the statement's period that match no line."),
      reconciliation: z.object({
        statementDay: Day,
        statementBalance: z.number().int().nullable().describe("As printed, as in statement.closingBalance."),
        tickedBalance: z.number().int().describe("What Kosha's ticked entries come to, in the same terms."),
        difference: z.number().int().nullable().describe("statementBalance minus tickedBalance. 0 means it matches."),
        transactionIds: z
          .array(Id)
          .describe("The entries that count as on the statement. Pass them to reconcile_account."),
        hints: z
          .array(z.object({ text: z.string(), transactionIds: z.array(Id) }))
          .describe("What may explain a difference."),
      }),
      explanation: z
        .object({
          summary: z.string(),
          suggestions: z.array(z.object({ text: z.string(), transactionIds: z.array(Id) })),
        })
        .nullable()
        .describe("With explain: true and a difference, the AI model's view."),
    }),
    example: {
      input: {
        accountId: "a1",
        file: {
          name: "october.csv",
          content: "Date,Description,Amount,Balance\n03/10/2026,TESCO STORES 3211,-23.50,2519.50",
        },
      },
      output: {
        format: "csv",
        statement: { from: "2026-10-03", to: "2026-10-03", closingBalance: 251950, linesAddUp: null },
        columns: {
          header: 0,
          date: 0,
          dateFormat: "dmy",
          description: [1],
          amount: 2,
          debit: null,
          credit: null,
          invert: false,
          balance: 3,
        },
        lines: [
          {
            index: 0,
            day: "2026-10-03",
            amount: -2350,
            description: "TESCO STORES 3211",
            bankRef: "h:1x9k2p",
            match: { transactionId: tx.id, transactionIds: [tx.id], kind: "same_amount", reconciled: false },
            payee: null,
            categoryId: null,
          },
        ],
        withdrawn: [],
        notOnStatement: [],
        reconciliation: {
          statementDay: "2026-10-03",
          statementBalance: 251950,
          tickedBalance: 251950,
          difference: 0,
          transactionIds: [tx.id],
          hints: [],
        },
        explanation: null,
      },
    },
  }),
  reconcile_account: op({
    title: "Reconcile account",
    tag: "Reconciliation",
    method: "POST",
    path: "/accounts/{id}/reconcile",
    scope: "write",
    description:
      "Marks an account's entries as checked against a statement. statementBalance is as printed: the closing balance, or for a credit card what is owed. Without transactionIds, every paid entry up to statementDay counts, which suits \"my bank shows the same balance\". With a difference it fails and says by how much, unless correctDifference books it as a balance correction. Reconciled entries are un-reconciled when their amount, account or day changes. Investments can't be reconciled.",
    input: z.object({
      id: Id.describe("The account."),
      statementDay: Day,
      statementBalance: z.number().int().describe("As printed on the statement, in cents."),
      transactionIds: z
        .array(Id)
        .max(20_000)
        .optional()
        .describe("The open entries on the statement, e.g. check_statement's reconciliation.transactionIds."),
      correctDifference: z.boolean().default(false).describe("Book any difference as a balance correction."),
    }),
    output: z.object({
      reconciliationId: Id,
      entries: z.number().int().describe("Entries reconciled."),
      adjustment: z.number().int().describe("The correction booked, in cents; 0 when it matched."),
      account: Account,
    }),
    example: {
      input: { id: "a1", statementDay: "2026-10-31", statementBalance: 254300 },
      output: { reconciliationId: "r1", entries: 42, adjustment: 0, account },
    },
  }),
  // Keep the existing first 40 tools stable; loans precede rare undo/AI tools. REST has no tool cap.
  list_loans: op({
    title: "List loans",
    tag: "Loans",
    method: "GET",
    path: "/loans",
    scope: "read",
    description:
      "Personal lending and borrowing agreements, including fully repaid ones. Remaining principal is separate from cash. Use get_loan for payment history.",
    input: z.object({}),
    output: z.object({ loans: z.array(loanSchema) }),
    example: {
      input: {},
      output: {
        loans: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            direction: "lent" as const,
            person: "Sam",
            purpose: "Deposit",
            note: "",
            currency: "eur",
            principal: 50000,
            repaid: 0,
            remaining: 50000,
            day: "2026-10-01",
            dueDay: null,
            opening: true,
          },
        ],
      },
    },
  }),
  get_loan: op({
    title: "Get loan",
    tag: "Loans",
    method: "GET",
    path: "/loans/{id}",
    scope: "read",
    description:
      "One agreement and its actual dated bank payments, including principal applied in the agreement's currency.",
    input: z.object({ id: Id }),
    output: z.object({ loan: loanSchema, payments: z.array(loanPaymentSchema) }),
    example: {
      input: { id: "00000000-0000-4000-8000-000000000001" },
      output: {
        loan: {
          id: "00000000-0000-4000-8000-000000000001",
          direction: "lent" as const,
          person: "Sam",
          purpose: "Deposit",
          note: "",
          currency: "eur",
          principal: 50000,
          repaid: 0,
          remaining: 50000,
          day: "2026-10-01",
          dueDay: null,
          opening: true,
        },
        payments: [],
      },
    },
  }),
  create_loan: op({
    title: "Create loan",
    tag: "Loans",
    method: "POST",
    path: "/loans",
    scope: "write",
    idempotent: true,
    description:
      "Create a personal loan: source new records one bank movement; existing links an eligible transactionId without duplicating cash; opening tracks a balance with no bank movement. Use a fresh UUID id and reuse it unchanged on retry. Principal is positive cents. Initial account and loan currencies must match. Do not add a loan for debt already counted in an account.",
    input: loanInput,
    output: z.object({ id: Id }),
    example: {
      input: {
        id: "00000000-0000-4000-8000-000000000001",
        direction: "lent",
        person: "Sam",
        purpose: "Deposit",
        source: "opening",
        amount: 50000,
        currency: "eur",
        day: "2026-10-01",
      },
      output: { id: "00000000-0000-4000-8000-000000000001" },
    },
  }),
  update_loan: op({
    title: "Update loan",
    tag: "Loans",
    method: "PATCH",
    path: "/loans/{id}",
    scope: "write",
    idempotent: true,
    description:
      "Edit the person, purpose, note and optional dueDay. Principal, currency, direction and original date are immutable; resolve incorrect movements through unlink_loan_payment.",
    input: loanEditInput,
    output: z.object({ saved: z.boolean() }),
    example: {
      input: { id: "l1", person: "Sam", purpose: "Deposit", note: "", dueDay: "2026-12-01" },
      output: { saved: true },
    },
  }),
  record_loan_repayment: op({
    title: "Record loan repayment",
    tag: "Loans",
    method: "POST",
    path: "/loans/{loanId}/repayments",
    scope: "write",
    idempotent: true,
    description:
      "Record or link a partial/full repayment. amount is principal in loan currency; accountAmount is the actual positive bank amount if currencies differ. Provide accountId for a new bank movement, or transactionId to link an existing entry. Use a fresh UUID id and reuse it unchanged on retry. Overpayment is rejected atomically. Principal never counts as income/spending.",
    input: loanRepaymentInput,
    output: z.object({ id: Id }),
    example: {
      input: {
        id: "00000000-0000-4000-8000-000000000002",
        loanId: "l1",
        amount: 15000,
        accountId: "a1",
        day: "2026-11-01",
      },
      output: { id: "l1" },
    },
  }),
  unlink_loan_payment: op({
    title: "Unlink loan payment",
    tag: "Loans",
    method: "POST",
    path: "/loan-payments/{transactionId}/unlink",
    scope: "write",
    destructive: true,
    description:
      "Keep the bank entry and its reconciliation, but reclassify it into an ordinary categoryId matching the cash direction. Unlinking funding removes the agreement and requires unlinking repayments first. This changes income/spending totals.",
    input: loanUnlinkInput,
    output: z.object({ unlinked: z.boolean() }),
    example: { input: { transactionId: "t1", categoryId: "salary" }, output: { unlinked: true } },
  }),
  delete_loan: op({
    title: "Delete loan",
    tag: "Loans",
    method: "DELETE",
    path: "/loans/{id}",
    scope: "write",
    destructive: true,
    description:
      "Remove an opening balance with no bank links. Any linked payment blocks deletion; explicitly unlink those payments first. No bank history is deleted.",
    input: z.object({ id: Id }),
    output: z.object({ deleted: z.boolean() }),
    example: { input: { id: "l1" }, output: { deleted: true } },
  }),

  undo_reconciliation: op({
    title: "Undo reconciliation",
    tag: "Reconciliation",
    method: "POST",
    path: "/accounts/{id}/reconcile/undo",
    scope: "write",
    destructive: true,
    description:
      "Undoes an account's latest reconciliation: its entries are open again and any correction it booked is deleted.",
    input: z.object({ id: Id.describe("The account.") }),
    output: z.object({ statementDay: Day, entries: z.number().int() }),
    example: { input: { id: "a1" }, output: { statementDay: "2026-10-31", entries: 42 } },
  }),

  // Recurring
  dismiss_recurring_suggestion: op({
    title: "Dismiss recurring suggestion",
    tag: "Recurring",
    method: "POST",
    path: "/recurring/suggestions/dismiss",
    scope: "write",
    idempotent: true,
    description: "Stops suggesting a payee as recurring (list_recurring with includeSuggestions).",
    input: z.object({ payee: z.string().trim().min(1).max(200) }),
    output: z.object({ dismissed: z.boolean() }),
    example: { input: { payee: "Tesco" }, output: { dismissed: true } },
  }),

  // AI
  read_transaction: op({
    title: "Read a transaction",
    tag: "AI",
    method: "POST",
    path: "/ai/read-transaction",
    scope: "write",
    ai: "always",
    description:
      "Reads one transaction from a sentence (\"lunch with Sam at Nando's 18.50 yesterday\", Natural-language add) or a receipt photo (Receipt scanning), using the AI model. It returns the entry it read; with save: true it also adds it, using your payee rules when it found no category. A receipt in another currency is converted at today's rate. You rarely need this as an AI assistant: create_transactions takes the fields directly.",
    input: z
      .object({
        text: z.string().trim().min(1).max(500).optional(),
        photo: z
          .object({
            data: z.string().min(100).max(8_000_000).describe("Base64. Keep it under about 5 MB."),
            mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
          })
          .optional(),
        accountId: Id.optional().describe("The account to use when the text names none."),
        save: z.boolean().default(false),
      })
      .refine((i) => !!i.text !== !!i.photo, "Pass text or a photo"),
    output: z.object({
      entry: z.object({
        payee: z.string(),
        amount: Cents.nullable(),
        currency: Currency.nullable().describe("The account's currency."),
        accountId: Id.nullable(),
        categoryId: Id.nullable(),
        day: Day,
        time: z.string().nullable().describe("HH:MM when given or printed."),
        note: z.string(),
        tags: z.array(z.string()),
      }),
      transaction: Transaction.nullable().describe("With save: true, the entry added."),
    }),
    example: {
      input: { text: "lunch with sam at nandos 18.50 yesterday", accountId: "a1" },
      output: {
        entry: {
          payee: "Nando's",
          amount: -1850,
          currency: "eur",
          accountId: "a1",
          categoryId: "dining",
          day: "2026-11-05",
          time: null,
          note: "with Sam",
          tags: [],
        },
        transaction: null,
      },
    },
  }),
  ask_kosha: op({
    title: "Ask Kosha",
    tag: "AI",
    method: "POST",
    path: "/ai/ask",
    scope: "write",
    ai: "always",
    description:
      "Answers a question about your money with the AI model connected in Kosha, which looks things up in your data within Settings › AI › What AI can see. For a follow-up, pass the history from the last reply. An AI assistant can usually answer from search_transactions and get_month_overview itself.",
    input: z.object({
      question: z.string().trim().min(1).max(2000),
      history: z
        .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(6000) }))
        .max(22)
        .default([])
        .describe("The history from the previous reply, for a follow-up."),
    }),
    output: z.object({
      answer: z.string().describe("Plain text with **bold** and - lists."),
      lookups: z.array(z.string()).describe("What it looked up."),
      sources: z
        .array(z.object({ label: z.string(), search: z.record(z.string(), z.union([z.string(), z.number()])) }))
        .describe("search_transactions inputs for the entries behind the answer."),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() })),
    }),
    example: {
      input: { question: "How much did I spend on dining in October?" },
      output: {
        answer: "You spent **€242.04** on dining in October, most of it at Burger King.",
        lookups: ["Looking through Dining, October 2026"],
        sources: [{ label: "Dining · October 2026", search: { categoryId: "dining", month: "2026-10" } }],
        history: [
          { role: "user", text: "How much did I spend on dining in October?" },
          { role: "assistant", text: "You spent **€242.04** on dining in October, most of it at Burger King." },
        ],
      },
    },
  }),
  recap_month: op({
    title: "Recap a month",
    tag: "AI",
    method: "POST",
    path: "/ai/recap",
    scope: "write",
    ai: "sometimes",
    description:
      "A short recap of a finished month: what changed against a usual month, and why. The stored recap comes back as it is; a month without one, or with rewrite: true, is written by the AI model (Monthly recap on in Settings › AI).",
    input: z.object({ month: Month, rewrite: z.boolean().default(false) }),
    output: z.object({
      month: Month,
      headline: z.string(),
      summary: z.string(),
      points: z.array(z.object({ text: z.string(), tone: z.enum(["good", "bad", "neutral"]) })),
      writtenDay: Day,
      written: z.boolean().describe("Written by this call, rather than stored."),
    }),
    example: {
      input: { month: "2026-10" },
      output: {
        month: "2026-10",
        headline: "October spending was 23% above your usual month.",
        summary: "Travel and dining drove it, mostly the Rome weekend.",
        points: [{ text: "Groceries were 32% below usual.", tone: "good" }],
        writtenDay: "2026-11-01",
        written: false,
      },
    },
  }),
}

export type OperationName = keyof typeof OPERATIONS
export type OperationInput<K extends OperationName> = z.output<(typeof OPERATIONS)[K]["input"]>
export type OperationOutput<K extends OperationName> = z.input<(typeof OPERATIONS)[K]["output"]>
export const operations = Object.entries(OPERATIONS) as [OperationName, Operation][]

/** Example input as the MCP tool description shows it. */
export const toolDescription = (o: Operation) => `${o.description}\n\nExample input: ${JSON.stringify(o.example.input)}`

// ---------- REST routing and OpenAPI ----------

const pathParams = (path: string) => [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1])

/** The operation for a method and path under /api/v1, with its path parameters. */
export function matchRoute(method: string, path: string) {
  for (const [name, o] of operations) {
    if (o.method !== method) continue
    const names = pathParams(o.path)
    const re = new RegExp(`^${o.path.replace(/\{\w+\}/g, "([^/]+)")}/?$`)
    const m = re.exec(path)
    if (m) return { name, op: o, params: Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) }
  }
  return null
}

type JsonSchema = {
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  required?: string[]
  [k: string]: unknown
}
const jsonSchema = (s: z.ZodType, io: "input" | "output") => {
  const { $schema: _, ...rest } = z.toJSONSchema(s, { io, unrepresentable: "any" }) as JsonSchema
  return rest
}

/** Query strings are text: turn each value into the type its input field expects. */
export function parseQuery(o: Operation, query: URLSearchParams) {
  const props = jsonSchema(o.input, "input").properties ?? {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of query) {
    const types = [props[k]?.type, ...((props[k]?.anyOf as JsonSchema[] | undefined) ?? []).map((t) => t.type)].flat()
    out[k] =
      types.includes("integer") || types.includes("number")
        ? v.trim() === ""
          ? v
          : Number(v)
        : types.includes("boolean")
          ? v === "true" || v === "1"
          : v
  }
  return out
}

const errorSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string", examples: ["invalid_request", "not_found", "conflict"] },
        message: { type: "string" },
        issues: {
          type: "array",
          description: "Present on invalid_request: one entry per invalid field.",
          items: { type: "object", properties: { path: { type: "string" }, message: { type: "string" } } },
        },
      },
    },
  },
}
const ERRORS = {
  400: ["invalid_request", "The input failed validation, or the change isn't allowed. The message says why."],
  401: ["unauthorized", "Missing, unknown or revoked API key."],
  403: ["insufficient_scope", "The key is read-only and this operation writes."],
  404: ["not_found", "An id in the request doesn't exist."],
  409: ["conflict", "The change clashes with existing data, e.g. deleting an account that has transactions."],
  429: ["rate_limited", "Too many requests. Wait a minute."],
} as const
// Operations that use the AI model can also fail these ways.
const AI_ERRORS = {
  409: [
    "ai_unavailable",
    "No AI provider is connected in Settings › AI, AI is off, or this feature or a setting it needs is off. The message says what to turn on. (Other operations use 409 for a conflict.)",
  ],
  502: [
    "ai_provider_error",
    "The AI provider failed, or answered with something Kosha couldn't use. The message has its words.",
  ],
} as const

/** OpenAPI 3.1 document for the REST API, generated from OPERATIONS. */
export function openApiSpec(origin: string) {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const [name, o] of operations) {
    const input = jsonSchema(o.input, "input")
    const props = input.properties ?? {}
    const required = new Set(input.required ?? [])
    const inPath = pathParams(o.path)
    const param = (k: string, where: "path" | "query") => {
      const { description, ...schema } = props[k] ?? {}
      return { name: k, in: where, required: where === "path" || required.has(k), description, schema }
    }
    const bodyKeys = o.method === "GET" ? [] : Object.keys(props).filter((k) => !inPath.includes(k))
    const parameters = [
      ...inPath.map((k) => param(k, "path")),
      ...(o.method === "GET" ? Object.keys(props).map((k) => param(k, "query")) : []),
    ]
    const bodyExample = Object.fromEntries(Object.entries(o.example.input).filter(([k]) => !inPath.includes(k)))
    const responses: Record<string, unknown> = {
      200: {
        description: "OK",
        content: { "application/json": { schema: jsonSchema(o.output, "output"), example: o.example.output } },
      },
    }
    for (const [status, [code, text]] of Object.entries(o.ai ? { ...ERRORS, ...AI_ERRORS } : ERRORS)) {
      if (status === "403" && o.scope === "read") continue
      responses[status] = {
        description: text,
        content: { "application/json": { schema: errorSchema, example: { error: { code, message: text } } } },
      }
    }
    ;(paths[o.path] ??= {})[o.method.toLowerCase()] = {
      operationId: name,
      summary: o.title,
      description: `${o.description}\n\nNeeds a ${o.scope === "write" ? "read & write" : "read-only or read & write"} key. MCP tool: \`${name}\`.`,
      tags: [o.tag],
      parameters: parameters.length ? parameters : undefined,
      requestBody: bodyKeys.length
        ? {
            required: true,
            content: {
              "application/json": {
                schema: {
                  ...input,
                  properties: Object.fromEntries(bodyKeys.map((k) => [k, props[k]])),
                  required: input.required?.filter((k) => bodyKeys.includes(k)),
                },
                example: bodyExample,
              },
            },
          }
        : undefined,
      responses,
      "x-mcp-tool": name,
      "x-scope": o.scope,
    }
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Kosha API",
      version: "1.0.0",
      description: [
        "Everything you can do in Kosha's app, over HTTP. The same operations are tools on the MCP server at `/mcp`.",
        "",
        "**Authentication.** Create a key in Settings › API & MCP and send it as `Authorization: Bearer kosha_…`. A read-only key can call the GET operations; a read & write key can call all of them. Apps can instead sign people in with OAuth 2.1 (authorization code with PKCE, discovery at `/.well-known/oauth-authorization-server`), asking for `kosha:read` or `kosha:write` and the resource `" +
          origin +
          "/api/v1`, and send the access token the same way.",
        "",
        "**Conventions.** Money is integer minor units (cents) in the account's currency: €12.50 is `1250`. The sign is the direction: negative is money out. Days are `YYYY-MM-DD` and months `YYYY-MM` in your Kosha time zone. Bulk writes are all-or-nothing: if one item fails, nothing is saved and the error names the item.",
        "",
        "**AI.** Operations tagged AI, and a PDF given to check_statement, use the AI model connected in Kosha under Settings › AI and spend that provider's tokens. When none is connected, AI is off, or the feature is off, they answer `409 ai_unavailable` with what to turn on; a failing provider answers `502 ai_provider_error`.",
        "",
        "**Limits.** 120 requests a minute per user.",
      ].join("\n"),
    },
    servers: [{ url: `${origin}/api/v1` }],
    security: [{ apiKey: [] }, { oauth: [] }],
    tags: Object.entries(TAGS).map(([name, description]) => ({ name, description })),
    paths,
    components: {
      securitySchemes: {
        apiKey: {
          type: "http",
          scheme: "bearer",
          description: "An API key from Settings › API & MCP, starting kosha_.",
        },
        oauth: {
          type: "oauth2",
          description: "An access token from Kosha's OAuth server, for the resource /api/v1 (or /mcp).",
          flows: {
            authorizationCode: {
              authorizationUrl: `${origin}/api/auth/oauth2/authorize`,
              tokenUrl: `${origin}/api/auth/oauth2/token`,
              refreshUrl: `${origin}/api/auth/oauth2/token`,
              scopes: { "kosha:read": "Read your data", "kosha:write": "Change your data" },
            },
          },
        },
      },
    },
  }
}
