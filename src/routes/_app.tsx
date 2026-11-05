import { Outlet, createFileRoute, retainSearchParams } from "@tanstack/react-router"
import { z } from "zod"
import { getMeta } from "@/lib/api"
import { AppShell } from "@/components/shell"

// Month and display currency are app-wide: the shell's stepper and switch set them, every page reads them.
const appSearch = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  currency: z
    .string()
    .regex(/^[a-z]{3,6}$/)
    .optional(),
})

// Every signed-in page. /login sits outside it, so it never loads account data.
export const Route = createFileRoute("/_app")({
  validateSearch: appSearch,
  search: { middlewares: [retainSearchParams(["month", "currency"])] },
  loader: () => getMeta(),
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
})
