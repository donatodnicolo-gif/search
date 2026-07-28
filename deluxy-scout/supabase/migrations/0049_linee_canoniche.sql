-- Deluxy Scout — 0049: un solo nome per ogni interesse.
-- Idempotente. Applicare con scripts/mgmt-query.mjs (o allinea-supabase.mjs).
--
-- Nei dati convivevano due scritture per lo stesso interesse — «Regali
-- aziendali» e «Gifting», «Catering» e «Eventi & Catering» — e nei filtri
-- comparivano come voci diverse: si filtrava per una e si perdeva metà dei
-- negozi, senza nessun segnale che mancasse qualcosa.
--
-- Il nome giusto è quello del **registro Anagrafiche**, che del catalogo degli
-- interessi è la fonte di verità (verificato il 28/07/2026 sui partner veri:
-- «Gifting» 51, «Eventi & Catering» 47; «Regali aziendali» non esiste).
--
-- ⚠️ Serve anche se l'app canonizza già in lettura: la traduzione al volo
-- copre le schermate, non le regole `category_rules` che assegnano l'interesse
-- ai negozi nuovi, né chi legge il database da fuori (Anagrafiche riceve gli
-- interessi via API e scarta in silenzio le chiavi fuori catalogo).

-- ── places: linea primaria ────────────────────────────────────────────────────
update places set linea_ipotizzata = 'Gifting'
 where linea_ipotizzata ilike 'regali aziendali' or linea_ipotizzata ilike 'regali';

update places set linea_ipotizzata = 'Eventi & Catering'
 where linea_ipotizzata ilike 'catering' or linea_ipotizzata ilike 'eventi';

-- ── places: interessi multipli (array) ───────────────────────────────────────
-- `array_replace` non basta: dopo la sostituzione lo stesso nome può comparire
-- due volte (un negozio con «Gifting» *e* «Regali aziendali» finirebbe con
-- «Gifting» ripetuto). Si ricostruisce l'array deduplicando.
update places
   set linee_ipotizzate = sub.nuove
  from (
    select p.id,
           array(
             select distinct case
               when lower(v) in ('regali aziendali', 'regali') then 'Gifting'
               when lower(v) in ('catering', 'eventi')          then 'Eventi & Catering'
               else v
             end
             from unnest(p.linee_ipotizzate) as v
           ) as nuove
      from places p
     where p.linee_ipotizzate is not null
  ) as sub
 where places.id = sub.id
   and places.linee_ipotizzate is distinct from sub.nuove;

-- ── category_rules: la sorgente dei negozi NUOVI ─────────────────────────────
-- Senza questa, ogni negozio creato d'ora in poi rinascerebbe col nome vecchio.
update category_rules set linea_ipotizzata = 'Gifting'
 where linea_ipotizzata ilike 'regali aziendali' or linea_ipotizzata ilike 'regali';

update category_rules set linea_ipotizzata = 'Eventi & Catering'
 where linea_ipotizzata ilike 'catering' or linea_ipotizzata ilike 'eventi';

-- ── deals: la linea proposta in trattativa (primaria + array) ────────────────
update deals set linea = 'Gifting'
 where linea ilike 'regali aziendali' or linea ilike 'regali';

update deals set linea = 'Eventi & Catering'
 where linea ilike 'catering' or linea ilike 'eventi';

update deals
   set linee = sub.nuove
  from (
    select d.id,
           array(
             select distinct case
               when lower(v) in ('regali aziendali', 'regali') then 'Gifting'
               when lower(v) in ('catering', 'eventi')          then 'Eventi & Catering'
               else v
             end
             from unnest(d.linee) as v
           ) as nuove
      from deals d
     where d.linee is not null
  ) as sub
 where deals.id = sub.id
   and deals.linee is distinct from sub.nuove;
