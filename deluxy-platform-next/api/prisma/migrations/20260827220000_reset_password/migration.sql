-- RESET PASSWORD (27/08/2026): token monouso a scadenza breve.
-- In colonna sta l'IMPRONTA sha256 del token, non il token: chi legge il
-- database non deve poter entrare nell'account di nessuno.
ALTER TABLE platform."User" ADD COLUMN IF NOT EXISTS "resetTokenHash"      TEXT;
ALTER TABLE platform."User" ADD COLUMN IF NOT EXISTS "resetTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE platform."User" ADD COLUMN IF NOT EXISTS "resetRequestedAt"    TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "User_resetTokenHash_key" ON platform."User"("resetTokenHash");
