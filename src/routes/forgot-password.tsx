import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { ResetRequest } from "@/components/password-reset"

// "Forgot password?" on /login opens this with the email typed there.
export const Route = createFileRoute("/forgot-password")({
  validateSearch: z.object({ email: z.string().max(320).optional().catch(undefined) }),
  head: () => ({ meta: [{ title: "Reset your password · Kosha" }, { name: "robots", content: "noindex" }] }),
  component: ForgotPassword,
})

function ForgotPassword() {
  return <ResetRequest variant="forgot" email={Route.useSearch().email ?? ""} />
}
