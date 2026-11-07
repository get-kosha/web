// A fake OpenAI-compatible AI provider for testing Kosha's AI features in `npm run dev` without spending tokens.
//
//   node scripts/ai-stub.ts [port]        (default 3418)
//
// In Settings › AI, connect "Your endpoint" with the URL http://localhost:3418/v1, any key and the model "stub".
// It answers each feature's prompt with a canned reply in the shape the prompt asks for. Every request is kept,
// so a test can read what Kosha sent:
//   GET  /__log            the requests so far, as JSON
//   POST /__reset          forget them
//   POST /__mode           {"tidy": "good" | "fenced" | "partial" | "malformed" | "fail-2nd", "statement": "good" | "malformed" | "fail"}
// A PDF's file name picks the statement: "card" in it reads as a credit card, "noname" without an account name,
// "nolast4" without the last four digits, and "nopayee" leaves the payees out.

import { createServer } from "node:http"

const port = Number(process.argv[2] ?? 3418)
const log: { at: number; feature: string; body: any }[] = []
let mode = { tidy: "good", statement: "good" }
let tidyCalls = 0

const pick = <T>(list: T[], s: string) =>
  list[[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % list.length]
const title = (s: string) => s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase())

function statement(file: string) {
  const card = /card/i.test(file)
  const lines = card
    ? [
        { date: "2026-10-03", description: "AMZN MKTP UK*2K4 AMAZON.CO.UK", payee: "Amazon", amount: -42.99 },
        { date: "2026-10-09", description: "TFL TRAVEL CH LONDON", payee: "TfL", amount: -8.1 },
        { date: "2026-10-15", description: "PAYMENT RECEIVED THANK YOU", payee: "Payment", amount: 150 },
        { date: "2026-10-21", description: "NETFLIX.COM 866-579-7172", payee: "Netflix", amount: -10.99 },
      ]
    : [
        { date: "2026-10-01", description: "SALARY WIDGETCO LTD", payee: "Widgetco", amount: 2400 },
        {
          date: "2026-10-04",
          description: "CARD PAYMENT TO TESCO STORES 3211 ON 03 OCT",
          payee: "Tesco",
          amount: -54.2,
        },
        { date: "2026-10-12", description: "DIRECT DEBIT OCTOPUS ENERGY", payee: "Octopus Energy", amount: -88 },
        {
          date: "2026-10-19",
          description: "CARD PAYMENT TO PRET A MANGER ON 18 OCT",
          payee: "Pret A Manger",
          amount: -6.45,
        },
        { date: "2026-10-28", description: "TRANSFER TO SAVINGS", payee: "Savings", amount: -300 },
      ]
  if (/nopayee/i.test(file)) for (const l of lines as { payee?: string }[]) delete l.payee
  const total = lines.reduce((t, l) => t + l.amount, 0)
  const opening = card ? 120 : 1000
  return {
    account: {
      name: /noname/i.test(file) ? null : card ? "Platinum Card" : "Current Account",
      type: card ? "credit" : "bank",
      last4: /nolast4/i.test(file) ? null : card ? "9034" : "4821",
    },
    currency: "GBP",
    from: "2026-10-01",
    to: "2026-10-31",
    opening,
    closing: Math.round((card ? opening - total : opening + total) * 100) / 100,
    lines,
  }
}

const KEYWORDS: [RegExp, RegExp][] = [
  [/grocer|food|supermarket/i, /tesco|aldi|market|grocer|bakery|deli/i],
  [/eat|restaurant|dining|coffee|cafe/i, /cafe|coffee|pret|kitchen|bistro|grill|pizza|noodle/i],
  [/transport|travel/i, /uber|tfl|rail|taxi|fuel|petrol|parking/i],
  [/shop/i, /amazon|store|outfitters|boutique|hardware/i],
  [/bill|utilit/i, /energy|water|broadband|mobile/i],
  [/salary|income|wage/i, /salary|payroll/i],
]

function tidy(content: string) {
  const at = (label: string) => {
    const line = content.split("\n").find((l) => l.startsWith(`${label}: `))
    return line ? JSON.parse(line.slice(label.length + 2)) : []
  }
  const cats: { id: string; name: string; type: string }[] = at("Categories")
  const lines: { key: string; text: string; amount?: number }[] = at("Lines")
  return lines.map((l) => {
    const type = (l.amount ?? -1) > 0 ? "income" : "expense"
    const fits = cats.filter((c) => c.type === type)
    const kw = KEYWORDS.find(([, text]) => text.test(l.text))
    const cat = kw ? fits.find((c) => kw[0].test(c.name)) : undefined
    const words = l.text.replace(/\S*\d\S*/g, "").replace(/^(card payment to|direct debit)\s+/i, "")
    return {
      key: l.key,
      payee: title(words.split(/\s+/).filter(Boolean).slice(0, 2).join(" ")),
      ...(cats.length && { category: cat?.id ?? (fits.length ? pick(fits, l.key).id : null) }),
    }
  })
}

function answer(feature: string, body: any): { status: number; text?: string; error?: string } {
  const user = body.messages.find((m: any) => m.role === "user")?.content
  const text =
    typeof user === "string"
      ? user
      : user
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("\n")
  if (feature === "statement") {
    if (mode.statement === "malformed") return { status: 200, text: "Sorry, I couldn't read that statement." }
    if (mode.statement === "fail") return { status: 500, error: "The stub is overloaded" }
    const file = user.find((p: any) => p.type === "file")?.file?.filename ?? ""
    return { status: 200, text: JSON.stringify(statement(file)) }
  }
  if (feature === "tidy") {
    tidyCalls++
    if (mode.tidy === "malformed") return { status: 200, text: '{"lines": [{"key": "oops", "payee": ' }
    if (mode.tidy === "fail-2nd" && tidyCalls === 2) return { status: 500, error: "The stub is overloaded" }
    let rows = tidy(text)
    if (mode.tidy === "partial") {
      // Half the lines, one key Kosha never sent, and a category id that doesn't exist.
      rows = rows.filter((_, i) => i % 2 === 0)
      rows.push({ key: "not a key", payee: "Ghost" })
      if (rows[0]) rows[0] = { ...rows[0], category: "no-such-category" }
    }
    const json = JSON.stringify({ lines: rows })
    return { status: 200, text: mode.tidy === "fenced" ? `Here you go:\n\`\`\`json\n${json}\n\`\`\`` : json }
  }
  if (feature === "layout")
    return {
      status: 200,
      text: '{"header": 0, "date": 0, "description": [1], "amount": 2, "debit": null, "credit": null, "balance": null}',
    }
  return { status: 200, text: '{"category": null}' }
}

const featureOf = (system: string) =>
  system.startsWith("You read a bank or credit card statement")
    ? "statement"
    : system.startsWith("You turn bank statement descriptions")
      ? "tidy"
      : system.startsWith("You work out the layout")
        ? "layout"
        : "other"

createServer(async (req, res) => {
  let raw = ""
  for await (const chunk of req) raw += chunk
  const send = (status: number, value: unknown) => {
    res.writeHead(status, { "content-type": "application/json" })
    res.end(JSON.stringify(value))
  }
  const path = req.url?.split("?")[0]
  if (path === "/__log") return send(200, log)
  if (path === "/__reset") return ((log.length = 0), (tidyCalls = 0), send(200, { ok: true }))
  if (path === "/__mode") return ((mode = { ...mode, ...JSON.parse(raw || "{}") }), (tidyCalls = 0), send(200, mode))
  if (path === "/v1/models") return send(200, { data: [{ id: "stub" }] })
  if (path !== "/v1/chat/completions" || req.method !== "POST") return send(404, { error: { message: "Not found" } })
  const body = JSON.parse(raw)
  const feature = featureOf(body.messages[0]?.content ?? "")
  log.push({ at: Date.now(), feature, body })
  const r = answer(feature, body)
  console.info(`${feature} → ${r.status}`)
  if (r.error) return send(r.status, { error: { message: r.error } })
  send(200, {
    choices: [{ message: { role: "assistant", content: r.text } }],
    usage: { prompt_tokens: raw.length >> 2, completion_tokens: (r.text?.length ?? 0) >> 2 },
  })
}).listen(port, () => console.info(`AI stub on http://localhost:${port}/v1`))
