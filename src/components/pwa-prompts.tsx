import { useEffect, useState, type ReactNode } from "react"
import { useRouter } from "@tanstack/react-router"
import { ArrowClockwiseIcon, DownloadSimpleIcon, ExportIcon, WifiSlashIcon, XIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { OUTBOX_EVENT, queued, sendQueued } from "@/lib/offline"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

const DISMISSED_KEY = "kosha:install-dismissed"
const REMIND_AFTER = 30 * 86_400_000

/**
 * Registers the service worker and shows the cards above the tab bar: offline status, a new version,
 * and installing the app. It also sends entries that were added offline once the connection is back.
 */
/** `away` hides the cards on a page with its own bottom bar; they show again on the next page. */
export function PwaPrompts({ uid, bare, away }: { uid: string; bare: boolean; away?: boolean }) {
  const router = useRouter()
  const [update, setUpdate] = useState<ServiceWorker | null>(null)
  const [install, setInstall] = useState<InstallEvent | "ios" | null>(null)
  const [online, setOnline] = useState(true)
  const [waiting, setWaiting] = useState(0)

  useEffect(() => {
    // In dev, a worker would serve stale modules between edits.
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return
    let reg: ServiceWorkerRegistration | undefined
    // With no controller this is the first install, not an update.
    const offer = (w: ServiceWorker | null) => w && navigator.serviceWorker.controller && setUpdate(w)
    navigator.serviceWorker
      .register("/sw.js")
      .then((r) => {
        reg = r
        offer(r.waiting)
        r.addEventListener("updatefound", () => {
          const w = r.installing
          w?.addEventListener("statechange", () => w.state === "installed" && offer(w))
        })
      })
      .catch(() => {})
    // An installed app can stay open for days, so look for a new deploy whenever it comes back to the front.
    const check = () => document.visibilityState === "visible" && reg?.update().catch(() => {})
    document.addEventListener("visibilitychange", check)
    const timer = setInterval(check, 3_600_000)
    return () => {
      document.removeEventListener("visibilitychange", check)
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const standalone =
      matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone
    let dismissed = 0
    try {
      dismissed = Number(localStorage.getItem(DISMISSED_KEY))
    } catch {}
    if (standalone || Date.now() - dismissed < REMIND_AFTER) return
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstall(e as InstallEvent)
    }
    const onInstalled = () => setInstall(null)
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    // ponytail: iPhone only. Safari has no install event, so this explains the Share menu; iPads go unprompted.
    if (/iphone|ipod/i.test(navigator.userAgent)) setInstall("ios")
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  useEffect(() => {
    const count = () => setWaiting(queued(uid).length)
    const sync = async () => {
      setOnline(navigator.onLine)
      if (navigator.onLine && queued(uid).length) {
        const { sent, rejected } = await sendQueued(uid)
        if (sent) {
          toast.success(m.pwa_synced({ count: sent }))
          await router.invalidate()
        }
        for (const reason of rejected) toast.error(m.pwa_rejected({ reason }))
      }
      count()
    }
    void sync()
    window.addEventListener("online", sync)
    window.addEventListener("offline", sync)
    window.addEventListener(OUTBOX_EVENT, count)
    return () => {
      window.removeEventListener("online", sync)
      window.removeEventListener("offline", sync)
      window.removeEventListener(OUTBOX_EVENT, count)
    }
  }, [uid, router])

  function dismissInstall() {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()))
    } catch {}
    setInstall(null)
  }

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4",
        // Above the phone tab bar. /add and Settings are full-screen on phones, so the cards wait for another page.
        bare ? "max-md:hidden" : "max-md:bottom-[calc(4.75rem+env(safe-area-inset-bottom))]",
        away && "hidden"
      )}
    >
      {(!online || waiting > 0) && (
        <Prompt
          role="status"
          icon={<WifiSlashIcon />}
          title={online ? m.pwa_syncing_title({ count: waiting }) : m.common_offline_title()}
          body={
            online ? m.pwa_syncing_body() : waiting ? m.pwa_offline_waiting({ count: waiting }) : m.pwa_offline_body()
          }
        />
      )}
      {update && (
        <Prompt
          icon={<ArrowClockwiseIcon />}
          title={m.pwa_update_title()}
          body={m.pwa_update_body()}
          onClose={() => setUpdate(null)}
        >
          <Button
            size="sm"
            onClick={() => {
              navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), {
                once: true,
              })
              update.postMessage("skip-waiting")
            }}
          >
            {m.pwa_reload()}
          </Button>
        </Prompt>
      )}
      {install && !update && (
        <Prompt
          icon={install === "ios" ? <ExportIcon /> : <DownloadSimpleIcon />}
          title={m.pwa_install_title()}
          body={install === "ios" ? m.pwa_install_ios() : m.pwa_install_body()}
          onClose={dismissInstall}
        >
          {install !== "ios" && (
            <Button
              size="sm"
              onClick={async () => {
                await install.prompt()
                const { outcome } = await install.userChoice
                if (outcome === "dismissed") dismissInstall()
                else setInstall(null)
              }}
            >
              {m.pwa_install()}
            </Button>
          )}
        </Prompt>
      )}
    </div>
  )
}

function Prompt({
  icon,
  title,
  body,
  role = "dialog",
  onClose,
  children,
}: {
  icon: ReactNode
  title: string
  body: string
  role?: "dialog" | "status"
  onClose?: () => void
  children?: ReactNode
}) {
  return (
    <div
      role={role}
      aria-label={title}
      className="pointer-events-auto flex w-full max-w-md animate-in items-center gap-3 rounded-xl border bg-popover py-3 pr-2 pl-4 text-popover-foreground shadow-lg duration-300 fade-in slide-in-from-bottom-4 motion-reduce:animate-none [&>svg]:size-5 [&>svg]:shrink-0 [&>svg]:text-muted-foreground"
    >
      {icon}
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">{body}</p>
      </div>
      {children}
      {onClose && (
        <Button variant="ghost" size="icon-sm" aria-label={m.pwa_dismiss()} onClick={onClose}>
          <XIcon />
        </Button>
      )}
    </div>
  )
}
