import { createFileRoute } from "@tanstack/react-router"
import { userId } from "@/server/auth.server"
import { transactionsCsv } from "@/server/export.server"

// Settings › Import & export › Transactions. The request middleware has already checked the session.
export const Route = createFileRoute("/api/export/transactions.csv")({
  server: {
    handlers: {
      GET: async () =>
        new Response(await transactionsCsv(await userId()), {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="kosha-transactions.csv"',
            "Cache-Control": "private, no-store",
          },
        }),
    },
  },
})
