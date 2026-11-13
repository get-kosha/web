import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import { appClientSql } from "./setup-app-clients.ts"

const db = new DatabaseSync(":memory:")
db.exec("PRAGMA foreign_keys = ON")
for (const file of readdirSync("migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort())
  db.exec(readFileSync(`migrations/${file}`, "utf8"))
db.exec(`INSERT INTO "oauthClient" ("id", "clientId", "redirectUris")
  VALUES ('external', 'external', '["https://external.example/callback"]')`)

for (const origin of ["https://getkosha.app", "http://localhost:3000", "https://self-hosted.example"]) {
  db.exec(appClientSql(`${origin}/`))
  const clients = db
    .prepare(`SELECT "clientId", "redirectUris", "skipConsent", "requirePKCE",
    "tokenEndpointAuthMethod" FROM "oauthClient" WHERE "clientId" != 'external' ORDER BY "clientId"`)
    .all()
  assert.deepEqual(
    clients.map((c) => ({ ...c })),
    ["kosha-android", "kosha-ios"].map((clientId) => ({
      clientId,
      redirectUris: JSON.stringify([`${origin}/app/oauth/callback`, "app.getkosha:/oauth/callback"]),
      skipConsent: 1,
      requirePKCE: 1,
      tokenEndpointAuthMethod: "none",
    }))
  )
  assert.deepEqual(
    db
      .prepare(`SELECT "clientId", "resourceId" FROM "oauthClientResource"
    WHERE "resourceId" = ? ORDER BY "clientId"`)
      .all(`${origin}/api/v1`)
      .map((r) => ({ ...r })),
    ["kosha-android", "kosha-ios"].map((clientId) => ({ clientId, resourceId: `${origin}/api/v1` }))
  )
  assert.equal(
    db.prepare(`SELECT count(*) AS n FROM "oauthClientResource" WHERE "resourceId" = ?`).get(`${origin}/mcp`)?.n,
    0
  )
  const before = db.prepare('SELECT * FROM "oauthClientResource" ORDER BY "id"').all()
  db.exec(appClientSql(origin))
  assert.deepEqual(db.prepare('SELECT * FROM "oauthClientResource" ORDER BY "id"').all(), before)
}
assert.equal(
  db.prepare(`SELECT "redirectUris" FROM "oauthClient" WHERE "clientId" = 'external'`).get()?.redirectUris,
  '["https://external.example/callback"]'
)
assert.equal(db.prepare(`SELECT count(*) AS n FROM "oauthClientResource" WHERE "clientId" = 'external'`).get()?.n, 0)
// Existing resource policy must survive provisioning.
db.exec(
  `UPDATE "oauthResource" SET "disabled" = 1, "policyVersion" = 5 WHERE "identifier" = 'https://getkosha.app/api/v1'`
)
db.exec(appClientSql("https://getkosha.app"))
assert.deepEqual(
  {
    ...db
      .prepare(
        `SELECT "disabled", "policyVersion" FROM "oauthResource" WHERE "identifier" = 'https://getkosha.app/api/v1'`
      )
      .get(),
  },
  { disabled: 1, policyVersion: 5 }
)
for (const invalid of ["", "file:///tmp", "https://example.com/path", "https://user:password@example.com"])
  assert.throws(() => appClientSql(invalid))
assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), [])
db.close()
