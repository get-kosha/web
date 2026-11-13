import { createFileRoute } from "@tanstack/react-router"

// Serves the Everything download in Settings › Import & export. The request middleware has already checked the session.
export const Route = createFileRoute("/api/export/kosha.json")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          JSON.stringify(
            await (
              await import("@/server/export.server")
            ).everythingJson(await (await import("@/server/auth.server")).userId()),
            null,
            2
          ),
          {
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Content-Disposition": 'attachment; filename="kosha.json"',
              "Cache-Control": "private, no-store",
            },
          }
        ),
    },
  },
})
