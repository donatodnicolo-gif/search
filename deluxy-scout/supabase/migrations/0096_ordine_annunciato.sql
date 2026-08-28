-- Deluxy Scout — 0096: quando l'ordine è stato ANNUNCIATO per email.
-- Idempotente. Applicare con: node scripts/mgmt-query.mjs supabase/migrations/0096_ordine_annunciato.sql
--
-- Richiesta dell'utente (28/08/2026): «quando viene creato un ordine poi manda
-- una mail a tutti gli account dell'app come quella degli ordini shopify».
--
-- ⚠️ **PERCHÉ UNA COLONNA E NON SOLO UNA CHIAMATA.** La mail parte dal client
-- dopo aver creato l'ordine: un ricaricamento, un doppio clic o un ritentativo
-- la farebbero partire due volte, e una casella che riceve due volte lo stesso
-- ordine smette di fidarsi della terza. Qui la data dell'annuncio è scritta
-- sull'ordine: se c'è, non si rimanda.
alter table ordini add column if not exists annunciato_il timestamptz;
comment on column ordini.annunciato_il is
  'Quando è partita la mail [ORDINE SCOUT] a tutti. Se valorizzata, non si rimanda.';
