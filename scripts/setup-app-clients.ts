import { execFileSync } from "node:child_process"
import { resolve } from "node:path"

/** Deployment data depends on the configured origin, so it cannot live in a fixed SQL migration. */
export function appClientSql(origin: string) {
  const url = new URL(origin)
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin.replace(/\/+$/, ""))
    throw new Error("BETTER_AUTH_URL must be an HTTP(S) origin")
  origin = url.origin
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
  const api = quote(`${origin}/api/v1`)
  const mcp = quote(`${origin}/mcp`)
  const redirects = quote(JSON.stringify([`${origin}/app/oauth/callback`, "app.getkosha:/oauth/callback"]))
  const now = quote(new Date().toISOString())
  return `
INSERT OR IGNORE INTO "oauthResource" ("id", "identifier", "name", "dpopBoundAccessTokensRequired",
  "disabled", "policyVersion", "createdAt", "updatedAt") VALUES
  (${api}, ${api}, ${api}, 0, 0, 1, ${now}, ${now}),
  (${mcp}, ${mcp}, ${mcp}, 0, 0, 1, ${now}, ${now});
UPDATE "oauthClient" SET "redirectUris" = ${redirects}
  WHERE "clientId" IN ('kosha-android', 'kosha-ios') AND "redirectUris" IS NOT ${redirects};
INSERT OR IGNORE INTO "oauthClientResource" ("id", "clientId", "resourceId", "createdAt")
  SELECT c."clientId" || ' ' || r."identifier", c."clientId", r."identifier", ${now}
  FROM "oauthClient" c JOIN "oauthResource" r ON r."identifier" = ${api}
  WHERE c."clientId" IN ('kosha-android', 'kosha-ios');
`
}

if (import.meta.main) {
  const target = process.argv[2]
  if (process.argv.length !== 3 || (target !== "--local" && target !== "--remote"))
    throw new Error("Usage: node scripts/setup-app-clients.ts --local|--remote")
  const { unstable_readConfig, unstable_getVarsForDev } = await import("wrangler")
  const config = unstable_readConfig({ config: "wrangler.jsonc" })
  // Use Wrangler's own .dev.vars/.env precedence locally; production uses only deployed config vars.
  const origin =
    target === "--local"
      ? unstable_getVarsForDev(config.configPath, undefined, config.vars, undefined, true).BETTER_AUTH_URL?.value
      : config.vars.BETTER_AUTH_URL
  if (typeof origin !== "string") throw new Error("BETTER_AUTH_URL is required")
  execFileSync(
    process.execPath,
    [
      resolve("node_modules/wrangler/bin/wrangler.js"),
      "d1",
      "execute",
      "DB",
      "--config",
      "wrangler.jsonc",
      target,
      "--command",
      appClientSql(origin),
      "--yes",
    ],
    { stdio: "inherit" }
  )
}
