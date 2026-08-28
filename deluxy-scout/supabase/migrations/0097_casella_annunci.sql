-- Deluxy Scout — 0097: da quale casella partono gli ANNUNCI degli ordini.
-- Idempotente. Applicare con: node scripts/mgmt-query.mjs supabase/migrations/0097_casella_annunci.sql
--
-- Richiesta dell'utente (28/08/2026): «si manda pure da commerciale@deluxy.it».
--
-- ⭐ **PERCHÉ UN'IMPOSTAZIONE E NON UNA COSTANTE NEL CODICE.** L'annuncio di un
-- ordine non è una mail personale: è la voce dell'azienda, e deve partire dallo
-- stesso indirizzo qualunque sia il commerciale che ha chiuso. Se un giorno la
-- casella cambia, si cambia qui — non si ripubblica una funzione.
--
-- ⚠️ Le CREDENZIALI non stanno qui: qui c'è solo l'indirizzo. La password vive
-- cifrata in `smtp_account` e si decifra dentro la Edge Function.
insert into impostazioni (chiave, valore)
values ('mail.casella_annunci', 'commerciale@deluxy.it')
on conflict (chiave) do nothing;
