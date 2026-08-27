-- Chiavi app-to-app: scadenza, note e chi le ha create (27/08/2026).
-- Una chiave data una volta valeva per sempre: una porta che nessuno chiude.
ALTER TABLE platform."AppApiKey" ADD COLUMN IF NOT EXISTS "note"     TEXT;
ALTER TABLE platform."AppApiKey" ADD COLUMN IF NOT EXISTS "scadeIl"  TIMESTAMP(3);
ALTER TABLE platform."AppApiKey" ADD COLUMN IF NOT EXISTS "creataDa" TEXT;
