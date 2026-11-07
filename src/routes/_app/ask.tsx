import { Fragment, useEffect, useRef, useState, type ReactNode } from "react"
import { Link, createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router"
import {
  ArrowRightIcon,
  ArrowUpIcon,
  CaretLeftIcon,
  CheckIcon,
  NotePencilIcon,
  SpinnerGapIcon,
} from "@phosphor-icons/react/ssr"
import { z } from "zod"
import { ParaglideMessage } from "@inlang/paraglide-js-react"
import { Button } from "@/components/ui/button"
import { AiMark } from "@/components/ai"
import { useMeta } from "@/components/shell"
import { askKosha, type AskLink } from "@/lib/api"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

export const Route = createFileRoute("/_app/ask")({
  // ?q= asks straight away, from the search palette.
  validateSearch: z.object({ q: z.string().max(2000).optional().catch(undefined) }),
  // With Ask Kosha off the page doesn't exist, so Overview opens instead.
  loader: async ({ parentMatchPromise }) => {
    if (!(await parentMatchPromise).loaderData?.ai.ask) throw redirect({ to: "/" })
  },
  head: () => ({ meta: [{ title: m.ask_page_title() }] }),
  component: Ask,
})

type Msg =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; raw: string; links: AskLink[]; steps: string[] }
  | { role: "error"; text: string }

const PROVIDERS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Gemini",
  openrouter: "OpenRouter",
  ollama: "Ollama",
}

// The conversation outlives a visit to another page, until the tab closes or New chat clears it.
let kept: Msg[] = []

function Ask() {
  const meta = useMeta()
  const router = useRouter()
  const navigate = useNavigate({ from: Route.fullPath })
  const { q } = Route.useSearch()
  const [messages, setMessages] = useState<Msg[]>(() => kept)
  const [steps, setSteps] = useState<string[] | null>(null)
  const [draft, setDraft] = useState("")
  const input = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const asked = useRef<string | null>(null)
  const busy = steps !== null

  useEffect(() => {
    kept = messages
  }, [messages])
  // Focus the question box with a mouse or trackpad. On a phone that would open the keyboard over the answer.
  const focus = () => matchMedia("(pointer: fine)").matches && input.current?.focus()
  useEffect(() => void focus(), [])
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" })
  }, [messages.length, steps?.length])

  async function send(question: string) {
    const text = question.trim()
    if (!text || busy) return
    setDraft("")
    const history = [...messages, { role: "user", text } as const]
    setMessages(history)
    setSteps([])
    const seen: string[] = []
    try {
      const stream = await askKosha({
        data: {
          // What the model wrote goes back as history (with payee codes, when names are hidden), errors don't.
          messages: history
            .flatMap((m) =>
              m.role === "error" ? [] : [{ role: m.role, text: m.role === "assistant" ? m.raw : m.text }]
            )
            .slice(-24),
        },
      })
      for await (const ev of stream) {
        if (ev.type === "step") {
          seen.push(ev.label)
          setSteps([...seen])
        } else if (ev.type === "answer")
          setMessages((m) => [...m, { role: "assistant", text: ev.text, raw: ev.raw, links: ev.links, steps: seen }])
        else setMessages((m) => [...m, { role: "error", text: ev.message }])
      }
    } catch (e) {
      setMessages((list) => [...list, { role: "error", text: e instanceof Error ? e.message : m.ask_error() }])
    } finally {
      setSteps(null)
      focus()
    }
  }

  // A question carried in the URL is asked once, then dropped from the URL.
  useEffect(() => {
    if (!q || asked.current === q) return
    asked.current = q
    void navigate({ search: {}, replace: true })
    void send(q)
  }, [q])

  const leave = () => (router.history.canGoBack() ? router.history.back() : void navigate({ to: "/" }))
  const clear = () => {
    setMessages([])
    focus()
  }
  const model = meta.aiModel

  return (
    // The column fills the screen below the header, so the question box sits at the bottom even before there are answers.
    <div className="mx-auto flex w-full max-w-[760px] flex-col max-md:min-h-svh max-md:flex-1 md:min-h-[calc(100svh-10rem)]">
      {/* Phone: a bar of its own, since this page hides the app header and tab bar. */}
      <div className="sticky top-0 z-10 grid grid-cols-[44px_minmax(0,1fr)_44px] items-center border-b bg-background/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
        <Button variant="ghost" size="icon-lg" className="size-11" onClick={leave} aria-label={m.common_back()}>
          <CaretLeftIcon className="size-5" />
        </Button>
        <h1 className="text-center text-[17px] font-semibold">{m.ask_title()}</h1>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon-lg"
            className="size-11"
            onClick={clear}
            disabled={busy}
            aria-label={m.ask_new_chat()}
          >
            <NotePencilIcon className="size-5" />
          </Button>
        )}
      </div>
      <header className="flex items-end justify-between gap-3 px-8 pt-7 pb-5 max-md:hidden">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{m.ask_title()}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{m.ask_subtitle()}</p>
        </div>
        {messages.length > 0 && (
          <Button
            variant="outline"
            size="lg"
            className="gap-2 bg-card px-3 text-[13px] font-normal"
            onClick={clear}
            disabled={busy}
          >
            <NotePencilIcon /> {m.ask_new_chat()}
          </Button>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-6 px-4 pt-5 pb-4 md:px-8 md:pt-0">
        {messages.length === 0 && !busy ? (
          <Suggestions onPick={(s) => void send(s)} />
        ) : (
          messages.map((m, i) =>
            m.role === "user" ? (
              <p
                key={i}
                className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap md:text-sm"
              >
                {m.text}
              </p>
            ) : m.role === "error" ? (
              <p key={i} role="alert" className="text-sm text-destructive">
                {m.text}
              </p>
            ) : (
              <Answer key={i} msg={m} />
            )
          )
        )}
        {busy && <Working steps={steps} />}
        <div ref={end} />
      </div>

      <form
        className="sticky bottom-0 z-10 bg-background px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] md:bottom-0 md:px-8 md:pb-6"
        onSubmit={(e) => {
          e.preventDefault()
          void send(draft)
        }}
      >
        <div className="flex items-end gap-2 rounded-2xl border bg-card p-2 pl-4 transition-colors focus-within:border-ring">
          <textarea
            ref={input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void send(draft)
              }
            }}
            rows={1}
            maxLength={2000}
            aria-label={m.ask_input_label()}
            placeholder={messages.length ? m.ask_placeholder_follow_up() : m.ask_placeholder()}
            className="field-sizing-content max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground md:text-sm"
          />
          <Button
            type="submit"
            size="icon-lg"
            className="size-10 shrink-0 rounded-xl max-md:size-11"
            disabled={busy || !draft.trim()}
            aria-label={m.ask_submit()}
          >
            {busy ? <SpinnerGapIcon className="animate-spin" /> : <ArrowUpIcon />}
          </Button>
        </div>
        <p className="mt-2 px-1 text-xs text-muted-foreground">
          {model &&
            `${m.ask_answered_by({
              provider:
                model.provider === "compatible" ? m.ask_your_endpoint() : (PROVIDERS[model.provider] ?? model.provider),
              model: model.model,
            })} `}
          <ParaglideMessage
            message={m.ask_privacy}
            markup={{
              link: ({ children }) => (
                <Link
                  to="/settings/$section"
                  params={{ section: "ai" }}
                  hash="ai-privacy"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  {children}
                </Link>
              ),
            }}
          />
        </p>
      </form>
    </div>
  )
}

/** Starting questions, built from what this person tracks. */
function Suggestions({ onPick }: { onPick: (q: string) => void }) {
  const meta = useMeta()
  const top = meta.categories
    .filter((c) => !c.archived && !c.income && !c.parent_id && !["0", "transfer", "transfer_fee"].includes(c.id))
    .sort((a, b) => b.uses - a.uses)[0]
  const event = meta.events[0]
  const list = [
    // English lowercases the category mid-sentence; German keeps nouns capitalised.
    top
      ? m.ask_suggest_category({ category: getLocale() === "en" ? top.name.toLowerCase() : top.name })
      : m.ask_suggest_spent(),
    m.ask_suggest_biggest(),
    m.ask_suggest_compare(),
    event ? m.ask_suggest_event({ event: event.name }) : m.ask_suggest_subscriptions(),
  ]
  return (
    <div className="my-auto grid gap-5 py-6">
      <div className="grid justify-items-center gap-2 text-center">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-soft">
          <AiMark className="size-5" />
        </span>
        <p className="text-[15px] font-medium">{m.ask_empty_title()}</p>
        <p className="max-w-[46ch] text-[13px] text-muted-foreground">{m.ask_empty_body()}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="min-h-11 rounded-xl border bg-card px-4 py-3 text-left text-sm transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

/** The look-ups so far, the latest still spinning. */
function Working({ steps }: { steps: string[] | null }) {
  const list = steps?.length ? steps : [m.ask_thinking()]
  return (
    <div role="status" aria-live="polite" className="grid gap-1.5 text-[13px] text-muted-foreground">
      {list.map((s, i) => (
        <span key={i} className="rise-in flex items-center gap-2">
          {i === list.length - 1 ? (
            <SpinnerGapIcon aria-hidden="true" className="size-3.5 shrink-0 animate-spin text-brand" />
          ) : (
            <CheckIcon aria-hidden="true" className="size-3.5 shrink-0" />
          )}
          {s}…
        </span>
      ))}
    </div>
  )
}

function Answer({ msg }: { msg: Extract<Msg, { role: "assistant" }> }) {
  return (
    <div className="rise-in grid gap-3">
      <Prose text={msg.text} />
      {msg.links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {msg.links.map((l) => (
            <Link
              key={JSON.stringify(l.search)}
              to="/transactions"
              search={l.search}
              className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border bg-card px-3 text-[13px] text-subtle-foreground transition-colors hover:bg-muted hover:text-foreground max-md:min-h-11"
            >
              <span className="truncate">{l.label}</span>
              <ArrowRightIcon aria-hidden="true" className="size-3.5 shrink-0" />
            </Link>
          ))}
        </div>
      )}
      {msg.steps.length > 0 && (
        <details className="group text-xs text-muted-foreground">
          <summary className="w-fit cursor-pointer list-none rounded-sm transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
            {m.ask_how_found({ count: msg.steps.length })}
          </summary>
          <ul className="mt-1.5 grid gap-1 border-l pl-3">
            {msg.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

/** The little Markdown an answer uses: paragraphs, "- " and "1. " lists, and **bold**. Nothing is read as HTML. */
function Prose({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/)
  return (
    <div className="grid gap-2.5 text-[15px] leading-relaxed md:text-sm">
      {blocks.map((block, i) => {
        const lines = block
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
        const bullets = lines.every((l) => /^[-*•]\s+/.test(l))
        const numbers = lines.every((l) => /^\d+[.)]\s+/.test(l))
        if (bullets || numbers) {
          const List = numbers ? "ol" : "ul"
          return (
            <List key={i} className={cn("grid gap-1 pl-5", numbers ? "list-decimal" : "list-disc")}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^([-*•]|\d+[.)])\s+/, ""))}</li>
              ))}
            </List>
          )
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l.replace(/^#+\s+/, ""))}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    )
  )
}
