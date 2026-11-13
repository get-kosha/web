import { createFileRoute } from "@tanstack/react-router"

// The public REST API, its OpenAPI document (/api/v1/openapi.json) and docs page (/api/v1/docs).
// Authenticated with API keys inside handleRest, so the session middleware lets it through. Loaded on first
// use, so page requests never evaluate the API.
const handler = async ({ request }: { request: Request }) => (await import("@/server/api.server")).handleRest(request)

export const Route = createFileRoute("/api/v1/$")({
  server: {
    handlers: { GET: handler, POST: handler, PATCH: handler, PUT: handler, DELETE: handler, OPTIONS: handler },
  },
})
