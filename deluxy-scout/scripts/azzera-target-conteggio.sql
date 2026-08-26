-- Prova a vuoto di `azzera-target.sql`: NON cancella niente, dice solo quanti
-- negozi verrebbero cancellati e cosa resterebbe. Da eseguire SEMPRE prima.
--
--   SUPABASE_PAT=sbp_... node scripts/mgmt-query.mjs scripts/azzera-target-conteggio.sql
--
-- ⚠️ IL PREDICATO DEV'ESSERE IDENTICO a quello di `azzera-target.sql`: è una
-- copia, e finché resta una copia va cambiata insieme all'altra. Se i due
-- divergono, questa prova conferma un numero che non è quello che verrà
-- cancellato — cioè dà il via libera alla cosa sbagliata.
--
-- ⚠️ E dice anche quanto LAVORO andrebbe perso: contare solo i negozi non è
-- una misura del danno. Le righe di `contatti_avviati`, `sequenza_iscrizioni`,
-- `sequenza_invii` e `bozze_visita` muoiono in cascata insieme al negozio, e
-- prima non comparivano da nessuna parte: la prova a vuoto era muta proprio su
-- ciò che si rischiava di distruggere.

with da_cancellare as (
  select p.id
  from places p
  where p.creato_da is null
    and p.stato = 'da_visitare'
    and coalesce(p.starred, false) = false
    and not exists (select 1 from visits              v where v.place_id = p.id)
    and not exists (select 1 from deals               d where d.place_id = p.id)
    and not exists (select 1 from contacts            c where c.place_id = p.id)
    and not exists (select 1 from chiamate            k where k.place_id = p.id)
    and not exists (select 1 from tasks               t where t.place_id = p.id)
    and not exists (select 1 from richieste_pagamento r where r.place_id = p.id)
    and not exists (select 1 from contatti_avviati    a where a.place_id = p.id)
    and not exists (select 1 from sequenza_iscrizioni s where s.place_id = p.id)
    and not exists (select 1 from bozze_visita        b where b.place_id = p.id)
    and p.livello_rapporto is null
    and p.visita_pianificata is null
    and coalesce(p.hubspot_ha_contatto, false) = false
)
select
  (select count(*) from places)              as places_totali,
  (select count(*) from places
     where creato_da is not null)            as aggiunti_da_una_persona, -- = quelli che si vedono in Target
  (select count(*) from da_cancellare)       as da_cancellare,
  (select count(*) from places
     where stato = 'da_visitare')            as da_visitare_totali,
  (select count(*) from places
     where stato = 'da_visitare'
       and id not in (select id from da_cancellare)) as da_visitare_che_restano,
  (select count(*) from places where stato = 'cliente')   as clienti,
  (select count(*) from places where starred)             as preferiti,
  (select count(*) from places where anagrafiche_id is not null) as dal_registro_anagrafiche,
  -- Il lavoro che il vecchio predicato avrebbe portato via senza dirlo. Con il
  -- predicato corretto questi numeri devono essere ZERO: se non lo sono, la
  -- copia del predicato è tornata a divergere.
  (select count(*) from contatti_avviati    where place_id in (select id from da_cancellare)) as contatti_avviati_persi,
  (select count(*) from sequenza_iscrizioni where place_id in (select id from da_cancellare)) as iscrizioni_perse,
  (select count(*) from bozze_visita        where place_id in (select id from da_cancellare)) as bozze_perse;
