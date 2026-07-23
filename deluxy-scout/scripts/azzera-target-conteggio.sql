-- Prova a vuoto di `azzera-target.sql`: NON cancella niente, dice solo quanti
-- negozi verrebbero cancellati e cosa resterebbe. Da eseguire SEMPRE prima.
--
--   SUPABASE_PAT=sbp_... node scripts/mgmt-query.mjs scripts/azzera-target-conteggio.sql

with da_cancellare as (
  select p.id
  from places p
  where p.stato = 'da_visitare'
    and coalesce(p.starred, false) = false
    and not exists (select 1 from visits              v where v.place_id = p.id)
    and not exists (select 1 from deals               d where d.place_id = p.id)
    and not exists (select 1 from contacts            c where c.place_id = p.id)
    and not exists (select 1 from chiamate            k where k.place_id = p.id)
    and not exists (select 1 from tasks               t where t.place_id = p.id)
    and not exists (select 1 from richieste_pagamento r where r.place_id = p.id)
)
select
  (select count(*) from places)              as places_totali,
  (select count(*) from da_cancellare)       as da_cancellare,
  (select count(*) from places
     where stato = 'da_visitare')            as da_visitare_totali,
  (select count(*) from places
     where stato = 'da_visitare'
       and id not in (select id from da_cancellare)) as da_visitare_che_restano,
  (select count(*) from places where stato = 'cliente')   as clienti,
  (select count(*) from places where starred)             as preferiti,
  (select count(*) from places where anagrafiche_id is not null) as dal_registro_anagrafiche;
