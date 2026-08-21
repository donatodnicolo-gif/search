-- Deluxy Scout — 0063: la chiave sulla prima parola era troppo larga.
-- Idempotente. La applica scripts/allinea-supabase.mjs.
--
-- La 0062 ha risolto la lentezza (11 s → ~2,5 s) ma ha portato le coppie da 218
-- a **1520**: inutilizzabile. Il motivo si legge nei dati — le prime parole più
-- frequenti sono **generiche**: `studio` (61 negozi), `pasticceria` (24),
-- `hotel` (15), `fioreria` (15), `milano` (13), `fiori` (12), `avvocato` (11).
-- Con la sola uguaglianza della prima parola, «Pasticceria Rossi» e
-- «Pasticceria Bianchi» a due isolati di distanza diventavano una coppia.
--
-- Regola nuova per il ramo ①: oltre alla stessa parola iniziale servono
--   · **300 metri** invece di 2 km — oltre, di solito è geocodifica che ha
--     ripiegato sulla via, non lo stesso negozio; e
--   · un nome che regge il confronto: somiglianza ≥ 0,3 **oppure** un nome
--     contenuto nell'altro («Amir» ⊂ «Amir Roma. Cioccolato e Pasticceria»).
-- Misurato: 1520 → ~306 coppie, e il caso Amir resta dentro.
create or replace function coppie_duplicate(p_soglia real default 0.6)
returns table (
  tiene_id uuid, tiene text, togli_id uuid, togli text,
  citta text, indirizzo_tiene text, indirizzo_togli text,
  metri int, somiglianza real, verdetto text
)
language sql
stable
security definer
set search_path = public
as $$
  with candidate as materialized (
    -- ① Stessa parola iniziale, vicini, e con un nome che regge il confronto.
    select a.id as ida, b.id as idb
    from places a
    join places b
      on b.id > a.id
     and b.nome_chiave = a.nome_chiave
     and st_dwithin(a.geo, b.geo, 300)
    where length(a.nome_chiave) >= 3
      and (a.lat <> 0 or a.lng <> 0)
      and (b.lat <> 0 or b.lng <> 0)
      and not (a.nascosto is true and b.nascosto is true)
      and (
            similarity(lower(a.nome), lower(b.nome)) >= 0.3
            or lower(b.nome) like lower(a.nome) || '%'
            or lower(a.nome) like lower(b.nome) || '%'
          )

    union

    -- ② Nomi simili con la prima parola diversa («L'Angolo dei Fiori» /
    --    «Angolo dei Fiori»): il trigram serve ancora, ma solo da vicino.
    select a.id, b.id
    from places a
    join places b
      on b.id > a.id
     and st_dwithin(a.geo, b.geo, 150)
     and lower(a.nome) % lower(b.nome)
     and similarity(lower(a.nome), lower(b.nome)) >= p_soglia
    where (a.lat <> 0 or a.lng <> 0)
      and (b.lat <> 0 or b.lng <> 0)
      and not (a.nascosto is true and b.nascosto is true)
  ),
  coppie as (
    select
      x.ida, x.idb,
      a.nome as nome_a, b.nome as nome_b,
      a.indirizzo as ind_a, b.indirizzo as ind_b,
      coalesce(a.zona, b.zona, '') as citta,
      round(st_distance(a.geo, b.geo))::int as metri,
      similarity(lower(a.nome), lower(b.nome)) as simil,
      (select count(*) from contacts c where c.place_id = a.id)
        + (select count(*) from visits v where v.place_id = a.id)
        + (select count(*) from deals d where d.place_id = a.id)
        + case when a.stato = 'cliente' or a.stato_affiliazione = 'attivo' or a.anagrafiche_stato = 'attivo' then 100 else 0 end
        + case when a.anagrafiche_id is not null then 10 else 0 end as peso_a,
      (select count(*) from contacts c where c.place_id = b.id)
        + (select count(*) from visits v where v.place_id = b.id)
        + (select count(*) from deals d where d.place_id = b.id)
        + case when b.stato = 'cliente' or b.stato_affiliazione = 'attivo' or b.anagrafiche_stato = 'attivo' then 100 else 0 end
        + case when b.anagrafiche_id is not null then 10 else 0 end as peso_b
    from candidate x
    join places a on a.id = x.ida
    join places b on b.id = x.idb
    where not exists (
      select 1 from duplicati_ignorati d
       where d.place_min = least(x.ida, x.idb) and d.place_max = greatest(x.ida, x.idb)
    )
  )
  select
    case when peso_b > peso_a then idb    else ida    end,
    case when peso_b > peso_a then nome_b else nome_a end,
    case when peso_b > peso_a then ida    else idb    end,
    case when peso_b > peso_a then nome_a else nome_b end,
    citta,
    case when peso_b > peso_a then ind_b  else ind_a  end,
    case when peso_b > peso_a then ind_a  else ind_b  end,
    metri,
    simil,
    case
      when coalesce(ind_a,'') <> '' and coalesce(ind_b,'') <> ''
           and similarity(lower(ind_a), lower(ind_b)) < 0.4
        then 'probabile'
      when metri <= 150 and simil >= 0.6 then 'stesso negozio'
      when metri <= 150 then 'probabile'
      else 'da guardare'
    end
  from coppie
  order by metri, nome_a
$$;
