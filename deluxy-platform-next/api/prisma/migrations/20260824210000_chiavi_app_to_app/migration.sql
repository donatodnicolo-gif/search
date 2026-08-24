-- Chiavi API app-to-app (standard Deluxy §4.3): header x-api-key, nel database
-- vive SOLO lo SHA-256. Prima tabella del canale /api/v1/app/*, con cui Orders
-- legge lo stato delle vendite smistate (consegna e margine).
-- Idempotente (IF NOT EXISTS): applicata a mano il 24/08/2026 con db execute.
CREATE TABLE IF NOT EXISTS "AppApiKey" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "scrittura" BOOLEAN NOT NULL DEFAULT false,
    "attiva" BOOLEAN NOT NULL DEFAULT true,
    "ultimoUso" TIMESTAMP(3),
    "creataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppApiKey_nome_key" ON "AppApiKey"("nome");
CREATE UNIQUE INDEX IF NOT EXISTS "AppApiKey_hash_key" ON "AppApiKey"("hash");
