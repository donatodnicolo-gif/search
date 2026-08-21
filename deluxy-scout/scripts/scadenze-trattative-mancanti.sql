-- Deluxy Scout — dà una scadenza alle trattative aperte che non ne hanno.
--
-- PERCHÉ. La Home ha la sezione «Trattative da muovere», che mostra le
-- trattative con `scadenza <= oggi`. Il 21/08/2026, sui dati veri, **tutte e 37
-- le trattative aperte avevano `scadenza` NULL**: quella sezione era quindi
-- sempre vuota, e i negozi in pipeline ricomparivano in «Telefono — chi chiamo
-- oggi» come richiami in ritardo di un mese, che è la segnalazione da cui è
-- nato tutto. La cadenza «senza scadenza → +7 giorni» esiste in `inserisciDeal`
-- ma queste trattative sono nate prima, o da import, e non ci sono passate.
--
-- COSA FA. Le distribuisce sui prossimi 7 giorni (oggi compreso), **le più
-- trascurate per prime**: la staleness è l'ultima visita al negozio, e se non
-- c'è la data di creazione della trattativa. Tutte lo stesso giorno sarebbe
-- peggio: o non si vede niente per una settimana, o arrivano 37 righe insieme
-- in un ordine che non vuol dire nulla.
--
-- SICUREZZA. Tocca **solo** le righe con `scadenza is null` e aperte: chi una
-- data ce l'ha già non viene spostato. Su `deals` non ci sono trigger
-- (verificato). Rilanciarla non fa danni: dopo il primo giro non c'è più niente
-- da aggiornare.
--
-- COME SI LANCIA (dalla cartella deluxy-scout):
--   SUPABASE_PAT=sbp_... node scripts/mgmt-query.mjs scripts/scadenze-trattative-mancanti.sql
--
-- COME SI TORNA INDIETRO: la query restituisce gli id che ha toccato. Per
-- annullare, rimetterli a NULL:
--   update deals set scadenza = null where id in ( … gli id restituiti … );

with base as (
  select
    d.id,
    coalesce(
      (select max(v.data) from visits v where v.place_id = d.place_id),
      d.created_at,
      now() - interval '90 days'
    ) as ultima_attivita
  from deals d
  where d.fase not in ('closedwon', 'closedlost')
    and d.scadenza is null
),
ordinate as (
  select id, ntile(7) over (order by ultima_attivita asc) as giorno
  from base
)
update deals
   set scadenza = (now()::date + (o.giorno - 1))
  from ordinate o
 where deals.id = o.id
returning deals.id, deals.place_id, deals.fase, deals.scadenza;
