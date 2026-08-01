-- Deluxy Scout — 0058: l'elenco delle coppie che *forse* sono lo stesso negozio.
-- Idempotente. Applicare con scripts/allinea-supabase.mjs.
--
-- Serve alla sezione Riconciliazione. La logica sta qui e non nell'app per due
-- ragioni: il confronto è un join di 1500 righe su sé stesse con trigram e
-- distanza — roba da database, non da telefono — e perché così **un solo
-- posto** decide cosa è un doppione. Il 31/07/2026 lo stesso calcolo è stato
-- fatto a mano da uno script per un'esportazione: due copie della stessa regola
-- divergono al primo ritocco.
--
-- ⚠️ IL VERDETTO NON È IL NOME: è la DISTANZA. «GUCCI» esiste a Milano, Roma,
-- Firenze e Capri e sono negozi diversi; due schede a 30 metri con lo stesso
-- nome sono lo stesso negozio. E la distanza da sola non basta: due indirizzi
-- diversi finiscono sullo stesso punto quando la geocodifica non trova il
-- civico e ripiega sulla via — è successo con LUCA FALONI, 0 metri fra via
-- Albricci e corso Matteotti, che sono due posti diversi. Per questo un
-- indirizzo discorde fa scendere il verdetto invece di lasciarlo salire.
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
         case when a.lat is not null and b.lat is not null
               and (a.lat <> 0 or a.lng <> 0) and (b.lat <> 0 or b.lng <> 0)
              then round(st_distance(a.geo, b.geo))::int end,
         similarity(lower(a.nome), lower(b.nome)),
         case
           -- Indirizzi che si contraddicono: non promuovere, qualunque sia la
           -- distanza. È la regola che ha salvato LUCA FALONI.
           when coalesce(a.indirizzo,'') <> '' and coalesce(b.indirizzo,'') <> ''
                and similarity(lower(a.indirizzo), lower(b.indirizzo)) < 0.4
             then 'probabile'
           when st_distance(a.geo, b.geo) <= 150 and similarity(lower(a.nome), lower(b.nome)) >= 0.6
             then 'stesso negozio'
           when st_distance(a.geo, b.geo) <= 150 then 'probabile'
           when st_distance(a.geo, b.geo) > 2000 then 'sedi diverse'
           else 'da guardare'
         end
  from places a
  join places b
    on b.id <> a.id
   and similarity(lower(a.nome), lower(b.nome)) >= p_soglia
  where a.anagrafiche_id is not null      -- la scheda del registro resta
    and b.anagrafiche_id is null          -- quella trovata da Google sparisce
    and a.nascosto is not true and b.nascosto is not true
    and a.lat is not null and b.lat is not null
    and (a.lat <> 0 or a.lng <> 0) and (b.lat <> 0 or b.lng <> 0)
    -- Le coppie già scartate da una persona non tornano a chiedere.
    and not exists (
      select 1 from duplicati_ignorati d
       where d.place_min = least(a.id, b.id) and d.place_max = greatest(a.id, b.id)
    )
  order by st_distance(a.geo, b.geo), a.nome
$$;

grant execute on function coppie_duplicate(real) to authenticated;

comment on function coppie_duplicate(real) is
  'Coppie di negozi che forse sono lo stesso: il verdetto lo decide la distanza, corretta dall''indirizzo. Alimenta la sezione Riconciliazione.';
