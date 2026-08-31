-- Il motivo della mancata consegna (flusso valet 31/08/2026)
ALTER TABLE "platform"."Delivery" ADD COLUMN IF NOT EXISTS "notDeliveredReason" TEXT;
