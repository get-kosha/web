import { createFileRoute } from "@tanstack/react-router"
import { ParaglideMessage } from "@inlang/paraglide-js-react"
import { LegalPage, SUPPORT, linkTo, strong } from "@/components/legal"
import { publicHead } from "@/lib/core"
import { m } from "@/paraglide/messages"

// Public, because Google Play links here from the store listing and checks it signed out.
// Each statement describes what deleteUserData in auth.server.ts does today. Change it when that changes.
export const Route = createFileRoute("/delete-account")({
  head: () => publicHead("/delete-account", `${m.legal_delete_title()} · Kosha`, m.legal_delete_head_description()),
  component: DeleteAccount,
})

function DeleteAccount() {
  const email = linkTo(`mailto:${SUPPORT}`)
  return (
    <LegalPage title={m.legal_delete_title()} updated="2026-11-08">
      <p>{m.legal_delete_intro()}</p>

      <h2>{m.legal_delete_steps_title()}</h2>
      <ol>
        <li>
          <ParaglideMessage message={m.legal_delete_step_sign_in} markup={{ app: linkTo("/login") }} />
        </li>
        <li>
          <ParaglideMessage message={m.legal_delete_step_open} markup={{ settings: linkTo("/settings/delete") }} />
        </li>
        <li>{m.legal_delete_step_confirm()}</li>
      </ol>
      <p>
        <ParaglideMessage message={m.legal_delete_no_sign_in} inputs={{ email: SUPPORT }} markup={{ email }} />
      </p>

      <h2>{m.legal_delete_deleted_title()}</h2>
      <ul>
        <li>
          <ParaglideMessage message={m.legal_delete_deleted_profile} markup={{ strong }} />
        </li>
        <li>
          <ParaglideMessage message={m.legal_delete_deleted_finances} markup={{ strong }} />
        </li>
        <li>
          <ParaglideMessage message={m.legal_delete_deleted_access} markup={{ strong }} />
        </li>
      </ul>

      <h2>{m.legal_delete_kept_title()}</h2>
      <ul>
        <li>{m.legal_delete_kept_backups()}</li>
        <li>{m.legal_delete_kept_logs()}</li>
        <li>
          <ParaglideMessage message={m.legal_delete_kept_better_auth} inputs={{ email: SUPPORT }} markup={{ email }} />
        </li>
      </ul>
      <p>{m.legal_delete_kept_nothing_else()}</p>
    </LegalPage>
  )
}
