-- RICHIESTE DI PREVENTIVO dei partner (dal loro accesso): descrizione,
-- foto d'esempio (data URL compresso dal client), persone, citta' e data
-- di consegna desiderate. L'ufficio risponde qui e/o su WhatsApp.
CREATE TABLE IF NOT EXISTS "QuoteRequest" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "people" INTEGER,
  "city" TEXT,
  "requestedFor" TIMESTAMP(3),
  "photo" TEXT,
  "status" TEXT NOT NULL DEFAULT 'aperta',
  "reply" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "QuoteRequest_partnerId_idx" ON "QuoteRequest"("partnerId");
