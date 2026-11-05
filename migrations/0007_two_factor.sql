-- Better Auth two-factor plugin (TOTP + backup codes).
ALTER TABLE "user" ADD COLUMN "twoFactorEnabled" integer DEFAULT 0;
CREATE TABLE "twoFactor" (
  "id" text not null primary key,
  "secret" text not null,
  "backupCodes" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "verified" integer DEFAULT 1,
  "failedVerificationCount" integer DEFAULT 0,
  "lockedUntil" date
);
CREATE INDEX "twoFactor_secret_idx" ON "twoFactor" ("secret");
CREATE INDEX "twoFactor_userId_idx" ON "twoFactor" ("userId");
