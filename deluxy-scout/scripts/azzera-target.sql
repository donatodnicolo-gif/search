-- Azzeramento di Target: cancella SOLO i negozi mai lavorati.
--
-- Criterio (deciso con l'utente il 23/07/2026): il negozio se ne va solo se
-- **nessuna persona l'ha messo lì** (`creato_da is null` → viene dalla scoperta
-- Google o da un import) ED è `stato = 'da_visitare'` senza nessuna traccia di
-- lavoro sopra — nessuna visita, trattativa, contatto, chiamata, task,
-- richiesta di pagamento — e non è tra i preferiti (starred).
-- Restano quindi: tutto ciò che ha aggiunto un utente, i clienti, i negozi
-- visitati/persi, e qualsiasi cosa con una trattativa o anche solo un contatto.
--
-- Nota: da oggi Target mostra **solo** i negozi con `creato_da`, quindi questa
-- pulizia serve a liberare il database, non a svuotare la pagina.
--
-- ⚠️ IRREVERSIBILE, sul Supabase di produzione (ref fdsziebgkljfsugqqbqd).
-- Prima di lanciarlo: eseguire `azzera-target-conteggio.sql` e leggere i numeri.
-- Nota: i negozi cancellati vengono RIMESSI dagli import (Anagrafiche) e dalla
-- scoperta Google alla prima esecuzione — vedi scripts/README.md.
--
--   SUPABASE_PAT=sbp_... node scripts/mgmt-query.mjs scripts/azzera-target.sql

begin;

create temporary table da_cancellare on commit drop as
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
  and not exists (select 1 from richieste_pagamento r where r.place_id = p.id);

-- Le tabelle di "scarto" e i preferiti sui duplicati non sono lavoro sul
-- negozio: si cancellano insieme al negozio (sono già in cascade, questo è solo
-- per chiarezza sul conteggio finale).
select count(*) as target_cancellati from da_cancellare;

delete from places p using da_cancellare x where p.id = x.id;

select
  (select count(*) from places)                              as places_rimasti,
  (select count(*) from places where creato_da is not null)  as in_target,
  (select count(*) from places where stato = 'da_visitare')  as da_visitare_rimasti,
  (select count(*) from places where stato = 'cliente')      as clienti,
  (select count(*) from deals)                               as trattative,
  (select count(*) from visits)                              as visite;

commit;
