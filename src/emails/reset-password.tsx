// The password reset email. Mail apps load no web fonts and drop CSS classes, so everything is inline styles
// on react-email's table-based components, in a system font stack, light only. Preview with `npm run email`.
import { Body, Button, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text } from "react-email"

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
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light only" />
      </Head>
      <Preview>The link works once, for one hour.</Preview>
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
              Reset your password
            </Heading>
            <Text style={{ margin: "14px 0 0", fontSize: 15, lineHeight: "24px", color: subtle }}>
              Someone asked to reset the password for the Kosha account <span style={strong}>{email}</span>. If that was
              you, set a new one below. The link works once, for one hour.
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
              Set a new password
            </Button>
            <Text style={{ margin: "24px 0 8px", fontSize: 13, lineHeight: "18px", color: muted }}>
              Or paste this link into your browser:
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
              <span style={strong}>Didn't ask for this?</span> Ignore this email. Your password stays the same, and
              nobody can change it without this link.
            </Text>
            <Text style={{ margin: "6px 0 0", fontSize: 12, lineHeight: "18px", color: muted }}>
              Requested on {requestedAt}.
            </Text>
          </Section>
          <Text style={{ margin: "20px 0 0", textAlign: "center", fontSize: 12, lineHeight: "18px", color: muted }}>
            Kosha ·{" "}
            <Link href={origin} style={{ color: muted, textDecoration: "underline" }}>
              {new URL(origin).host}
            </Link>
            <br />
            You're getting this because a password reset was asked for on your account.
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
