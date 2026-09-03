-- RECUPERO delle prossime attività già scritte sulle trattative (31/08/2026,
-- richiesta dell'utente: «fai anche per le precedenti»).
--
-- ⚠️ Anti-doppione: si salta se esiste già un task APERTO con lo stesso titolo
-- sullo stesso negozio. Rilanciarlo non crea niente di nuovo.
-- ⚠️ La scadenza segue la stessa regola dell'app: su una persa è il giorno in
-- cui si è deciso di riprovarci, altrimenti la scadenza della trattativa.
-- ⚠️ `tasks.owner` è NOT NULL: le trattative senza proprietario vanno a chi
-- esegue il recupero, esattamente come fa l'app quando nessuno la segue.
with admin as (select id from profiles where nome ilike '%Nicol%' limit 1),
cand as (
  select d.id as deal_id,
         btrim(d.next_action) as titolo,
         d.place_id,
         coalesce(d.owner, (select id from admin)) as owner,
         case when d.fase = 'closedlost' then d.riprendere_il else d.scadenza end as scadenza,
         d.fase,
         d.oggetto,
         p.nome as negozio
  from deals d
  left join places p on p.id = d.place_id
  where d.next_action is not null and btrim(d.next_action) <> ''
)
insert into tasks (owner, creato_da, titolo, note, priorita, scadenza, place_id)
select c.owner,
       (select id from admin),
       c.titolo,
       'Prossima attività della trattativa'
         || coalesce(' «' || c.oggetto || '»', '')
         || coalesce(' di ' || c.negozio, '')
         || case when c.fase = 'closedlost' then ' (persa, da riprendere).'
                 when c.fase = 'closedwon' then ' (vinta).'
                 else '.' end
         || ' Creata dal recupero del 31/08/2026.',
       'P2',
       c.scadenza,
       c.place_id
from cand c
where not exists (
  select 1 from tasks t
  where not t.completata
    and lower(btrim(t.titolo)) = lower(c.titolo)
    and t.place_id is not distinct from c.place_id
)
returning id, titolo, scadenza;
