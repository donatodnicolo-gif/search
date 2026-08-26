-- SERVIZI RICORRENTI: il presidio che si ripete (ogni lunedi' 7-8 per un
-- partner). Un cron genera le consegne del giorno; alle consegne generate
-- si applicano le regole carnet del partner.
CREATE TABLE IF NOT EXISTS "RecurringService" (
  "id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "serviceTypeId" TEXT NOT NULL,
  "valetId" TEXT,
  "giorni" TEXT NOT NULL,
  "timeFrom" TEXT NOT NULL,
  "timeTo" TEXT NOT NULL,
  "pickupAddress" TEXT,
  "recipientFirstName" TEXT,
  "recipientLastName" TEXT,
  "recipientAddress" TEXT NOT NULL,
  "price" DOUBLE PRECISION,
  "valetSalary" DOUBLE PRECISION,
  "hours" DOUBLE PRECISION,
  "dataInizio" TIMESTAMP(3) NOT NULL,
  "dataFine" TIMESTAMP(3),
  "attivo" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  "ultimaGenerazione" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecurringService_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RecurringService" ADD CONSTRAINT "RecurringService_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringService" ADD CONSTRAINT "RecurringService_serviceTypeId_fkey"
  FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringService" ADD CONSTRAINT "RecurringService_valetId_fkey"
  FOREIGN KEY ("valetId") REFERENCES "Valet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "recurringServiceId" TEXT;
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_recurringServiceId_fkey"
  FOREIGN KEY ("recurringServiceId") REFERENCES "RecurringService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Delivery_recurringServiceId_idx" ON "Delivery"("recurringServiceId");
