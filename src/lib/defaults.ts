// Starting categories for a new account. Sign-up and scripts/seed-demo.ts both use this file, so it has no imports.
// The app itself uses '0', 'transfer' and 'transfer_fee', so they must exist for every user.

export const DEFAULT_CATEGORIES: { id: string; name: string; icon: string; income: 0 | 1 }[] = [
  { id: "groceries", name: "Groceries", icon: "🛒", income: 0 },
  { id: "dining", name: "Dining", icon: "🍽️", income: 0 },
  { id: "shopping", name: "Shopping", icon: "🛍️", income: 0 },
  { id: "transit", name: "Transit", icon: "🚋", income: 0 },
  { id: "home", name: "Home", icon: "🏠", income: 0 },
  { id: "bills", name: "Bills & Fees", icon: "🧾", income: 0 },
  { id: "entertainment", name: "Entertainment", icon: "🍿", income: 0 },
  { id: "health", name: "Health", icon: "💊", income: 0 },
  { id: "travel", name: "Travel", icon: "✈️", income: 0 },
  { id: "gifts", name: "Gifts", icon: "🎁", income: 0 },
  { id: "salary", name: "Salary", icon: "💼", income: 1 },
  { id: "other_income", name: "Other income", icon: "💵", income: 1 },
  { id: "0", name: "Balance correction", icon: "⚖️", income: 0 },
  { id: "transfer_fee", name: "Transfer fees", icon: "💱", income: 0 },
  { id: "transfer", name: "Transfer", icon: "↔️", income: 0 },
]
