-- Better Auth lets a rotated refresh token be sent again for a minute and answers with the same reply
-- (refreshTokenReuseInterval in src/server/auth.server.ts), so a phone that lost the reply to a refresh stays
-- signed in. Only Kosha's own apps get that window. For every other client this trigger clears it as soon as a
-- token is rotated, so a second use of the same refresh token is treated as replay and ends that sign-in.
CREATE TRIGGER "oauthRefreshToken_strict_replay" AFTER UPDATE OF "rotationReplayExpiresAt", "rotationReplayResponse"
ON "oauthRefreshToken"
WHEN NEW."clientId" NOT IN ('kosha-android', 'kosha-ios')
  AND (NEW."rotationReplayExpiresAt" IS NOT NULL OR NEW."rotationReplayResponse" IS NOT NULL)
BEGIN
  UPDATE "oauthRefreshToken" SET "rotationReplayExpiresAt" = NULL, "rotationReplayResponse" = NULL
  WHERE "id" = NEW."id";
END;
