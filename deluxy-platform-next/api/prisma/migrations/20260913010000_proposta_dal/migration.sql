-- ⭐⭐ 13/09/2026 (regola utente): «se passa un'ora da quando è arrivata la proposta e non ha
-- accettato» la vendita passa al fornitore successivo — non solo quando rifiuta. Serve sapere quando
-- è cominciata la proposta CORRENTE.
ALTER TABLE platform."Sale" ADD COLUMN IF NOT EXISTS "propostaDal" timestamp(3);

-- ⚠️ Le proposte già aperte partono da ADESSO, non dal giorno in cui sono nate: accendere la regola
-- non deve far scattare in blocco quindici passaggi di mano che nessuno si aspetta. Da qui in avanti
-- l'ora vale per tutti allo stesso modo.
UPDATE platform."Sale" SET "propostaDal" = NOW() WHERE "status" = 'proposta' AND "propostaDal" IS NULL;

CREATE INDEX IF NOT EXISTS "Sale_status_propostaDal_idx" ON platform."Sale" ("status", "propostaDal");
