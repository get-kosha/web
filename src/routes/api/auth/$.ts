import { createFileRoute } from "@tanstack/react-router"
import { DEMO_READ_ONLY } from "@/lib/core"
import { auth, demoLocked, getUser } from "@/server/auth.server"

// Signed in as the demo account, the only changes allowed are signing out and signing in again (a phone
// app's "Try the demo" asks to sign in afresh). That keeps one visitor from changing the shared password,
// turning on two-factor, adding a passkey, signing everyone else out or approving an app for it.
const OPEN = /\/(sign-out|sign-in\/[^/]+)$/
async function post(request: Request) {
  if (!OPEN.test(new URL(request.url).pathname) && demoLocked((await getUser(request))?.id))
    return Response.json({ code: "DEMO_READ_ONLY", message: DEMO_READ_ONLY() }, { status: 403 })
  return auth.handler(request)
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => post(request),
    },
  },
})
