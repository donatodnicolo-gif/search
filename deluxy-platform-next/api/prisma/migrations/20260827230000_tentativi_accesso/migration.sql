-- Tentativi di accesso falliti, per fermare la forza bruta sul login.
CREATE TABLE IF NOT EXISTS platform."TentativoAccesso" (
  "id"     TEXT NOT NULL,
  "chiave" TEXT NOT NULL,
  "ip"     TEXT,
  "quando" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TentativoAccesso_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TentativoAccesso_chiave_quando_idx"
  ON platform."TentativoAccesso"("chiave", "quando");
