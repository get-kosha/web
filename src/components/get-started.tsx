import { useRef, useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { FilesIcon, PlusIcon } from "@phosphor-icons/react/ssr"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useMeta } from "@/components/shell"
import { cn } from "@/lib/utils"

// Files dropped on the banner wait here for the import page, which takes them when it opens.
let handoff: File[] = []
export const takeFiles = () => {
  const files = handoff
  handoff = []
  return files
}

/** True until the person has any transactions besides opening balances: the time to offer a first import. */
export const useStarting = () => useMeta().wallets.every((w) => !w.entry_count)

/**
 * The first thing a new account sees: drop every bank and card statement, and Kosha sets up the accounts,
 * imports the transactions and sorts them. Accounts without statements (cash, investments) go in by hand.
 */
export function GetStarted() {
  const meta = useMeta()
  const navigate = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const open = (files: File[]) => {
    handoff = files
    void navigate({ to: "/import" })
  }
  return (
    <Card
      className={cn(
        "rise-in relative gap-5 overflow-hidden border-2 border-dashed px-8 py-9 transition-colors max-md:px-5 max-md:py-6",
        over ? "border-brand bg-brand-soft/40" : "border-border"
      )}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (e.dataTransfer.files.length) open([...e.dataTransfer.files])
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-[56ch]">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <FilesIcon className="size-6" />
          </span>
          <h2 className="mt-4 text-[22px] font-semibold tracking-[-0.02em] text-balance">
            Bring in your accounts from bank statements
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-subtle-foreground">
            Drop every statement you have, from each bank and card, as many months as you like. Kosha sets up the
            accounts, imports the transactions and sorts them by payee, and you check the result before anything is
            saved.
          </p>
          <p className="mt-2 text-[13px] text-muted-foreground">
            CSV, OFX or QFX files from your online banking{meta.ai.statements ? ", or PDF statements" : ""}.
          </p>
        </div>
        <div className="flex flex-col gap-2 max-sm:w-full">
          <Button size="lg" className="h-11 gap-2 px-5" onClick={() => input.current?.click()}>
            <FilesIcon /> Choose statements
          </Button>
          <Button
            nativeButton={false}
            render={<Link to="/welcome" />}
            variant="outline"
            size="lg"
            className="h-11 gap-2 bg-card px-5"
          >
            <PlusIcon /> Add accounts by hand
          </Button>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        multiple
        accept={`.csv,.ofx,.qfx,.txt,text/csv${meta.ai.statements ? ",.pdf,application/pdf" : ""}`}
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ""
          if (files.length) open(files)
        }}
      />
    </Card>
  )
}
