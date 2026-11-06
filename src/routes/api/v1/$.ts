import { createFileRoute } from "@tanstack/react-router"
import { handleRest } from "@/server/api.server"

// The public REST API, its OpenAPI document (/api/v1/openapi.json) and docs page (/api/v1/docs).
// Authenticated with API keys inside handleRest, so the session middleware lets it through.
const handler = ({ request }: { request: Request }) => handleRest(request)

export const Route = createFileRoute("/api/v1/$")({
  server: {
    handlers: { GET: handler, POST: handler, PATCH: handler, PUT: handler, DELETE: handler, OPTIONS: handler },
  },
})
