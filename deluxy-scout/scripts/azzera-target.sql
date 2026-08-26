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
  -- ⚠️ PREDICATO ALLINEATO A `inLavorazione()` (lib/livelli.ts) IL 27/08/2026.
  -- Le sei righe qui sotto sono quelle di luglio; da allora sono nate tabelle
  -- che registrano lavoro vero e che stanno in `on delete cascade` su `places`,
  -- quindi sparivano insieme al negozio senza che niente le guardasse:
  --   · `contatti_avviati` (migr. 0046) — mail/WhatsApp/web GIÀ PARTITI. Non
  --     serve una riga in `contacts` per scrivere a qualcuno, quindi il
  --     controllo sui contatti non faceva da rete;
  --   · `sequenza_iscrizioni` (0050) — e con essa, a cascata, `sequenza_invii`:
  --     lo storico di cosa è stato mandato davvero;
  --   · `bozze_visita` (0047) — la visita scritta sul posto e non ancora
  --     salvata, che per progetto non genera nessun contatto.
  -- Più tre colonne di `places` che dicono «un contatto c'è stato»: mandare una
  -- mail non tocca `places.stato`, quindi un negozio lavorato poteva benissimo
  -- essere ancora `da_visitare` con `creato_da is null`. Misurato il 21/08: su
  -- 223 affiliazioni, ZERO hanno `creato_da`.
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
  and coalesce(p.hubspot_ha_contatto, false) = false;

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
