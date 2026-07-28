-- LIBERARE SPAZIO sul database di AI Mail — SQL Editor di Supabase.
--
-- ⚠️ LEGGERE PRIMA DI ESEGUIRE. Qui dentro ci sono comandi che CANCELLANO. Ogni
-- blocco ha sopra la sua SELECT di conteggio: si guarda quel numero, e solo se
-- convince si esegue la riga sotto. Niente va lanciato «tutto insieme».
--
-- ⚠️ E SOPRATTUTTO: SU POSTGRES CANCELLARE NON LIBERA IL DISCO.
--
-- Un DELETE non toglie niente dal file: marca le righe come morte. Lo spazio
-- torna disponibile *dentro* la tabella dopo un VACUUM — quindi la posta nuova
-- lo riusa e il database smette di crescere — ma il file NON si rimpicciolisce.
-- Per restituire davvero il disco serve VACUUM FULL, che riscrive la tabella da
-- capo e mentre lo fa ha bisogno di spazio libero PARI alla tabella stessa.
--
-- Da cui l'ordine, che è controintuitivo ma è l'unico che funziona:
--   1. prima si fa RIPARTIRE il database (spazio in più dal pannello Supabase);
--   2. poi si cancella;
--   3. poi si compatta.
-- Cancellare per primo, a disco pieno, non si può proprio: il database è in
-- sola lettura e il DELETE fallisce con 25006.

-- =============================================================================
-- 0) SI PUÒ SCRIVERE? Se torna 'on', il database è in sola lettura: fermarsi
--    qui e liberare spazio dal pannello Supabase prima di andare avanti.
-- =============================================================================
select current_setting('transaction_read_only') as sola_lettura;

-- =============================================================================
-- 1) IL CESTINO — quanto pesa davvero
--    È la prima cosa a cui si pensa, ma spesso è la più piccola: contarlo
--    evita di fare un lavoro rischioso per recuperare due megabyte.
-- =============================================================================
select
  count(*)                                                                as messaggi_nel_cestino,
  pg_size_pretty(sum(
    octet_length(coalesce("corpoTesto",'')) +
    octet_length(coalesce("corpoHtml",'')) +
    octet_length(coalesce("corpoTradotto",''))
  )::bigint)                                                              as spazio_dei_corpi
from "Messaggio" where "cestinato" = true;

-- Se il numero convince, si svuota. ⚠️ MEGLIO DALL'APP che da qui: il pulsante
-- «Svuota cestino» cancella le mail anche dalla CASELLA di posta, che è quello
-- che ci si aspetta. Cancellandole solo qui, restano sul server IMAP e al
-- prossimo scarico dello storico possono tornare indietro.
-- delete from "Messaggio" where "cestinato" = true;

-- =============================================================================
-- 2) I CORPI HTML DELLE MAIL VECCHIE — di solito è QUI che se ne va il disco
--    Ogni messaggio conserva testo + HTML. L'HTML pesa 5-10 volte il testo e
--    serve solo a rivedere la mail impaginata: il testo resta, l'anteprima
--    resta, l'analisi dell'AI resta, e l'originale è comunque sul server IMAP.
--    Svuotarlo sulle mail vecchie non perde nulla di operativo.
-- =============================================================================
select
  count(*)                                                             as mail_piu_vecchie_di_un_anno,
  pg_size_pretty(sum(octet_length(coalesce("corpoHtml",'')))::bigint)  as html_recuperabile
from "Messaggio"
where "data" < now() - interval '1 year' and "corpoHtml" is not null;

-- update "Messaggio" set "corpoHtml" = null
--  where "data" < now() - interval '1 year' and "corpoHtml" is not null;

-- =============================================================================
-- 3) LE TRADUZIONI VECCHIE — si rifanno all'apertura, se servono
-- =============================================================================
select
  count(*)                                                                 as tradotte_vecchie,
  pg_size_pretty(sum(octet_length(coalesce("corpoTradotto",'')))::bigint)  as recuperabile
from "Messaggio"
where "data" < now() - interval '6 months' and "corpoTradotto" is not null;

-- update "Messaggio" set "corpoTradotto" = null
--  where "data" < now() - interval '6 months' and "corpoTradotto" is not null;

-- =============================================================================
-- 4) COMPATTARE — senza questo i punti 1-3 non restituiscono un byte
-- =============================================================================
-- VACUUM (leggero, non blocca): lo spazio torna riusabile DENTRO la tabella.
-- Il database smette di crescere, ma il disco occupato resta quello.
vacuum (verbose, analyze) "Messaggio";

-- VACUUM FULL (pesante): riscrive la tabella e RESTITUISCE il disco.
-- ⚠️ Blocca la tabella per tutta la durata — l'app non legge né scrive i
-- messaggi finché non finisce — e richiede spazio libero pari alla tabella.
-- Farlo di notte, dopo aver aumentato il disco.
-- vacuum full "Messaggio";

-- Com'è andata:
select pg_size_pretty(pg_total_relation_size('"Messaggio"')) as messaggio_totale,
       pg_size_pretty(pg_database_size(current_database()))  as database_totale;
