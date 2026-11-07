import { env } from "cloudflare:workers"

// Email goes out over SMTP (worker-mailer speaks it over Cloudflare's TCP sockets). Set SMTP_HOST, SMTP_USER and
// SMTP_PASSWORD as secrets; SMTP_PORT defaults to 587 (STARTTLS, or 465 for TLS) and SMTP_FROM to noreply@getkosha.app.
const smtp = env as {
  SMTP_HOST?: string
  SMTP_PORT?: string
  SMTP_USER?: string
  SMTP_PASSWORD?: string
  SMTP_FROM?: string
}

/** Whether this deployment can send email. In local dev without SMTP, emails go to the console instead. */
export const canEmail = !!smtp.SMTP_HOST || import.meta.env.DEV

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string
  subject: string
  html: string
  text: string
}) {
  if (!smtp.SMTP_HOST) {
    // The text part carries any link, so a reset can be tested end to end from the dev server's log.
    if (import.meta.env.DEV) console.info(`\n[email] To: ${to}\nSubject: ${subject}\n\n${text}\n`)
    else console.error(`Email isn't set up (SMTP_HOST is missing), so "${subject}" wasn't sent.`)
    return
  }
  const { WorkerMailer } = await import("worker-mailer")
  const port = Number(smtp.SMTP_PORT || 587)
  const mailer = await WorkerMailer.connect({
    host: smtp.SMTP_HOST,
    port,
    secure: port === 465,
    credentials: smtp.SMTP_USER ? { username: smtp.SMTP_USER, password: smtp.SMTP_PASSWORD ?? "" } : undefined,
    authType: ["plain", "login"],
  })
  try {
    await mailer.send({
      from: { name: "Kosha", email: smtp.SMTP_FROM || "noreply@getkosha.app" },
      to,
      subject,
      html,
      text,
    })
  } finally {
    await mailer.close()
  }
}
