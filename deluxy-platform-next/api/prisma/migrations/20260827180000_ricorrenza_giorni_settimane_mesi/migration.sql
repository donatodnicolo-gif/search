-- La ricorrenza non e' piu' solo settimanale (27/08/2026).
--
-- Prima un servizio ricorrente sapeva dire soltanto «questi giorni della
-- settimana»: «ogni tre giorni» o «il 1 e il 15 di ogni mese» non erano
-- esprimibili. Si aggiungono tre colonne, tutte con un default che lascia le
-- righe esistenti esattamente com'erano (giro settimanale, ogni settimana).
--
-- IF NOT EXISTS perche' la migrazione dev'essere ripetibile senza rompere
-- niente: e' la regola di casa su questo cluster condiviso.
ALTER TABLE "RecurringService" ADD COLUMN IF NOT EXISTS "frequenza" TEXT NOT NULL DEFAULT 'SETTIMANALE';
ALTER TABLE "RecurringService" ADD COLUMN IF NOT EXISTS "ogni" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "RecurringService" ADD COLUMN IF NOT EXISTS "giorniMese" TEXT;
