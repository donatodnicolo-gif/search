-- ⭐⭐ 13/09/2026 (regola utente, dopo il caso Clivati): il registro degli arrivi dal plugin
-- WooCommerce dei partner. Serve a rispondere in dieci secondi a «ci è arrivato l'ordine?», anche
-- quando la risposta è «hanno chiamato e li abbiamo respinti».
--
-- Tabella NUOVA: non tocca niente di esistente, quindi gli indici nascono con lei.

CREATE TABLE IF NOT EXISTS platform."ArrivoWoo" (
  "id"         text         NOT NULL,
  "quando"     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "esito"      text         NOT NULL,
  "partnerId"  text,
  "insegna"    text,
  "chiaveFine" text,
  "ordine"     text,
  "sito"       text,
  "consegna"   integer,
  "motivo"     text,
  CONSTRAINT "ArrivoWoo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ArrivoWoo_quando_idx" ON platform."ArrivoWoo" ("quando");
CREATE INDEX IF NOT EXISTS "ArrivoWoo_esito_quando_idx" ON platform."ArrivoWoo" ("esito", "quando");
