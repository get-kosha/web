import { createFileRoute } from "@tanstack/react-router"
import { handleApp } from "@/server/app-api.server"

// Endpoints only Kosha's phone apps call. Bearer access tokens, checked inside handleApp, so the session
// middleware lets it through.
const handler = ({ request }: { request: Request }) => handleApp(request)

export const Route = createFileRoute("/api/app/$")({
  server: { handlers: { GET: handler, POST: handler, PATCH: handler, PUT: handler, DELETE: handler } },
})
