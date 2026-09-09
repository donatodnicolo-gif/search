-- 09/09/2026 — IL RECUPERO DEGLI ANTICIPI AI VALET SUGLI STIPENDI
--
-- Due colonne su platform."Payment", concordate con l'utente («fai anche quello»):
--   · recuperatoImporto     quanto dell'anticipo e' gia' stato trattenuto sugli
--                           stipendi. L'anticipo e' chiuso quando raggiunge
--                           "amount". Serve il PARZIALE: un anticipo piu' grande
--                           del netto di un mese, con un semplice si'/no, non si
--                           scalerebbe mai.
--   · recuperatoSuSalaryId  l'ULTIMO stipendio che ha trattenuto qualcosa. La
--                           storia riga per riga sta nelle SalaryLine con
--                           origin = 'anticipo'.
--
-- ⚠️ ORDINE OBBLIGATORIO: PRIMA questa migrazione, POI il deploy del codice che
-- legge le colonne. Al contrario ogni query su Payment fallirebbe (P2022,
-- «column does not exist») e la pagina Pagamenti resterebbe vuota.
-- Aggiungere una colonna NULLABLE (o con default costante) e' retrocompatibile:
-- il codice gia' pubblicato continua a funzionare senza vederle.
--
-- ⚠️ Postgres CONDIVISO da 14 app: ADD COLUMN con default costante non riscrive
-- la tabella (da PG 11), quindi non prende un lock lungo. Nessun indice: le
-- letture partono sempre da valetId, che un indice ce l'ha gia'.
--
-- Ripetibile: IF NOT EXISTS su entrambe.

ALTER TABLE platform."Payment"
  ADD COLUMN IF NOT EXISTS "recuperatoImporto" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE platform."Payment"
  ADD COLUMN IF NOT EXISTS "recuperatoSuSalaryId" TEXT;

-- Verifica: devono uscire due righe.
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'platform'
  AND table_name = 'Payment'
  AND column_name IN ('recuperatoImporto', 'recuperatoSuSalaryId')
ORDER BY column_name;
