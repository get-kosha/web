-- Public API (/api/v1) and MCP (/mcp) access.

-- Personal API keys. Only a SHA-256 hash is kept; the key is shown once, when it's made.
CREATE TABLE api_keys (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,                   -- hex SHA-256 of the whole key
  hint TEXT NOT NULL,                          -- last 4 characters, shown as "kosha_…a1B2"
  scope TEXT NOT NULL CHECK (scope IN ('read', 'write')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_used_at INTEGER,
  PRIMARY KEY (user_id, id)
);

-- Better Auth OAuth 2.1 provider (MCP clients sign in through it) and the JWT plugin that signs its tokens.
-- Generated with `npx auth generate` for jwt() and mcp(); keep in step with those plugins' schemas.
CREATE TABLE "jwks" ("id" text not null primary key, "publicKey" text not null, "privateKey" text not null, "createdAt" date not null, "expiresAt" date, "alg" text, "crv" text);
CREATE TABLE "oauthClient" ("id" text not null primary key, "clientId" text not null unique, "clientSecret" text, "clientDiscoveryId" text, "disabled" integer, "skipConsent" integer, "enableEndSession" integer, "subjectType" text, "scopes" text, "clientCredentialsScopes" text, "userId" text references "user" ("id") on delete cascade, "createdAt" date, "updatedAt" date, "name" text, "uri" text, "icon" text, "contacts" text, "tos" text, "policy" text, "softwareId" text, "softwareVersion" text, "softwareStatement" text, "redirectUris" text not null, "postLogoutRedirectUris" text, "backchannelLogoutUri" text, "backchannelLogoutSessionRequired" integer, "tokenEndpointAuthMethod" text, "applicationType" text, "jwks" text, "jwksUri" text, "grantTypes" text, "responseTypes" text, "requirePKCE" integer, "dpopBoundAccessTokens" integer, "referenceId" text, "metadata" text);
CREATE TABLE "oauthResource" ("id" text not null primary key, "identifier" text not null unique, "name" text not null, "accessTokenTtl" integer, "refreshTokenTtl" integer, "signingAlgorithm" text, "signingKeyId" text, "allowedScopes" text, "customClaims" text, "dpopBoundAccessTokensRequired" integer, "disabled" integer, "createdAt" date, "updatedAt" date, "policyVersion" integer, "metadata" text);
CREATE TABLE "oauthClientResource" ("id" text not null primary key, "clientId" text not null references "oauthClient" ("clientId") on delete cascade, "resourceId" text not null references "oauthResource" ("identifier") on delete cascade, "metadata" text, "createdAt" date);
CREATE TABLE "oauthRefreshToken" ("id" text not null primary key, "token" text not null unique, "clientId" text not null references "oauthClient" ("clientId") on delete cascade, "sessionId" text references "session" ("id") on delete set null, "userId" text not null references "user" ("id") on delete cascade, "referenceId" text, "authorizationCodeId" text, "resources" text, "requestedUserInfoClaims" text, "expiresAt" date not null, "createdAt" date not null, "revoked" date, "rotatedAt" date, "rotationReplayResponse" text, "rotationReplayExpiresAt" date, "authTime" date, "confirmation" text, "scopes" text not null);
CREATE TABLE "oauthAccessToken" ("id" text not null primary key, "token" text not null unique, "clientId" text not null references "oauthClient" ("clientId") on delete cascade, "sessionId" text references "session" ("id") on delete set null, "userId" text references "user" ("id") on delete cascade, "referenceId" text, "authorizationCodeId" text, "resources" text, "requestedUserInfoClaims" text, "refreshId" text references "oauthRefreshToken" ("id") on delete cascade, "expiresAt" date not null, "createdAt" date not null, "revoked" date, "confirmation" text, "scopes" text not null);
CREATE TABLE "oauthConsent" ("id" text not null primary key, "clientId" text not null references "oauthClient" ("clientId") on delete cascade, "userId" text references "user" ("id") on delete cascade, "referenceId" text, "resources" text, "requestedUserInfoClaims" text, "scopes" text not null, "createdAt" date not null, "updatedAt" date not null);
CREATE TABLE "oauthClientAssertion" ("id" text not null primary key, "expiresAt" date not null);
CREATE INDEX "oauthClient_userId_idx" on "oauthClient" ("userId");
CREATE INDEX "oauthClientResource_clientId_idx" on "oauthClientResource" ("clientId");
CREATE INDEX "oauthClientResource_resourceId_idx" on "oauthClientResource" ("resourceId");
CREATE INDEX "oauthRefreshToken_clientId_idx" on "oauthRefreshToken" ("clientId");
CREATE INDEX "oauthRefreshToken_sessionId_idx" on "oauthRefreshToken" ("sessionId");
CREATE INDEX "oauthRefreshToken_userId_idx" on "oauthRefreshToken" ("userId");
CREATE INDEX "oauthRefreshToken_authorizationCodeId_idx" on "oauthRefreshToken" ("authorizationCodeId");
CREATE INDEX "oauthAccessToken_clientId_idx" on "oauthAccessToken" ("clientId");
CREATE INDEX "oauthAccessToken_sessionId_idx" on "oauthAccessToken" ("sessionId");
CREATE INDEX "oauthAccessToken_userId_idx" on "oauthAccessToken" ("userId");
CREATE INDEX "oauthAccessToken_authorizationCodeId_idx" on "oauthAccessToken" ("authorizationCodeId");
CREATE INDEX "oauthAccessToken_refreshId_idx" on "oauthAccessToken" ("refreshId");
CREATE INDEX "oauthConsent_clientId_idx" on "oauthConsent" ("clientId");
CREATE INDEX "oauthConsent_userId_idx" on "oauthConsent" ("userId");
CREATE UNIQUE INDEX "oauthClientResource_clientId_resourceId_uidx" on "oauthClientResource" ("clientId", "resourceId");
