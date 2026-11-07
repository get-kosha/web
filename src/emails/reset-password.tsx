// The password reset email. Mail apps load no web fonts and drop CSS classes, so everything is inline styles
// on react-email's table-based components, in a system font stack, light only. Preview with `npm run email`.
import type { ReactNode } from "react"
// Text follows the language of the request that asked for the reset; `npm run email` has none, so it shows English.
import { ParaglideMessage } from "@inlang/paraglide-js-react"
import { Body, Button, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text } from "react-email"
import { m } from "../paraglide/messages.js"
import { getLocale } from "../paraglide/runtime.js"

export type ResetPasswordProps = {
  email: string
  url: string
  /** When it was asked for, in the account's time zone: "7 November 2026 at 10:14 CET". */
  requestedAt: string
  /** The app's public URL, for the logo and the footer link. */
  origin: string
}

const font = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
const mono = "ui-monospace, Menlo, Consolas, monospace"
// The app's light theme: foreground, subtle and muted text, border, muted ground.
const ink = "#111113"
const subtle = "#46464d"
const muted = "#6b6b73"
const border = "#e4e4e0"
const ground = "#f0f0ed"

export default function ResetPasswordEmail({ email, url, requestedAt, origin }: ResetPasswordProps) {
  const strong = { color: ink, fontWeight: 500 }
  const bold = ({ children }: { children?: ReactNode }) => <span style={strong}>{children}</span>
  return (
    <Html lang={getLocale()}>
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light only" />
      </Head>
      <Preview>{m.email_reset_preview()}</Preview>
      <Body style={{ margin: 0, padding: "40px 16px", backgroundColor: ground, fontFamily: font, color: ink }}>
        <Container style={{ maxWidth: 560 }}>
          <Section style={{ padding: 40, border: `1px solid ${border}`, borderRadius: 16, backgroundColor: "#ffffff" }}>
            <Img src={`${origin}/email-logo.png`} width="100" height="31" alt="Kosha" />
            <Heading
              as="h1"
              style={{
                margin: "24px 0 0",
                fontSize: 26,
                lineHeight: "32px",
                fontWeight: 600,
                letterSpacing: "-0.02em",
              }}
            >
              {m.email_reset_title()}
            </Heading>
            <Text style={{ margin: "14px 0 0", fontSize: 15, lineHeight: "24px", color: subtle }}>
              <ParaglideMessage message={m.email_reset_body} inputs={{ email }} markup={{ strong: bold }} />
            </Text>
            <Button
              href={url}
              style={{
                marginTop: 24,
                padding: "15px 24px",
                borderRadius: 12,
                backgroundColor: ink,
                color: "#f6f6f4",
                fontSize: 15,
                lineHeight: "18px",
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              {m.email_reset_button()}
            </Button>
            <Text style={{ margin: "24px 0 8px", fontSize: 13, lineHeight: "18px", color: muted }}>
              {m.email_reset_paste()}
            </Text>
            <Text
              style={{
                margin: 0,
                padding: "10px 12px",
                borderRadius: 10,
                backgroundColor: ground,
                fontFamily: mono,
                fontSize: 12,
                lineHeight: "18px",
                color: subtle,
                wordBreak: "break-all",
              }}
            >
              {url}
            </Text>
            <Hr style={{ margin: "24px 0", border: "none", borderTop: `1px solid ${border}` }} />
            <Text style={{ margin: 0, fontSize: 14, lineHeight: "21px", color: subtle }}>
              <ParaglideMessage message={m.email_reset_not_you} markup={{ strong: bold }} />
            </Text>
            <Text style={{ margin: "6px 0 0", fontSize: 12, lineHeight: "18px", color: muted }}>
              {m.email_reset_requested({ date: requestedAt })}
            </Text>
          </Section>
          <Text style={{ margin: "20px 0 0", textAlign: "center", fontSize: 12, lineHeight: "18px", color: muted }}>
            Kosha ·{" "}
            <Link href={origin} style={{ color: muted, textDecoration: "underline" }}>
              {new URL(origin).host}
            </Link>
            <br />
            {m.email_reset_footer()}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

ResetPasswordEmail.PreviewProps = {
  email: "ada@example.com",
  url: "https://getkosha.app/reset-password?token=example",
  requestedAt: "7 November 2026 at 10:14 CET",
  origin: "https://getkosha.app",
} satisfies ResetPasswordProps
