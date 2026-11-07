import { createFileRoute } from "@tanstack/react-router"
import { LegalPage, MAINTAINER, SOURCE } from "@/components/legal"
import { publicHead } from "@/lib/core"

// Each statement here describes what the code does today. Change it when the code changes.
export const Route = createFileRoute("/privacy")({
  head: () =>
    publicHead(
      "/privacy",
      "Privacy policy · Kosha",
      "What Kosha stores about you, what it never does with your financial data, and which services it relies on."
    ),
  component: Privacy,
})

function Privacy() {
  return (
    <LegalPage title="Privacy policy" updated="7 November 2026">
      <p>
        This policy covers the Kosha service at getkosha.app. Kosha is open source, and anyone can run their own copy. A
        copy you or someone else runs is outside this policy: whoever runs it is responsible for the data in it.
      </p>

      <h2>The short version</h2>
      <ul>
        <li>Your financial data is yours. It is not sold, rented, shared for advertising or used to train models.</li>
        <li>There are no ads, no analytics, no tracking pixels and no third-party cookies.</li>
        <li>AI features are off unless you add your own provider key, and you choose what they may see.</li>
        <li>You can export everything, or delete your account and all its data, from Settings at any time.</li>
      </ul>

      <h2>What Kosha stores</h2>
      <ul>
        <li>
          <strong>Your account:</strong> your name, email address, a hash of your password (never the password itself),
          passkeys, two-factor settings and an optional profile picture. If you sign in with Google, Kosha also keeps
          your Google account id, your Google profile picture&apos;s address and the tokens Google returns, encrypted.
        </li>
        <li>
          <strong>Your finances:</strong> everything you enter or import, such as accounts, transactions, payees,
          categories, tags, events, subscriptions, reconciliations, statement imports and attached receipts or payslips.
        </li>
        <li>
          <strong>Sign-in sessions:</strong> for each signed-in device, the IP address and browser name it signed in
          with, so you can see and end sessions. Sessions expire after 30 days without use.
        </li>
        <li>
          <strong>Security records:</strong> IP addresses are counted for a short time to limit repeated sign-in
          attempts and API requests.
        </li>
        <li>
          <strong>API keys and connected apps:</strong> keys you create and apps you connect through the MCP server.
          Keys are stored hashed.
        </li>
        <li>
          <strong>AI settings:</strong> provider keys you add, stored encrypted, and a record of each AI request's token
          counts for Settings › AI › AI usage. When Keep a request log is on, the request and reply are kept for 30
          days. Each log row is deleted after 62 days.
        </li>
      </ul>

      <h2>Why it is stored</h2>
      <p>
        Data is used only to run Kosha for you: to sign you in, keep your account secure, show your totals and run the
        features you turn on. The legal basis is the agreement to provide the service you sign up for, and the
        legitimate interest in keeping it secure and free of abuse.
      </p>

      <h2>AI features</h2>
      <p>
        AI features use a provider key you add yourself, such as Anthropic or OpenAI. When you use one, Kosha sends that
        provider only what Settings › AI › What AI can see allows, and hidden payees and account references are replaced
        with codes first. The provider handles that request under its own terms and privacy policy, which you accept
        when you create a key with them. Kosha has no AI key of its own and never sends your data to an AI provider you
        did not set up.
      </p>

      <h2>Services Kosha relies on</h2>
      <ul>
        <li>
          <strong>Cloudflare</strong> hosts the app, its database (D1) and file storage (R2), and processes every
          request, including short-lived request logs used to fix errors. Data may be processed in any country where
          Cloudflare operates.
        </li>
        <li>
          <strong>Exchange rates</strong> come from the public fawazahmed0 currency API through jsDelivr. Kosha&apos;s
          server fetches them; no data about you is sent.
        </li>
        <li>
          <strong>The API reference page</strong> loads its viewer from jsDelivr, which sees your IP address like any
          website you load files from.
        </li>
        <li>
          <strong>Google</strong>, only if you choose to sign in with it. Google tells Kosha your name, email address
          and profile picture, and learns that you signed in to Kosha.
        </li>
        <li>
          <strong>AI providers</strong> you add yourself, as described above.
        </li>
      </ul>

      <h2>Cookies and storage on your device</h2>
      <p>
        Kosha sets only the cookies it needs to keep you signed in and, if you choose, to remember a trusted device for
        two-factor sign-in. Because these are strictly necessary, there is no cookie banner. The browser also keeps a
        few preferences, such as your theme and last-used account, and entries you add while offline until they are
        sent. When installed as an app, Kosha saves pages and data on your device so it works offline. Signing out
        clears the saved pages.
      </p>

      <h2>How long data is kept</h2>
      <p>
        Your data is kept while your account exists. Deleting your account in Settings › Delete &amp; reset removes your
        financial data, profile picture and attachments straight away. Copies in the database provider&apos;s
        point-in-time recovery expire within 30 days. The shared demo account holds invented data only.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on where you live, laws such as the GDPR give you the right to access, correct, export and delete your
        data, and to object to or restrict how it is used. Most of these you can do yourself:
      </p>
      <ul>
        <li>Correct anything by editing it in the app.</li>
        <li>Export your data as CSV or JSON in Settings › Import &amp; export.</li>
        <li>Delete your account and all its data in Settings › Delete &amp; reset.</li>
        <li>End sessions and disconnect apps in Settings › Sign-in &amp; security and Settings › API &amp; MCP.</li>
      </ul>
      <p>
        For anything else, contact the maintainer (below). You can also complain to your local data protection
        authority.
      </p>

      <h2>Security</h2>
      <p>
        Traffic is encrypted with HTTPS. Passwords are hashed, AI provider keys are encrypted, and every query is scoped
        to your account. No system is perfectly secure. If you find a vulnerability, please report it privately to the
        maintainer rather than in a public issue.
      </p>

      <h2>Children</h2>
      <p>Kosha is not meant for children under 16, and does not knowingly hold their data.</p>

      <h2>Changes</h2>
      <p>
        When this policy changes, the date at the top changes too, and the full history is public in the{" "}
        <a href={SOURCE}>source repository</a>.
      </p>

      <h2>Contact</h2>
      <p>
        Kosha is run by Amruth Pillai. For privacy questions or requests, use the contact details on{" "}
        <a href={MAINTAINER}>the maintainer&apos;s GitHub profile</a>. For anything that is not private, open an issue
        on <a href={SOURCE}>GitHub</a>.
      </p>
    </LegalPage>
  )
}
