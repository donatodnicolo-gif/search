-- Deluxy Scout — 0051: «Lead» si può DICHIARARE, non solo dedurre.
-- Idempotente. Applicare con scripts/mgmt-query.mjs (o allinea-supabase.mjs).
--
-- Fino al 28/07/2026 un negozio diventava LEAD solo se gli era stato scritto,
-- telefonato, o se ci si era andati: la regola guardava soltanto i contatti in
-- USCITA. Ma un lead può esistere **senza che gli sia stato detto niente** —
-- una richiesta arrivata dal sito, una segnalazione di un partner, un
-- nominativo raccolto a un evento. In tutti quei casi il rapporto è iniziato
-- dall'altra parte, e chiamarli «selezionati» è il contrario di quello che
-- sono (segnalato dall'utente).
--
-- ⚠️ Come `selezionato`, è un valore **di Scout**: il registro Anagrafiche non
-- lo conosce. Verso il registro viene tradotto in `prospect` — e NON in
-- `in_contatto`, che affermerebbe un contatto che potrebbe non essere mai
-- avvenuto (vedi `statoRegistroDaAffiliazione` in types/index.ts).

alter type stato_affiliazione_t add value if not exists 'lead' after 'selezionato';
