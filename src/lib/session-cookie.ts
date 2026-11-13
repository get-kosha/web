// Its own module, away from core.ts, so the Worker's entry (src/server.ts) can check it without loading zod or
// the messages.
/**
 * Whether a request carries Better Auth's session cookie (with its __Secure- prefix on HTTPS). Without it Better
 * Auth can only answer "signed out", so signed-out pages skip loading it.
 */
export const hasSessionCookie = (cookie: string | null) =>
  !!cookie && /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/.test(cookie)
