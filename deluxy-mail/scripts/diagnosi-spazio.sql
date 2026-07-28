-- DIAGNOSI SPAZIO — da incollare nel SQL Editor di Supabase.
--
-- Sono tutte SELECT: funziona anche a database in SOLA LETTURA (che è
-- esattamente la situazione in cui serve).
--
-- ⚠️ PERCHÉ GUARDARE PRIMA DI SPOSTARE. Su Postgres «disco pieno» non vuol dire
-- «tanti dati». Cancellando righe lo spazio NON si libera: le righe morte
-- restano nel file finché non passa un VACUUM, e per i campi lunghi (i corpi
-- delle mail stanno in tabelle TOAST separate) il gonfiore può essere enorme.
-- Se il problema è questo, spostare tutto in un progetto nuovo sposta anche il
-- gonfiore — e fra un mese si è di nuovo fermi.
--
-- Le tre domande, in ordine:
--   1. quanto pesa ogni tabella, e quanto di quel peso sono INDICI o TOAST;
--   2. quante righe morte ci sono e da quando non passa un VACUUM;
--   3. quanto pesano davvero i corpi delle mail (è il candidato numero uno).

-- 1) LE TABELLE PIÙ GROSSE, con dentro/fuori indici e TOAST -------------------
select
  c.relname                                              as tabella,
  pg_size_pretty(pg_total_relation_size(c.oid))          as totale,
  pg_size_pretty(pg_table_size(c.oid))                   as dati_piu_toast,
  pg_size_pretty(pg_indexes_size(c.oid))                 as indici,
  pg_size_pretty(
    coalesce(pg_total_relation_size(c.reltoastrelid), 0) --  i campi lunghi
  )                                                      as toast,
  c.reltuples::bigint                                    as righe_stimate
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc
limit 20;

-- 2) RIGHE MORTE E ULTIMO VACUUM ----------------------------------------------
-- `n_dead_tup` alto = spazio occupato da righe cancellate/aggiornate che
-- nessuno ha ancora recuperato. Se è dello stesso ordine di `n_live_tup`, il
-- problema è il gonfiore, non i dati.
select
  relname                                   as tabella,
  n_live_tup                                as righe_vive,
  n_dead_tup                                as righe_morte,
  case when n_live_tup > 0
       then round(100.0 * n_dead_tup / n_live_tup, 1)
  end                                       as morte_su_100_vive,
  last_vacuum, last_autovacuum
from pg_stat_user_tables
order by n_dead_tup desc
limit 20;

-- 3) QUANTO PESANO I CORPI DELLE MAIL -----------------------------------------
-- In AI Mail ogni messaggio porta testo, HTML ed eventuale traduzione: è quasi
-- sempre qui che se ne va il disco. Se `html` è la voce grossa, si può
-- svuotarlo sulle mail vecchie senza perdere niente di importante — il testo
-- resta, e l'originale sta comunque sul server IMAP.
select
  count(*)                                                        as messaggi,
  pg_size_pretty(sum(octet_length(coalesce("corpoTesto", '')))::bigint)    as testo,
  pg_size_pretty(sum(octet_length(coalesce("corpoHtml", '')))::bigint)     as html,
  pg_size_pretty(sum(octet_length(coalesce("corpoTradotto", '')))::bigint) as tradotto,
  pg_size_pretty(sum(octet_length(coalesce("anteprima", '')))::bigint)     as anteprime
from "Messaggio";

-- 3b) …e come si distribuiscono per anno, per capire cosa si può alleggerire.
select
  date_part('year', "data")::int                                        as anno,
  count(*)                                                              as messaggi,
  pg_size_pretty(sum(octet_length(coalesce("corpoHtml", '')))::bigint)  as html
from "Messaggio"
group by 1
order by 1 desc;

-- 4) LO SPAZIO TOTALE DEL DATABASE --------------------------------------------
select pg_size_pretty(pg_database_size(current_database())) as database_totale;
