import { deleteTransaction, saveTransaction } from "@/lib/api"

// New transactions added without a connection wait in localStorage, per user, until they can be sent.
// ponytail: only new entries from the add screens queue. Edits, transfers and deletes still need a connection.
type NewTx = Omit<Parameters<typeof saveTransaction>[0]["data"], "id">
type Queued = { key: string; data: NewTx }

const storeKey = (uid: string) => `kosha:outbox:${uid}`

export function queued(uid: string): Queued[] {
  try {
    return JSON.parse(localStorage.getItem(storeKey(uid)) ?? "[]")
  } catch {
    return []
  }
}

/** Fired on window whenever the queue changes, so the offline card can show the count. */
export const OUTBOX_EVENT = "kosha:outbox"

function write(uid: string, items: Queued[]) {
  if (items.length) localStorage.setItem(storeKey(uid), JSON.stringify(items))
  else localStorage.removeItem(storeKey(uid))
  window.dispatchEvent(new Event(OUTBOX_EVENT))
}

// fetch rejects with a TypeError when the request never reaches the server. Anything else is the server's answer.
const unreachable = (e: unknown) => !navigator.onLine || e instanceof TypeError

/** Saves a new transaction, or keeps it on this device when there's no connection. `undo` removes it either way. */
export async function addTransaction(uid: string, data: NewTx) {
  if (navigator.onLine) {
    try {
      const { id } = await saveTransaction({ data })
      return { queued: false, undo: () => deleteTransaction({ data: { id } }) }
    } catch (e) {
      if (!unreachable(e)) throw e
    }
  }
  const key = crypto.randomUUID()
  write(uid, [...queued(uid), { key, data }])
  return {
    queued: true,
    undo: async () =>
      write(
        uid,
        queued(uid).filter((q) => q.key !== key)
      ),
  }
}

/**
 * Sends queued transactions in the order they were added. Stops when the connection drops again.
 * An entry the server rejects (say, its account was deleted meanwhile) is dropped and reported.
 * ponytail: if the server saved an entry but the reply was lost, the retry saves it a second time.
 */
export async function sendQueued(uid: string) {
  const result = { sent: 0, rejected: [] as string[] }
  // The lock stops two tabs, or an "online" event and a page load, from sending the same entry twice.
  await navigator.locks.request(`kosha:outbox:${uid}`, { ifAvailable: true }, async (lock) => {
    if (!lock) return
    for (const item of queued(uid)) {
      try {
        await saveTransaction({ data: item.data })
        result.sent++
      } catch (e) {
        if (unreachable(e)) return
        result.rejected.push(e instanceof Error ? e.message : String(e))
      }
      write(
        uid,
        queued(uid).filter((q) => q.key !== item.key)
      )
    }
  })
  return result
}
