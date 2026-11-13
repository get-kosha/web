import { createFileRoute } from "@tanstack/react-router"

// The MCP server. Bearer tokens only (OAuth or an API key), checked inside handleMcp. Loaded on first use, so
// page requests never evaluate the API.
const handler = async ({ request }: { request: Request }) => (await import("@/server/api.server")).handleMcp(request)

export const Route = createFileRoute("/mcp")({
  server: { handlers: { GET: handler, POST: handler, DELETE: handler } },
})
