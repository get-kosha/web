import { useEffect, useState } from "react"
import { SparkleIcon } from "@phosphor-icons/react/ssr"
import { scanReceipt, suggestCategory } from "@/lib/api"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

// Client pieces the AI features share. Each surface renders these only while its feature is on (meta.ai).

/** Marks a value an AI feature filled in. */
export const AiMark = ({ className }: { className?: string }) => (
  <SparkleIcon weight="fill" aria-hidden="true" className={cn("size-3.5 shrink-0 text-brand", className)} />
)

/** Answers per kind and payee for this visit, so retyping a payee never asks twice. */
const guesses = new Map<string, string | null>()

/**
 * Auto-categorise: the category AI suggests for `payee`, asked once typing pauses. `on` should be false
 * whenever a rule, history or the person already decided the category.
 */
export function useAiCategory(payee: string, kind: "expense" | "income", on: boolean) {
  const name = payee.trim()
  const key = `${kind}:${name.toLowerCase()}`
  const ready = on && name.length >= 3
  const [, setVersion] = useState(0)
  const [asking, setAsking] = useState<string | null>(null)
  useEffect(() => {
    if (!ready || guesses.has(key)) return
    let live = true
    const t = setTimeout(() => {
      setAsking(key)
      suggestCategory({ data: { payee: name, kind } })
        .then((r) => guesses.set(key, r.categoryId))
        // A failure (offline, a bad key) leaves the form as it is without AI, and isn't remembered,
        // so the same payee can ask again later.
        .catch(() => {})
        .finally(() => {
          if (!live) return
          setAsking(null)
          setVersion((v) => v + 1)
        })
    }, 700)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [ready, key])
  return { id: ready ? (guesses.get(key) ?? null) : null, loading: ready && asking === key }
}

/** Scales a photo down to at most 1600px on its long side and encodes it as base64 JPEG. */
async function shrink(file: Blob) {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(m.overview_ai_image_unsupported())
  })
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.82))
  if (!blob) throw new Error(m.overview_ai_photo_unreadable())
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ""
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Receipt scanning: reads amount, date and payee from a photo. */
export async function readReceipt(file: Blob) {
  if (!file.type.startsWith("image/")) throw new Error(m.overview_ai_pick_photo())
  return scanReceipt({ data: { image: await shrink(file), mime: "image/jpeg" } })
}

/** The first image in a paste or a drop, if any. */
export const imageIn = (data: DataTransfer | null) =>
  [...(data?.files ?? [])].find((f) => f.type.startsWith("image/")) ?? null
