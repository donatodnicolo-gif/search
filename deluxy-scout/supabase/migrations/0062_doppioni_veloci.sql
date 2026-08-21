-- Deluxy Scout — 0062: la ricerca doppioni tornava a scadere. Terza volta.
-- Idempotente. La applica scripts/allinea-supabase.mjs.
--
-- COSA È SUCCESSO. La 0061 ha allargato il criterio (anche registro↔registro,
-- anche il prefisso) e la funzione è passata a **11 secondi**. Il tetto di
-- PostgREST per l'utente loggato è **8 secondi**: la chiamata muore, e la
-- schermata — che l'errore lo ingoia — mostrava «Doppioni 0». Segnalato
-- dall'utente il 21/08/2026: «doppioni mi dice 0».
--
-- ⚠️ È la STESSA trappola della 0058→0059, con un'altra faccia: là era
-- `similarity(...) >= soglia` che non usa l'indice, qui è il fatto che il
-- confronto fra nomi — trigram o `like` che sia — viene valutato su ogni
-- coppia dentro il raggio, e a 2 km in centro a Milano le coppie sono
-- centinaia di migliaia. Misurato: il solo ramo trigram a 2 km costava già ~5 s
-- **anche prima** della 0061; eravamo sul filo senza saperlo.
--
-- LA CORREZIONE: dare al database una chiave su cui fare un JOIN DI UGUAGLIANZA
-- invece di un confronto riga per riga.
--   · `places.nome_chiave` = la prima parola del nome, minuscola (colonna
--     generata, quindi sempre allineata al nome, e indicizzata).
--   · Il grosso delle coppie si trova con `a.nome_chiave = b.nome_chiave`:
--     «Amir» e «Amir Roma. Cioccolato e Pasticceria» hanno la stessa chiave, e
--     così «AMIRI» e «AMIRI - Milan», «Moncler» e «Moncler Milano …».
--     È anche la regola che la scheda del negozio usava già da sola.
--   · Il trigram resta per i casi in cui la prima parola cambia («L'Angolo dei
--     Fiori» / «Angolo dei Fiori»), ma solo entro 150 m, dove le coppie da
--     confrontare sono poche.
alter table places add column if not exists nome_chiave text
  generated always as (
    lower(regexp_replace(coalesce(nome, ''), '^[^[:alnum:]]*([[:alnum:]]+).*$', '\1'))
  ) stored;

create index if not exists places_nome_chiave_ix on places (nome_chiave);

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
    -- ① Stessa parola iniziale: join di uguaglianza sull'indice, poi la
    --    distanza. È il caso che copre quasi tutti i doppioni veri.
    select a.id as ida, b.id as idb
    from places a
    join places b
      on b.id > a.id
     and b.nome_chiave = a.nome_chiave
     and st_dwithin(a.geo, b.geo, 2000)
    where length(a.nome_chiave) >= 3
      and (a.lat <> 0 or a.lng <> 0)
      and (b.lat <> 0 or b.lng <> 0)
      and not (a.nascosto is true and b.nascosto is true)

    union

    -- ② Nomi simili con la prima parola diversa: il trigram serve ancora, ma
    --    solo da vicino, se no si torna a valutare la somiglianza su tutto.
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
      -- Chi resta: quanto lavoro c'è addosso a ciascuna scheda. Il cliente
      -- vale più di tutto — è il rapporto che esiste già.
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
      -- Indirizzi che si contraddicono: non promuovere, qualunque sia la
      -- distanza (caso reale LUCA FALONI, 0 m fra via Albricci e corso
      -- Matteotti, perché la geocodifica ripiega sulla via).
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
