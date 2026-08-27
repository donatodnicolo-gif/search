-- ECCEZIONI PER GIORNO di un servizio ricorrente (27/08/2026):
-- «da lunedi' a venerdi' 7-8, sabato e domenica 8-9».
-- La fascia del servizio resta quella NORMALE; qui si dichiara solo cio' che
-- cambia in certi giorni, cosi' l'eccezione si legge per differenza.
CREATE TABLE IF NOT EXISTS platform."RecurringServiceVariant" (
  "id"                 TEXT NOT NULL,
  "recurringServiceId" TEXT NOT NULL,
  "giorni"             TEXT NOT NULL,
  "timeFrom"           TEXT NOT NULL,
  "timeTo"             TEXT NOT NULL,
  "valetId"            TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecurringServiceVariant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RecurringServiceVariant_recurringServiceId_idx"
  ON platform."RecurringServiceVariant"("recurringServiceId");

-- Cancellando il servizio ricorrente spariscono anche le sue eccezioni:
-- un'eccezione orfana non vuol dire niente.
DO $$ BEGIN
  ALTER TABLE platform."RecurringServiceVariant"
    ADD CONSTRAINT "RecurringServiceVariant_recurringServiceId_fkey"
    FOREIGN KEY ("recurringServiceId") REFERENCES platform."RecurringService"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE platform."RecurringServiceVariant"
    ADD CONSTRAINT "RecurringServiceVariant_valetId_fkey"
    FOREIGN KEY ("valetId") REFERENCES platform."Valet"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
