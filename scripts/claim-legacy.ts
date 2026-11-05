// Gives the data from before accounts existed (user_id 'legacy') to one account. Sign up first.
//   node scripts/claim-legacy.ts <email> > claim.sql
//   npx wrangler d1 execute kosha --local --file claim.sql   (or --remote)
// Anything the account already has (the starting categories from sign-up) is replaced.
const email = process.argv[2]
if (!email) {
  console.error("usage: node scripts/claim-legacy.ts <email>")
  process.exit(1)
}
const user = `(SELECT id FROM "user" WHERE email = '${email.replace(/'/g, "''")}')`
const tables = [
  "transfers",
  "valuations",
  "title_rules",
  "transactions",
  "subscriptions",
  "settings",
  "categories",
  "wallets",
]

console.log("PRAGMA defer_foreign_keys = on;")
for (const t of tables) console.log(`DELETE FROM ${t} WHERE user_id = ${user};`)
// An unknown email deletes nothing above and fails on the first update: user_id is NOT NULL.
for (const t of tables) console.log(`UPDATE ${t} SET user_id = ${user} WHERE user_id = 'legacy';`)
