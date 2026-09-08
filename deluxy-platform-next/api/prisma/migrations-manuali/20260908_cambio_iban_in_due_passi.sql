-- ⭐ 08/09/2026 — CAMBIO DELLE COORDINATE BANCARIE IN DUE PASSI (regola utente).
--
-- Cinque colonne in aggiunta su platform."Partner": tengono la richiesta di cambio
-- IBAN/intestatario finché il partner non conferma col codice ricevuto per email.
--
-- ⚠️ SCHEMA CONDIVISO DA 14 APP. Questa migrazione è deliberatamente la più mite
-- possibile: solo ADD COLUMN, tutte nullable (o con default), tutte IF NOT EXISTS.
-- Nessuna colonna rinominata, nessun tipo cambiato, nessun indice, nessun vincolo:
-- le altre app che leggono platform."Partner" non si accorgono di niente, e rilanciarla
-- due volte non fa danno.
--
-- Si lancia PRIMA di pubblicare il codice: senza queste colonne il client Prisma
-- non riesce più a leggere il Partner e la scheda partner smette di aprirsi.

ALTER TABLE platform."Partner" ADD COLUMN IF NOT EXISTS "bankCodeHash"      TEXT;
ALTER TABLE platform."Partner" ADD COLUMN IF NOT EXISTS "bankCodeExpiresAt" TIMESTAMP(3);
ALTER TABLE platform."Partner" ADD COLUMN IF NOT EXISTS "bankCodeAttempts"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE platform."Partner" ADD COLUMN IF NOT EXISTS "bankCodeSentAt"    TIMESTAMP(3);
ALTER TABLE platform."Partner" ADD COLUMN IF NOT EXISTS "bankPending"       TEXT;

-- ⚠️ Aggiunte dopo il passaggio dall'agente ostile: senza queste, chi ha una sessione di
-- partner poteva riscriversi `Partner.email` (è nella whitelist del profilo) e poi farsi
-- mandare il codice al proprio indirizzo. Servono a sapere QUANDO il recapito è cambiato
-- e DOVE arrivava prima.
ALTER TABLE platform."Partner" ADD COLUMN IF NOT EXISTS "emailCambiataIl"   TIMESTAMP(3);
ALTER TABLE platform."Partner" ADD COLUMN IF NOT EXISTS "emailPrecedente"   TEXT;

-- Controllo: devono uscire sette righe.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'platform' AND table_name = 'Partner'
  AND column_name IN ('bankCodeHash','bankCodeExpiresAt','bankCodeAttempts','bankCodeSentAt','bankPending','emailCambiataIl','emailPrecedente')
ORDER BY column_name;
