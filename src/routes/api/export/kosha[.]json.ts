import { createFileRoute } from "@tanstack/react-router"
import { userId } from "@/server/auth.server"
import { everythingJson } from "@/server/export.server"

// Settings › Import & export › Everything. The request middleware has already checked the session.
export const Route = createFileRoute("/api/export/kosha.json")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify(await everythingJson(await userId()), null, 2), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": 'attachment; filename="kosha.json"',
            "Cache-Control": "private, no-store",
          },
        }),
    },
  },
})
