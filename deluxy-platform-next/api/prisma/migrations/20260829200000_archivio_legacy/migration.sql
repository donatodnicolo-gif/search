-- ARCHIVIO del database originale: i dati del legacy che non hanno un modello
-- proprio in piattaforma (reclami, promemoria, email, notifiche, collezioni).
CREATE TABLE IF NOT EXISTS "LegacyArchive" (
  "id" TEXT NOT NULL,
  "tabella" TEXT NOT NULL,
  "legacyId" TEXT,
  "dati" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegacyArchive_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LegacyArchive_tabella_legacyId_key" ON "LegacyArchive"("tabella", "legacyId");
CREATE INDEX IF NOT EXISTS "LegacyArchive_tabella_idx" ON "LegacyArchive"("tabella");
