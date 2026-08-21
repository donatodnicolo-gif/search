-- Deluxy Scout — 0061: la ricerca dei doppioni aveva tre punti ciechi.
-- Idempotente (create or replace). La applica scripts/allinea-supabase.mjs.
--
-- NATA DA UN CASO VERO (21/08/2026). L'utente apre un negozio che la Home gli
-- propone da visitare — «Amir», via del Pellegrino 15, Roma — e dice: «questo
-- risulta già un cliente». Aveva ragione: nello stesso punto (0 metri) c'era
-- «Amir Roma. Cioccolato e Pasticceria», stato **cliente**. Due schede della
-- stessa pasticceria, e la Riconciliazione non le aveva mai proposte. Perché:
--
--   ① confrontava **solo registro ↔ Google** (`a.anagrafiche_id is not null
--      and b.anagrafiche_id is null`). Qui vengono **entrambe dal registro**,
--      quindi la coppia non veniva nemmeno generata. Nel registro Anagrafiche
--      esistono davvero due anagrafiche per lo stesso negozio, e Scout le
--      importa tutte e due: finché la sorgente ha doppioni, li avremo anche noi.
--   ② scartava le schede **nascoste**, e quella buona (il cliente) era nascosta:
--      il risultato è che si vedeva solo il doppione vuoto.
--   ③ il nome: «amir» contro «amir roma. cioccolato e pasticceria» ha una
--      somiglianza trigram di ~0,3, sotto la soglia. Ma un nome **contenuto**
--      nell'altro, a pochi metri, è il modo tipico in cui si presenta lo stesso
--      negozio scritto due volte.
--
-- COSA CAMBIA
--   · si confrontano TUTTE le coppie vicine, non solo registro↔Google;
--   · si accetta anche il **prefisso** («Amir» ⊂ «Amir Roma …»), con un minimo
--     di 4 caratteri: senza, un negozio chiamato «Bar» pescherebbe mezza città;
--   · una scheda nascosta entra in coppia (due nascoste no: non le guarda nessuno);
--   · **chi resta non è più deciso dalla provenienza ma dal lavoro fatto**:
--     contatti + visite + trattative, e chi è cliente vince comunque (+100).
--     Tenere la scheda del registro e buttare quella con la storia dentro
--     sarebbe stato il modo più elegante di perdere i dati.
--
-- Misurato prima di applicarla: 277 coppie in tutto (erano ~294 col criterio
-- vecchio), di cui 113 prese solo dal prefisso, 33 registro↔registro, 14 con
-- una scheda nascosta.
--
-- ⚠️ Firma e colonne INVARIATE: `lib/riconciliazione.ts` e la schermata leggono
-- questi nomi, e i verdetti restano i tre che la UI sa colorare.
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
  with coppie as (
    select
      a.id as ida, b.id as idb,
      a.nome as nome_a, b.nome as nome_b,
      a.indirizzo as ind_a, b.indirizzo as ind_b,
      coalesce(a.zona, b.zona, '') as citta,
      round(st_distance(a.geo, b.geo))::int as metri,
      similarity(lower(a.nome), lower(b.nome)) as simil,
      -- Quanto lavoro c'è addosso a ciascuna scheda. Il cliente vale più di
      -- tutto: è il rapporto che esiste già.
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
    from places a
    join places b
      -- `b.id > a.id`: ogni coppia una volta sola. L'orientamento (chi resta)
      -- lo decide il peso più sotto, non l'ordine degli id.
      on b.id > a.id
     -- Prima la distanza (indice GIST), che è ciò che riduce davvero.
     and st_dwithin(a.geo, b.geo, 2000)
     and (
           -- trigram, indicizzato (places_nome_trgm_ix)
           lower(a.nome) % lower(b.nome)
           -- oppure un nome contenuto nell'altro: «Amir» ⊂ «Amir Roma …»
           or (length(a.nome) >= 4 and lower(b.nome) like lower(a.nome) || ' %')
           or (length(b.nome) >= 4 and lower(a.nome) like lower(b.nome) || ' %')
           or (length(a.nome) >= 4 and lower(b.nome) like lower(a.nome) || '.%')
           or (length(b.nome) >= 4 and lower(a.nome) like lower(b.nome) || '.%')
         )
    where (a.lat <> 0 or a.lng <> 0)
      and (b.lat <> 0 or b.lng <> 0)
      -- Due schede nascoste non le guarda nessuno; una sì: è il caso «Amir».
      and not (a.nascosto is true and b.nascosto is true)
      and (
            similarity(lower(a.nome), lower(b.nome)) >= p_soglia
            -- il prefisso vale anche sotto soglia, ma solo da vicino
            or (st_distance(a.geo, b.geo) <= 150
                and ((length(a.nome) >= 4 and lower(b.nome) like lower(a.nome) || ' %')
                  or (length(b.nome) >= 4 and lower(a.nome) like lower(b.nome) || ' %')
                  or (length(a.nome) >= 4 and lower(b.nome) like lower(a.nome) || '.%')
                  or (length(b.nome) >= 4 and lower(a.nome) like lower(b.nome) || '.%')))
          )
      and not exists (
        select 1 from duplicati_ignorati d
         where d.place_min = least(a.id, b.id) and d.place_max = greatest(a.id, b.id)
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
      -- Indirizzi che si contraddicono: non promuovere, qualunque sia la
      -- distanza. Due indirizzi diversi finiscono sullo stesso punto quando la
      -- geocodifica non trova il civico e ripiega sulla via (caso reale LUCA
      -- FALONI, 0 m fra via Albricci e corso Matteotti).
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
