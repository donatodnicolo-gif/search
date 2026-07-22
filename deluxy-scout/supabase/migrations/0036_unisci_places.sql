-- Unione di due target duplicati: sposta TUTTI i dati collegati dal duplicato
-- (p_da) al target che resta (p_verso), completa i campi mancanti sul survivor,
-- poi elimina il duplicato. Transazionale e SECURITY DEFINER così funziona anche
-- se i dati collegati (visite, ecc.) appartengono a venditori diversi.
create or replace function unisci_places(p_da uuid, p_verso uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

  -- Libera l'unique di google_place_id prima di eliminare il duplicato.
  update places set google_place_id = null where id = p_da;

  -- Elimina il duplicato (cascade su contatti_scartati / aziende_scartate).
  delete from places where id = p_da;
end;
$$;

grant execute on function unisci_places(uuid, uuid) to authenticated;
