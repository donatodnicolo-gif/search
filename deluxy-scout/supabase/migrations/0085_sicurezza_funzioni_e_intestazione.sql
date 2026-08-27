-- 0085 — LE DUE PORTE SENZA GUARDIANO, E LA CARTA INTESTATA (27/08/2026).
--
-- Nasce da una revisione di sicurezza chiesta dall'utente: «verifica se un
-- utente può accedere a informazioni anche esternamente richiamando api che non
-- gli sono consentite». Ogni accusa è passata da un revisore ostile col mandato
-- di demolirla; qui ci sono solo quelle sopravvissute, più una che l'ostile ha
-- scoperto essere peggiore di come l'avevo scritta.
--
-- ⚠️ IL FATTO CHE HA CAMBIATO TUTTO, misurato sul database vero e non dedotto:
-- su questo cluster ogni funzione nasce con `EXECUTE` concesso a `anon`
-- (privilegi di default di Supabase). `pg_proc.proacl` di `unisci_places`
-- diceva `=X/postgres | anon=X/postgres`: cioè la funzione che CANCELLA un
-- negozio — e con lui contatti, visite, trattative, chiamate — era chiamabile
-- con la sola chiave pubblica che sta nel bundle del browser. Nessun login.
--
-- E dice anche un'altra cosa: `revoke ... from public` NON basta, perché il
-- privilegio di `anon` è una concessione diretta, non l'eredità di PUBLIC. Le
-- tre funzioni della 0084 avevano il revoke da public e restavano comunque
-- eseguibili da `anon`: le ha salvate il controllo di `auth.uid()` dentro il
-- corpo. È il motivo per cui qui si fanno TUTTE E DUE le cose.

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
  -- ⚠️ CHI SEI (aggiunto il 27/08/2026). Questa funzione è `security definer`:
  -- gira coi privilegi del proprietario e SCAVALCA la RLS, compresa la regola
  -- della 0054 che limita la cancellazione di un negozio a chi l'ha creato.
  -- Senza questa riga la cancellazione era esposta a chiunque, perché su questo
  -- cluster il `grant execute` ad `anon` lo mette Supabase da sé alla
  -- creazione di ogni funzione (misurato: proacl con `anon=X`).
  --
  -- Il `revoke` qui sotto toglie quel privilegio; questa riga serve nel caso
  -- che un domani qualcuno lo rimetta con un `grant` largo. Le due difese non
  -- si sostituiscono: una sta nei permessi, l'altra nel codice.
  if auth.uid() is null then
    raise exception 'Non autenticato';
  end if;
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) I PERMESSI: via il default di anon dalle funzioni che toccano dati.
--
-- ⚠️ Anche dalle tre della 0084, che il revoke da public non aveva coperto.
revoke execute on function unisci_places(uuid, uuid) from public, anon;
revoke execute on function coppie_duplicate(real) from public, anon;
revoke execute on function prenota_lettura_posta(int) from public, anon;
revoke execute on function chiudi_lettura_posta(text, boolean) from public, anon;
revoke execute on function rilascia_lettura_posta(timestamptz) from public, anon;
grant execute on function unisci_places(uuid, uuid) to authenticated;
grant execute on function coppie_duplicate(real) to authenticated;
grant execute on function prenota_lettura_posta(int) to authenticated;
grant execute on function chiudi_lettura_posta(text, boolean) to authenticated;
grant execute on function rilascia_lettura_posta(timestamptz) to authenticated;

-- `coppie_duplicate` LEGGE e basta (nomi e indirizzi dei negozi, scavalcando la
-- RLS): il revoke qui sopra è la sua difesa. Non si riscrive il corpo — sono
-- novanta righe di query, e riscriverle per aggiungere una riga di controllo
-- rischia più di quanto protegga.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) CHI È L'AMMINISTRATORE, in un posto solo.
--
-- ⚠️ Oggi la stessa email è ricopiata in nove migrazioni e in due file di
-- codice. Finché è una sola persona non fa danno; il giorno che se ne aggiunge
-- una, o che quella cambia, una delle copie resta indietro — e nella direzione
-- sbagliata lascia acceso un privilegio a chi non dovrebbe averlo. Le policy
-- nuove partono da qui; le vecchie si sposteranno una alla volta.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce((auth.jwt() ->> 'email') = 'nicolo.donato@deluxy.it', false);
$fn$;
revoke execute on function is_admin() from public, anon;
grant execute on function is_admin() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) LA CARTA INTESTATA: la scrive l'amministratore, non chiunque.
--
-- `template_documento` porta `iban` e `intestatario_conto`, cioè le coordinate
-- con cui un cliente bonifica. La 0079 le ha aperte a ogni autenticato con la
-- motivazione «non è un dato personale, è l'intestazione dell'azienda»: vale
-- per il logo e la ragione sociale, non per il conto corrente. Gli stessi dati,
-- in `impostazioni`, sono riservati all'admin dalla 0043.
--
-- Oggi la tabella è VUOTA (misurato: zero righe, zero IBAN), quindi si chiude
-- la porta prima che dentro ci sia qualcosa da rubare, non dopo.
--
-- ⚠️ La lettura resta a tutti: serve a comporre il documento.
drop policy if exists template_documento_insert on template_documento;
drop policy if exists template_documento_update on template_documento;
drop policy if exists template_documento_delete on template_documento;
create policy template_documento_insert on template_documento
  for insert to authenticated with check (is_admin());
create policy template_documento_update on template_documento
  for update to authenticated using (is_admin()) with check (is_admin());
create policy template_documento_delete on template_documento
  for delete to authenticated using (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) IL TOKEN DEL CALENDARIO NON SI LEGGE PIÙ DALLA RIGA DEL COLLEGA.
--
-- `profiles` è in lettura a tutti (e va bene: servono nomi ed email per
-- assegnare il lavoro), ma la RLS filtra le RIGHE, non le COLONNE — e lì dentro
-- c'è `cal_token`, che è la chiave dell'URL .ics. Quel feed è pubblicato senza
-- verifica del JWT e risponde a chiunque abbia il token: quindi un venditore
-- poteva leggere il token di un collega e scaricarsi i suoi TASK — l'unico dato
-- che la RLS gli nasconde davvero (0022) — da qualsiasi browser, senza
-- sessione, per sempre. Anche dopo che l'account è stato sospeso.
--
-- ⚠️ Non basta una policy: si tolgono i PRIVILEGI DI COLONNA. E per toglierne
-- una sola bisogna prima togliere il SELECT sulla tabella e poi ridarlo sulle
-- colonne che restano — un `revoke select (colonna)` su un grant di tabella non
-- morde.
revoke select on public.profiles from authenticated, anon;
grant select (id, email, nome, created_at, ultimo_accesso, proforma_default)
  on public.profiles to authenticated;

-- Lo stesso vale in scrittura: senza questo, uno poteva riscriversi il proprio
-- `cal_token` (poco male) ma anche la propria `email` — che è l'indirizzo a cui
-- `notifica-task` e `promemoria` mandano la posta.
revoke update on public.profiles from authenticated, anon;
grant update (nome, proforma_default) on public.profiles to authenticated;

-- Il proprio token si chiede così, e solo il proprio.
create or replace function mio_cal_token()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  t uuid;
begin
  if auth.uid() is null then
    raise exception 'Non autenticato';
  end if;
  select cal_token into t from profiles where id = auth.uid();
  return t;
end;
$fn$;
revoke execute on function mio_cal_token() from public, anon;
grant execute on function mio_cal_token() to authenticated;

-- E si può cambiare. Serviva già prima e non c'era: un token che non si ruota,
-- quando esce di mano, resta fuori per sempre — non c'è modo di richiamarlo.
-- ⚠️ Chi lo rigenera spegne le sottoscrizioni fatte con quello vecchio: è il
-- punto, e la schermata lo dice prima di farlo.
create or replace function rigenera_cal_token()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  t uuid;
begin
  if auth.uid() is null then
    raise exception 'Non autenticato';
  end if;
  update profiles set cal_token = gen_random_uuid() where id = auth.uid()
    returning cal_token into t;
  return t;
end;
$fn$;
revoke execute on function rigenera_cal_token() from public, anon;
grant execute on function rigenera_cal_token() to authenticated;
