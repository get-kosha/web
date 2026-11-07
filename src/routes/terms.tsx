import { createFileRoute } from "@tanstack/react-router"
import { LegalPage, MAINTAINER, SOURCE } from "@/components/legal"

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of service · Kosha" }] }),
  component: Terms,
})

function Terms() {
  return (
    <LegalPage title="Terms of service" updated="7 November 2026">
      <p>
        These terms cover your use of the Kosha service at getkosha.app, run by Amruth Pillai. By creating an account or
        using the service, you agree to them and to the <a href="/privacy">privacy policy</a>. If you do not agree,
        please do not use the service.
      </p>

      <h2>The service</h2>
      <p>
        Kosha is a free personal finance tracker. It records what you enter or import; it does not connect to your bank,
        move money or make payments. The service may change, gain or lose features, or pause for maintenance. If it is
        ever shut down, there will be reasonable notice so you can export your data.
      </p>

      <h2>The code is separate</h2>
      <p>
        Kosha&apos;s source code is published under the <a href={`${SOURCE}/blob/main/LICENSE`}>MIT licence</a>. These
        terms cover the hosted service only. If you run your own copy, the licence applies and these terms do not.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must be at least 16 and able to agree to these terms where you live.</li>
        <li>One account per person. Give a real email address and keep it up to date.</li>
        <li>
          Keep your password, passkeys, backup codes and API keys safe. You are responsible for what happens in your
          account and through the keys and apps you connect to it.
        </li>
        <li>The shared demo account is read-only and holds invented data. Do not put real information in it.</li>
      </ul>

      <h2>Your data</h2>
      <p>
        What you put into Kosha stays yours. You allow Kosha to store and process it only to run the service for you.
        You can export it or delete it at any time from Settings. Keep your own exports if the data matters to you: the
        service is run with care, but backups are not guaranteed.
      </p>

      <h2>Acceptable use</h2>
      <p>Do not:</p>
      <ul>
        <li>break the law, or upload content you have no right to store;</li>
        <li>try to reach another person&apos;s data, or probe, scan or attack the service;</li>
        <li>overload the service, get around its rate limits, or use it to host files unrelated to your finances;</li>
        <li>resell the service, or use it to run finances on behalf of others as a business.</li>
      </ul>
      <p>Accounts that break these rules may be suspended or deleted, with notice where reasonable.</p>

      <h2>API, MCP and AI</h2>
      <p>
        The REST API and MCP server are part of the service and fall under these terms, including their rate limits. AI
        features use a provider key you add yourself. Your use of that provider, and any cost it charges, is between you
        and the provider under its terms. AI answers can be wrong; check them before you rely on them.
      </p>

      <h2>Not financial advice</h2>
      <p>
        Kosha shows your own records back to you. Nothing in it is financial, tax, investment or legal advice. Exchange
        rates are daily reference rates, not the rates your bank charges, and totals are only as accurate as the data
        you enter. Check anything important against your bank&apos;s statements.
      </p>

      <h2>No warranty</h2>
      <p>
        The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind,
        express or implied, including fitness for a particular purpose, accuracy or uninterrupted availability.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent the law allows, the operator of Kosha is not liable for any indirect, incidental or
        consequential loss, or for loss of data, profits or savings, arising from your use of the service. Because the
        service is free, total liability for any claim is limited to zero, or the lowest amount the law allows. Nothing
        here limits liability that cannot be limited by law, such as for intent or gross negligence, or your rights as a
        consumer.
      </p>

      <h2>Ending your use</h2>
      <p>
        You can stop at any time by deleting your account in Settings › Delete &amp; reset. The service may end an
        account that breaks these terms. Sections that by their nature should last, such as the warranty and liability
        sections, continue after an account ends.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        When these terms change, the date at the top changes too, and the full history is public in the{" "}
        <a href={SOURCE}>source repository</a>. Using the service after a change means you accept the new terms.
      </p>

      <h2>Contact</h2>
      <p>
        For questions about these terms, use the contact details on{" "}
        <a href={MAINTAINER}>the maintainer&apos;s GitHub profile</a>, or open an issue on <a href={SOURCE}>GitHub</a>.
      </p>
    </LegalPage>
  )
}
