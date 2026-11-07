import { createFileRoute } from "@tanstack/react-router"
import { ParaglideMessage } from "@inlang/paraglide-js-react"
import { LICENSE, LegalPage, MAINTAINER, SOURCE, linkTo } from "@/components/legal"
import { publicHead } from "@/lib/core"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/terms")({
  head: () => publicHead("/terms", `${m.legal_terms_title()} · Kosha`, m.legal_terms_head_description()),
  component: Terms,
})

function Terms() {
  return (
    <LegalPage title={m.legal_terms_title()} updated="2026-11-07">
      <p>
        <ParaglideMessage message={m.legal_terms_intro} markup={{ privacy: linkTo("/privacy") }} />
      </p>

      <h2>{m.legal_terms_service_title()}</h2>
      <p>{m.legal_terms_service_body()}</p>

      <h2>{m.legal_terms_code_title()}</h2>
      <p>
        <ParaglideMessage message={m.legal_terms_code_body} markup={{ license: linkTo(LICENSE) }} />
      </p>

      <h2>{m.legal_terms_account_title()}</h2>
      <ul>
        <li>{m.legal_terms_account_age()}</li>
        <li>{m.legal_terms_account_one()}</li>
        <li>{m.legal_terms_account_keys()}</li>
        <li>{m.legal_terms_account_demo()}</li>
      </ul>

      <h2>{m.legal_terms_data_title()}</h2>
      <p>{m.legal_terms_data_body()}</p>

      <h2>{m.legal_terms_use_title()}</h2>
      <p>{m.legal_terms_use_intro()}</p>
      <ul>
        <li>{m.legal_terms_use_law()}</li>
        <li>{m.legal_terms_use_access()}</li>
        <li>{m.legal_terms_use_overload()}</li>
        <li>{m.legal_terms_use_resell()}</li>
      </ul>
      <p>{m.legal_terms_use_enforcement()}</p>

      <h2>{m.legal_terms_api_title()}</h2>
      <p>{m.legal_terms_api_body()}</p>

      <h2>{m.legal_terms_advice_title()}</h2>
      <p>{m.legal_terms_advice_body()}</p>

      <h2>{m.legal_terms_warranty_title()}</h2>
      <p>{m.legal_terms_warranty_body()}</p>

      <h2>{m.legal_terms_liability_title()}</h2>
      <p>{m.legal_terms_liability_body()}</p>

      <h2>{m.legal_terms_ending_title()}</h2>
      <p>{m.legal_terms_ending_body()}</p>

      <h2>{m.legal_terms_changes_title()}</h2>
      <p>
        <ParaglideMessage message={m.legal_terms_changes_body} markup={{ source: linkTo(SOURCE) }} />
      </p>

      <h2>{m.legal_contact_title()}</h2>
      <p>
        <ParaglideMessage
          message={m.legal_terms_contact_body}
          markup={{ maintainer: linkTo(MAINTAINER), github: linkTo(SOURCE) }}
        />
      </p>
    </LegalPage>
  )
}
