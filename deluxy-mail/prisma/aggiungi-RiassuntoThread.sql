-- Nuove tabelle: RiassuntoThread (riassunto conversazioni "per punti di vista")
-- e ContattoAI (il "PLUS AI" sui contatti → AI Inbox + quadro AI).
-- Da eseguire UNA volta nel SQL editor di Supabase (progetto della posta).
-- Idempotente: si può rilanciare senza rompere nulla.

CREATE TABLE IF NOT EXISTS "RiassuntoThread" (
  "id"            TEXT PRIMARY KEY,
  "utenteId"      TEXT NOT NULL,
  "chiave"        TEXT NOT NULL,
  "riassunto"     TEXT NOT NULL,
  "partecipanti"  INTEGER NOT NULL DEFAULT 0,
  "messaggiVisti" INTEGER NOT NULL DEFAULT 0,
  "generatoIl"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "RiassuntoThread_utenteId_chiave_key"
  ON "RiassuntoThread" ("utenteId", "chiave");

CREATE TABLE IF NOT EXISTS "ContattoAI" (
  "id"       TEXT PRIMARY KEY,
  "utenteId" TEXT NOT NULL,
  "email"    TEXT NOT NULL,
  "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ContattoAI_utenteId_email_key"
  ON "ContattoAI" ("utenteId", "email");
CREATE INDEX IF NOT EXISTS "ContattoAI_utenteId_idx"
  ON "ContattoAI" ("utenteId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RiassuntoThread_utenteId_fkey') THEN
    ALTER TABLE "RiassuntoThread" ADD CONSTRAINT "RiassuntoThread_utenteId_fkey"
      FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ContattoAI_utenteId_fkey') THEN
    ALTER TABLE "ContattoAI" ADD CONSTRAINT "ContattoAI_utenteId_fkey"
      FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
