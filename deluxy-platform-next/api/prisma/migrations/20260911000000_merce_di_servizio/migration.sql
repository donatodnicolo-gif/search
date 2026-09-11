-- ⭐⭐ 11/09/2026 (regola utente): «prodotti con flag servizio, che saranno ad esempio i biglietti che
-- si possono assegnare per singoli stock ai vari partner: l'assegnazione fa comparire questo prodotto
-- in merce».
--
-- Il flag sul prodotto e la tabella delle assegnazioni. Tabella NUOVA: non tocca niente di esistente,
-- quindi gli indici possono nascere insieme a lei senza CONCURRENTLY.

ALTER TABLE platform."Product" ADD COLUMN IF NOT EXISTS "servizio" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS platform."PartnerProductStock" (
  "id"               text        NOT NULL,
  "partnerId"        text        NOT NULL,
  "productId"        text        NOT NULL,
  -- "" quando l'assegnazione è del prodotto intero: vedi l'avvertenza nello schema Prisma.
  "productVariantId" text        NOT NULL DEFAULT '',
  "quantity"         integer     NOT NULL DEFAULT 0,
  "note"             text,
  "userId"           text,
  "createdAt"        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerProductStock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerProductStock_partnerId_productId_productVariantId_key"
  ON platform."PartnerProductStock" ("partnerId", "productId", "productVariantId");
CREATE INDEX IF NOT EXISTS "PartnerProductStock_productId_idx"
  ON platform."PartnerProductStock" ("productId");

DO $$ BEGIN
  ALTER TABLE platform."PartnerProductStock"
    ADD CONSTRAINT "PartnerProductStock_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES platform."Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE platform."PartnerProductStock"
    ADD CONSTRAINT "PartnerProductStock_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES platform."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
