-- Deluxy Scout — 0102: l'interruttore della connessione HUBSPOT.
-- Idempotente. Applicare con: node scripts/mgmt-query.mjs supabase/migrations/0102_hubspot_attivo.sql
--
-- Richiesta dell'utente (28/08/2026): «metti in impostazioni la possibilità di
-- disattivare la connessione con hubspot che presto sarà dismesso».
--
-- ⚠️ Nasce ACCESA ('si'): finché nessuno tocca l'interruttore non cambia
-- niente. La riga esiste da subito perché un'impostazione assente e
-- un'impostazione spenta non devono confondersi.
--
-- ⚠️ La scrive solo l'admin (RLS `impostazioni_write`): spegnere un canale di
-- sincronizzazione è una decisione, non una preferenza personale.
insert into impostazioni (chiave, valore)
values ('hubspot.attivo', 'si')
on conflict (chiave) do nothing;
