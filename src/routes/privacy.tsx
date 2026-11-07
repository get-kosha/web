import { createFileRoute } from "@tanstack/react-router"
import { ParaglideMessage } from "@inlang/paraglide-js-react"
import { LegalPage, MAINTAINER, SOURCE, linkTo, strong } from "@/components/legal"
import { publicHead } from "@/lib/core"
import { m } from "@/paraglide/messages"

// Each statement here describes what the code does today. Change it when the code changes.
export const Route = createFileRoute("/privacy")({
  head: () => publicHead("/privacy", `${m.legal_privacy_title()} · Kosha`, m.legal_privacy_head_description()),
  component: Privacy,
})

function Privacy() {
  return (
    <LegalPage title={m.legal_privacy_title()} updated="2026-11-07">
      <p>{m.legal_privacy_intro()}</p>

      <h2>{m.legal_privacy_short_title()}</h2>
      <ul>
        <li>{m.legal_privacy_short_yours()}</li>
        <li>{m.legal_privacy_short_no_ads()}</li>
        <li>{m.legal_privacy_short_ai()}</li>
        <li>{m.legal_privacy_short_export()}</li>
      </ul>

      <h2>{m.legal_privacy_stores_title()}</h2>
      <ul>
        <li>
          <ParaglideMessage message={m.legal_privacy_stores_account} markup={{ strong }} />
        </li>
        <li>
          <ParaglideMessage message={m.legal_privacy_stores_finances} markup={{ strong }} />
        </li>
        <li>
          <ParaglideMessage message={m.legal_privacy_stores_sessions} markup={{ strong }} />
        </li>
        <li>
          <ParaglideMessage message={m.legal_privacy_stores_security} markup={{ strong }} />
        </li>
        <li>
          <ParaglideMessage message={m.legal_privacy_stores_api} markup={{ strong }} />
        </li>
        <li>
          <ParaglideMessage message={m.legal_privacy_stores_ai} markup={{ strong }} />
        </li>
      </ul>

      <h2>{m.legal_privacy_why_title()}</h2>
      <p>{m.legal_privacy_why_body()}</p>

      <h2>{m.legal_privacy_ai_title()}</h2>
      <p>{m.legal_privacy_ai_body()}</p>

      <h2>{m.legal_privacy_services_title()}</h2>
      <ul>
        <li>
          <ParaglideMessage message={m.legal_privacy_services_cloudflare} markup={{ strong }} />
        </li>
        <li>
          <ParaglideMessage message={m.legal_privacy_services_rates} markup={{ strong }} />
        </li>
        <li>
          <ParaglideMessage message={m.legal_privacy_services_api_reference} markup={{ strong }} />
        </li>
        <li>
          <ParaglideMessage message={m.legal_privacy_services_google} markup={{ strong }} />
        </li>
        <li>
          <ParaglideMessage message={m.legal_privacy_services_email} markup={{ strong }} />
        </li>
        <li>
          <ParaglideMessage message={m.legal_privacy_services_ai} markup={{ strong }} />
        </li>
      </ul>

      <h2>{m.legal_privacy_cookies_title()}</h2>
      <p>{m.legal_privacy_cookies_body()}</p>

      <h2>{m.legal_privacy_retention_title()}</h2>
      <p>{m.legal_privacy_retention_body()}</p>

      <h2>{m.legal_privacy_rights_title()}</h2>
      <p>{m.legal_privacy_rights_body()}</p>
      <ul>
        <li>{m.legal_privacy_rights_correct()}</li>
        <li>{m.legal_privacy_rights_export()}</li>
        <li>{m.legal_privacy_rights_delete()}</li>
        <li>{m.legal_privacy_rights_sessions()}</li>
      </ul>
      <p>{m.legal_privacy_rights_other()}</p>

      <h2>{m.legal_privacy_security_title()}</h2>
      <p>{m.legal_privacy_security_body()}</p>

      <h2>{m.legal_privacy_children_title()}</h2>
      <p>{m.legal_privacy_children_body()}</p>

      <h2>{m.legal_privacy_changes_title()}</h2>
      <p>
        <ParaglideMessage message={m.legal_privacy_changes_body} markup={{ source: linkTo(SOURCE) }} />
      </p>

      <h2>{m.legal_contact_title()}</h2>
      <p>
        <ParaglideMessage
          message={m.legal_privacy_contact_body}
          markup={{ maintainer: linkTo(MAINTAINER), github: linkTo(SOURCE) }}
        />
      </p>
    </LegalPage>
  )
}
