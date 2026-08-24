-- Deluxy Scout — 0067: unendo due negozi, il legame col registro non si perde.
-- Idempotente. Ricordarsi di aggiungerla a MIGRAZIONI in allinea-supabase.mjs.
--
-- PERCHÉ. `unisci_places` (0036) travasa sul superstite i campi vuoti, ma
-- **non `anagrafiche_id`**: quel legame moriva con la riga cancellata. E
-- siccome l'import dal registro fa `upsert on conflict (anagrafiche_id)`, un
-- negozio unito e sparito da Scout **tornava al giro successivo**, come nuovo.
-- Misurato il 23/08/2026: su 364 coppie proposte, in 65 la scheda scartata era
-- legata al registro.
--
-- Due casi, e sono diversi:
--  · il superstite NON ha un legame → si prende quello del duplicato (sono lo
--    stesso negozio: il legame è uno solo, e deve restare attaccato a chi vive);
--  · **tutti e due ce l'hanno** → qui il duplicato esiste davvero anche nel
--    registro, e non basta il database: le due anagrafiche vanno unite LÀ.
--    Se ne occupa l'app (`unisciCoppia` → Edge `anagrafiche` → registro),
--    perché è una scrittura su un'altra applicazione, non una riga di SQL.
create or replace function unisci_places(p_da uuid, p_verso uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ana_da    text;
  v_ana_verso text;
begin
  if p_da is null or p_verso is null or p_da = p_verso then
    raise exception 'Target non validi per l''unione';
  end if;
  if not exists (select 1 from places where id = p_da) or not exists (select 1 from places where id = p_verso) then
    raise exception 'Target inesistente';
  end if;

  -- Sposta i figli dal duplicato al target che resta.
  update contacts           set place_id = p_verso where place_id = p_da;
  update visits             set place_id = p_verso where place_id = p_da;
  update deals              set place_id = p_verso where place_id = p_da;
  update chiamate           set place_id = p_verso where place_id = p_da;
  update tasks              set place_id = p_verso where place_id = p_da;
  update richieste_pagamento set place_id = p_verso where place_id = p_da;

  -- Completa i campi mancanti sul survivor con quelli del duplicato (senza
  -- sovrascrivere ciò che è già valorizzato).
  update places s set
    linea_ipotizzata    = coalesce(s.linea_ipotizzata, d.linea_ipotizzata),
    linee_ipotizzate    = case when coalesce(array_length(s.linee_ipotizzate, 1), 0) = 0
                               then d.linee_ipotizzate else s.linee_ipotizzate end,
    aggancio_apertura   = coalesce(s.aggancio_apertura, d.aggancio_apertura),
    stato_affiliazione  = coalesce(s.stato_affiliazione, d.stato_affiliazione),
    anagrafiche_account = coalesce(s.anagrafiche_account, d.anagrafiche_account),
    anagrafiche_stato   = coalesce(s.anagrafiche_stato, d.anagrafiche_stato),
    hubspot_company_id  = coalesce(s.hubspot_company_id, d.hubspot_company_id),
    creato_da           = coalesce(s.creato_da, d.creato_da),
    indirizzo           = coalesce(s.indirizzo, d.indirizzo),
    zona                = coalesce(s.zona, d.zona),
    categoria           = coalesce(s.categoria, d.categoria)
  from places d
  where s.id = p_verso and d.id = p_da;

  -- ⚠️ IL LEGAME COL REGISTRO, in due passi obbligati.
  -- `anagrafiche_id` ha un indice unico: assegnarlo al superstite mentre è
  -- ancora addosso al duplicato farebbe rifiutare la scrittura. Prima si
  -- stacca, poi si attacca — la stessa danza che si fa qui sotto per
  -- `google_place_id`.
  select anagrafiche_id into v_ana_da    from places where id = p_da;
  select anagrafiche_id into v_ana_verso from places where id = p_verso;
  if v_ana_da is not null and v_ana_verso is null then
    update places set anagrafiche_id = null   where id = p_da;
    update places set anagrafiche_id = v_ana_da where id = p_verso;
  end if;

  -- Libera l'unique di google_place_id prima di eliminare il duplicato.
  update places set google_place_id = null where id = p_da;

  -- Elimina il duplicato (cascade su contatti_scartati / aziende_scartate).
  delete from places where id = p_da;
end;
$$;

comment on function unisci_places(uuid, uuid) is
  'Unisce due negozi doppi. Dal 23/08/2026 porta al superstite anche anagrafiche_id quando lui non ce l''ha: se no l''import dal registro ricreava il duplicato al giro dopo.';
