-- Deluxy Scout — 0105: l'ordine SENZA FORNITURA lo dichiara, non lo sottintende.
-- Idempotente. Applicare con: node scripts/mgmt-query.mjs supabase/migrations/0105_ordine_senza_fornitura.sql
--
-- Richiesta dell'utente (28/08/2026): «inserisci un flag "Senza Fornitura" per
-- le fatture che non hanno costi (esempio affiliazioni)».
--
-- ⚠️ Perché un flag e non «costo assente = costo zero»: un ordine senza
-- preventivi ha margine «—» DI PROPOSITO (contarlo a costo zero darebbe un
-- margine pari al prezzo pieno), e la fornitura è obbligatoria prima di
-- chiudere/incassare. Ma una quota di affiliazione non ha DAVVERO costi di
-- fornitura: senza questo flag l'unica via era inventarsi un fornitore finto.
-- Il flag è la dichiarazione esplicita: «questo ordine non ha costi di
-- fornitura» — e solo allora il margine vale il valore (meno gli altri costi).
alter table ordini add column if not exists senza_fornitura boolean not null default false;

comment on column ordini.senza_fornitura is
  'Dichiarazione esplicita: quest''ordine non ha costi di fornitura (es. quota di affiliazione). Sblocca chiusura/incasso senza fornitori e rende il margine = valore - altri costi. Se poi si registra una fornitura vera, i costi reali vincono.';
