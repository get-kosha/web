// Receipts, payslips and other files attached to transactions. The bytes live in the optional ATTACHMENTS R2
// bucket under `<user_id>/<id>`; the attachments table lists them. Every query is scoped by user_id.

import { env, waitUntil } from "cloudflare:workers"
import { ATTACHMENT_LIMIT, dayOf, fileKind } from "@/lib/core"
import { HttpError, db, getSettings } from "@/server/db.server"
import { m } from "@/paraglide/messages"

/** The R2 bucket for attachments. It's an optional binding, so a deployment without R2 has none. */
export const attachmentBucket = () => (env as { ATTACHMENTS?: R2Bucket }).ATTACHMENTS

const keyOf = (uid: string, id: string) => `${uid}/${id}`

export type Attachment = {
  id: string
  transaction_id: string
  name: string
  type: string
  size: number
  created_at: number
}

/** A transaction's attachments, oldest first. */
export async function listAttachments(uid: string, transactionId: string) {
  const { results } = await db()
    .prepare(
      "SELECT id, transaction_id, name, type, size, created_at FROM attachments WHERE user_id = ? AND transaction_id = ? ORDER BY created_at, id"
    )
    .bind(uid, transactionId)
    .all<Attachment>()
  return results
}

/** Every attachment on a recurring schedule's payments, newest payment first, with the payment's day. */
export async function scheduleAttachments(uid: string, subscriptionId: string) {
  const { tz } = await getSettings(uid)
  const { results } = await db()
    .prepare(`SELECT a.id, a.transaction_id, a.name, a.type, a.size, a.created_at, t.due_day, t.date
      FROM attachments a JOIN transactions t ON t.user_id = a.user_id AND t.id = a.transaction_id
      WHERE a.user_id = ? AND t.subscription_id = ? ORDER BY t.date DESC, a.created_at, a.id`)
    .bind(uid, subscriptionId)
    .all<Attachment & { due_day: string | null; date: number }>()
  return results.map(({ due_day, date, ...a }) => ({ ...a, day: dayOf(date, tz), dueDay: due_day }))
}

/** Stores a file against one of the user's transactions. */
export async function addAttachment(uid: string, transactionId: string, file: File) {
  const bucket = attachmentBucket()
  if (!bucket) throw new HttpError(409, m.server_attachments_unavailable())
  if (file.size > ATTACHMENT_LIMIT) throw new HttpError(413, m.server_attachment_too_big())
  const DB = db()
  const tx = await DB.prepare("SELECT 1 FROM transactions WHERE user_id = ? AND id = ?")
    .bind(uid, transactionId)
    .first()
  if (!tx) throw new HttpError(404, m.server_transaction_not_found())
  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = fileKind(bytes)
  if (!type) throw new HttpError(415, m.server_attachment_type())
  const id = crypto.randomUUID()
  const name = (file.name || "file").slice(0, 200)
  await bucket.put(keyOf(uid, id), bytes, { httpMetadata: { contentType: type } })
  await DB.prepare("INSERT INTO attachments (user_id, id, transaction_id, name, type, size) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(uid, id, transactionId, name, type, bytes.length)
    .run()
  return {
    id,
    transaction_id: transactionId,
    name,
    type,
    size: bytes.length,
    created_at: Math.floor(Date.now() / 1000),
  }
}

/** Deletes one attachment. Its R2 object goes straight away rather than waiting for the next purge. */
export async function deleteAttachment(uid: string, id: string) {
  const res = await db().prepare("DELETE FROM attachments WHERE user_id = ? AND id = ?").bind(uid, id).run()
  if (!res.meta.changes) throw new HttpError(404, m.server_attachment_not_found())
  await purgeAttachments(uid)
}

/** One attachment's row and bytes, for the download route, or null. */
export async function getAttachment(uid: string, id: string) {
  const row = await db()
    .prepare("SELECT name, type FROM attachments WHERE user_id = ? AND id = ?")
    .bind(uid, id)
    .first<{ name: string; type: string }>()
  const body = row && (await attachmentBucket()?.get(keyOf(uid, id)))
  return row && body ? { ...row, body: body.body } : null
}

/**
 * Removes R2 objects whose rows are gone. Triggers queue them in attachment_trash whenever an attachment or its
 * transaction is deleted, wherever that happens.
 */
async function purgeAttachments(uid: string) {
  const bucket = attachmentBucket()
  if (!bucket) return
  const DB = db()
  const { results } = await DB.prepare("SELECT key FROM attachment_trash WHERE user_id = ? LIMIT 500")
    .bind(uid)
    .all<{ key: string }>()
  if (!results.length) return
  const keys = results.map((r) => r.key)
  await bucket.delete(keys)
  await DB.prepare("DELETE FROM attachment_trash WHERE user_id = ? AND key IN (SELECT value FROM json_each(?))")
    .bind(uid, JSON.stringify(keys))
    .run()
}

/** Runs purgeAttachments after the reply, so page loads don't wait on R2. */
export const purgeLater = (uid: string) => waitUntil(purgeAttachments(uid).catch(console.error))

/** Deletes every file the user has in R2, for deleting the account. */
export async function deleteAllAttachments(uid: string) {
  const bucket = attachmentBucket()
  if (!bucket) return
  let cursor: string | undefined
  do {
    const page = await bucket.list({ prefix: `${uid}/`, cursor })
    if (page.objects.length) await bucket.delete(page.objects.map((o) => o.key))
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
}
