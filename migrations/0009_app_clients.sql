-- Kosha's own phone apps sign in through OAuth with PKCE as public clients (no secret). They are registered
-- here, so every server has them, and skip the consent screen. Their redirect is the app's own URL scheme
-- (RFC 8252). APP_CLIENTS in src/server/auth.server.ts lists the same ids.
INSERT OR IGNORE INTO "oauthClient" ("id", "clientId", "disabled", "skipConsent", "scopes", "createdAt", "updatedAt",
  "name", "uri", "redirectUris", "tokenEndpointAuthMethod", "applicationType", "grantTypes", "responseTypes", "requirePKCE")
VALUES
  ('kosha-android', 'kosha-android', 0, 1, '["openid","profile","email","offline_access","kosha:read","kosha:write"]',
    '2026-11-07T00:00:00.000Z', '2026-11-07T00:00:00.000Z', 'Kosha for Android', 'https://getkosha.app',
    '["app.getkosha:/oauth/callback"]', 'none', 'native', '["authorization_code","refresh_token"]', '["code"]', 1),
  ('kosha-ios', 'kosha-ios', 0, 1, '["openid","profile","email","offline_access","kosha:read","kosha:write"]',
    '2026-11-07T00:00:00.000Z', '2026-11-07T00:00:00.000Z', 'Kosha for iOS', 'https://getkosha.app',
    '["app.getkosha:/oauth/callback"]', 'none', 'native', '["authorization_code","refresh_token"]', '["code"]', 1);
