import { createFileRoute } from "@tanstack/react-router"

// Endpoints only Kosha's phone apps call. Bearer access tokens, checked inside handleApp, so the session
// middleware lets it through. Loaded on first use, so page requests never evaluate it.
const handler = async ({ request }: { request: Request }) =>
  (await import("@/server/app-api.server")).handleApp(request)

export const Route = createFileRoute("/api/app/$")({
  server: { handlers: { GET: handler, POST: handler, PATCH: handler, PUT: handler, DELETE: handler } },
})
