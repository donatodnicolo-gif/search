-- Deluxy Scout — 0059: `coppie_duplicate` andava in timeout. Riscritta.
-- Idempotente. Applicare con scripts/allinea-supabase.mjs.
--
-- Il difetto della 0058: `similarity(lower(a.nome), lower(b.nome)) >= soglia`
-- **non può usare l'indice**. Postgres era costretto a calcolare la somiglianza
-- per ogni coppia possibile — 1500 × 1500 — e la chiamata moriva con
-- «canceling statement due to statement timeout», cioè la schermata restava
-- vuota senza dire perché.
--
-- Due correzioni, entrambe per far lavorare gli indici che esistono già:
--   · `%` al posto di `similarity(...) >=` → usa l'indice GIN trigram
--     (`places_nome_trgm_ix`). È lo stesso confronto, ma indicizzato.
--   · `st_dwithin(...)` → usa l'indice GIST (`places_geo_gix`) e taglia le
--     coppie lontane prima di calcolare qualunque distanza.
--
-- ⚠️ La soglia del `%` è di sistema (`pg_trgm.similarity_threshold`, 0.3), non
-- quella passata: si filtra comunque dopo con `similarity(...) >= p_soglia`,
-- che ora però gira su poche coppie invece che su tutte.
--
-- ⚠️ SPARISCE IL VERDETTO «sedi diverse»: oltre 2 km non sono doppioni e non
-- servono a nessuno — erano 125 righe di rumore da scorrere. Il taglio è anche
-- ciò che rende la query veloce.
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
  select a.id, a.nome, b.id, b.nome,
         coalesce(a.zona, b.zona, ''),
         a.indirizzo, b.indirizzo,
         round(st_distance(a.geo, b.geo))::int,
         similarity(lower(a.nome), lower(b.nome)),
         case
           -- Indirizzi che si contraddicono: non promuovere, qualunque sia la
           -- distanza. Due indirizzi diversi finiscono sullo stesso punto
           -- quando la geocodifica non trova il civico e ripiega sulla via —
           -- caso reale LUCA FALONI, 0 m fra via Albricci e corso Matteotti.
           when coalesce(a.indirizzo,'') <> '' and coalesce(b.indirizzo,'') <> ''
                and similarity(lower(a.indirizzo), lower(b.indirizzo)) < 0.4
             then 'probabile'
           when st_distance(a.geo, b.geo) <= 150 and similarity(lower(a.nome), lower(b.nome)) >= 0.6
             then 'stesso negozio'
           when st_distance(a.geo, b.geo) <= 150 then 'probabile'
           else 'da guardare'
         end
  from places a
  join places b
    on b.id <> a.id
   -- Prima la distanza (indice GIST), poi il nome (indice GIN trigram): le due
   -- condizioni che riducono davvero, entrambe indicizzate.
   and st_dwithin(a.geo, b.geo, 2000)
   and lower(a.nome) % lower(b.nome)
   and similarity(lower(a.nome), lower(b.nome)) >= p_soglia
  where a.anagrafiche_id is not null      -- la scheda del registro resta
    and b.anagrafiche_id is null          -- quella trovata da Google sparisce
    and a.nascosto is not true and b.nascosto is not true
    -- Chi non ha una posizione sta nell'altra scheda, non qui.
    and (a.lat <> 0 or a.lng <> 0) and (b.lat <> 0 or b.lng <> 0)
    and not exists (
      select 1 from duplicati_ignorati d
       where d.place_min = least(a.id, b.id) and d.place_max = greatest(a.id, b.id)
    )
  order by st_distance(a.geo, b.geo), a.nome
$$;
