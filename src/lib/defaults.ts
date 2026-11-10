// Starting categories for a new account. Sign-up and scripts/seed-demo.ts both use this file, so it imports
// only by relative path. The app itself uses '0', 'transfer' and 'transfer_fee', so they must exist for every user.

import { m } from "../paraglide/messages.js"

// `name` is a getter, so it reads the language of the sign-up that writes it, not the language at import.
const cat = (id: string, name: () => string, icon: string, income: 0 | 1 = 0) => ({
  id,
  get name() {
    return name()
  },
  icon,
  income,
})

export const DEFAULT_CATEGORIES: { id: string; readonly name: string; icon: string; income: 0 | 1 }[] = [
  cat("groceries", m.defaults_groceries, "🛒"),
  cat("dining", m.defaults_dining, "🍽️"),
  cat("shopping", m.defaults_shopping, "🛍️"),
  cat("transit", m.defaults_transit, "🚋"),
  cat("home", m.defaults_home, "🏠"),
  cat("bills", m.defaults_bills, "🧾"),
  cat("entertainment", m.defaults_entertainment, "🍿"),
  cat("health", m.defaults_health, "💊"),
  cat("travel", m.defaults_travel, "✈️"),
  cat("gifts", m.defaults_gifts, "🎁"),
  cat("salary", m.defaults_salary, "💼", 1),
  cat("other_income", m.defaults_other_income, "💵", 1),
  cat("0", m.defaults_correction, "⚖️"),
  cat("transfer_fee", m.defaults_transfer_fees, "💱"),
  cat("loan_principal", m.loans_title, "💸"),
  cat("transfer", m.defaults_transfer, "↔️"),
]
