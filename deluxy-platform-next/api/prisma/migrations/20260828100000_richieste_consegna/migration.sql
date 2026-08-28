-- RICHIESTE DI CONSEGNA dalle altre app, in forma TESTUALE (28/08/2026).
-- Una richiesta non e' una consegna: e' una domanda. Nasce «nuova» e diventa
-- una consegna solo quando una persona la accetta.
CREATE TABLE IF NOT EXISTS platform."RichiestaConsegna" (
  "id"          TEXT NOT NULL,
  "testo"       TEXT NOT NULL,
  "origine"     TEXT NOT NULL,
  "riferimento" TEXT,
  "contatto"    TEXT,
  "stato"       TEXT NOT NULL DEFAULT 'nuova',
  "deliveryId"  TEXT,
  "note"        TEXT,
  "decisaDa"    TEXT,
  "decisaIl"    TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RichiestaConsegna_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RichiestaConsegna_stato_createdAt_idx"
  ON platform."RichiestaConsegna"("stato", "createdAt");
CREATE INDEX IF NOT EXISTS "RichiestaConsegna_origine_riferimento_idx"
  ON platform."RichiestaConsegna"("origine", "riferimento");
DO $$ BEGIN
  ALTER TABLE platform."RichiestaConsegna"
    ADD CONSTRAINT "RichiestaConsegna_deliveryId_fkey"
    FOREIGN KEY ("deliveryId") REFERENCES platform."Delivery"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
