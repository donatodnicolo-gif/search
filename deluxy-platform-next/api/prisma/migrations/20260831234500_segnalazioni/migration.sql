CREATE TABLE IF NOT EXISTS "platform"."Segnalazione" (
  "id" TEXT NOT NULL,
  "tipo" TEXT NOT NULL DEFAULT 'segnalazione',
  "partnerId" TEXT,
  "valetId" TEXT,
  "deliveryId" TEXT,
  "apertaDaUserId" TEXT,
  "apertaDaRuolo" TEXT,
  "apertaDaNome" TEXT,
  "oggetto" TEXT,
  "testo" TEXT NOT NULL,
  "stato" TEXT NOT NULL DEFAULT 'aperta',
  "risposta" TEXT,
  "chiusaIl" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Segnalazione_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Segnalazione_stato_idx" ON "platform"."Segnalazione"("stato");
CREATE INDEX IF NOT EXISTS "Segnalazione_partnerId_idx" ON "platform"."Segnalazione"("partnerId");
CREATE INDEX IF NOT EXISTS "Segnalazione_valetId_idx" ON "platform"."Segnalazione"("valetId");
