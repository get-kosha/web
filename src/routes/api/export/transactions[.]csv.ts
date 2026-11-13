import { createFileRoute } from "@tanstack/react-router"

// Serves the Transactions download in Settings › Import & export. The request middleware has already checked the session.
export const Route = createFileRoute("/api/export/transactions.csv")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          await (
            await import("@/server/export.server")
          ).transactionsCsv(await (await import("@/server/auth.server")).userId()),
          {
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": 'attachment; filename="kosha-transactions.csv"',
              "Cache-Control": "private, no-store",
            },
          }
        ),
    },
  },
})
