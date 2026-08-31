-- Idempotenza dell'import storico di reclami/rimborsi in Segnalazione.
ALTER TABLE platform."Segnalazione" ADD COLUMN IF NOT EXISTS "legacyRef" text;
CREATE UNIQUE INDEX IF NOT EXISTS "Segnalazione_legacyRef_key" ON platform."Segnalazione"("legacyRef");
