// Read by both the Vite plugin (dev and build) and `npm run i18n` (tests, typecheck, knip).
// The cookie holds a choice made on the landing page, a sign-in page or in Settings. Without one, the
// browser's languages decide (Accept-Language on the server), then English.
export default {
  outdir: "./src/paraglide",
  strategy: ["cookie", "preferredLanguage", "baseLocale"],
  cookieName: "kosha-locale",
  emitReadme: false,
}
