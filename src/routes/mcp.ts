import { createFileRoute } from "@tanstack/react-router"
import { handleMcp } from "@/server/api.server"

// The MCP server. Bearer tokens only (OAuth or an API key), checked inside handleMcp.
const handler = ({ request }: { request: Request }) => handleMcp(request)

export const Route = createFileRoute("/mcp")({
  server: { handlers: { GET: handler, POST: handler, DELETE: handler } },
})
