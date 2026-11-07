-- Kosha's apps may send a rotated refresh token again (a reply lost on a flaky network, then a retry once the
-- phone is back online) and get the same reply, for up to a week (refreshTokenReuseInterval in auth.server.ts).
-- The window closes as soon as the token that replaced it is used: from then on the phone clearly has the new
-- one, so the old one is replay again. 0010 keeps every other client strict.
CREATE TRIGGER "oauthRefreshToken_app_overlap" AFTER UPDATE OF "rotatedAt" ON "oauthRefreshToken"
WHEN NEW."rotatedAt" IS NOT NULL AND NEW."clientId" IN ('kosha-android', 'kosha-ios')
BEGIN
  UPDATE "oauthRefreshToken" SET "rotationReplayExpiresAt" = NULL, "rotationReplayResponse" = NULL
  WHERE "userId" = NEW."userId" AND "clientId" = NEW."clientId" AND "authorizationCodeId" IS NEW."authorizationCodeId"
    AND "id" <> NEW."id" AND "rotationReplayExpiresAt" IS NOT NULL;
END;
