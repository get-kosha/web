import { intlLocale } from "./core.ts"

/** localStorage key for the last account a transaction was added to (quick add, phone add, the form). */
export const WALLET_KEY = "kosha:wallet"

/**
 * The account Add starts on. That is Settings › General › Default account when it names an active account,
 * otherwise the last one used on this device. Read it after mount, because localStorage isn't on the server.
 */
export function startWallet(pref: string, wallets: { id: string }[], skip?: string) {
  if (pref !== "last" && pref !== skip && wallets.some((w) => w.id === pref)) return pref
  try {
    const id = localStorage.getItem(WALLET_KEY)
    return id && id !== skip ? wallets.find((w) => w.id === id)?.id : undefined
  } catch {
    return undefined
  }
}

/** The language's decimal mark ("," in German), for showing amounts that are kept with "." while typed. */
export const decimalMark = () =>
  new Intl.NumberFormat(intlLocale()).formatToParts(1.5).find((p) => p.type === "decimal")?.value ?? "."
