-- 0074 — FORNITURE: cosa sa fare un fornitore, e a quali condizioni.
--
-- Richiesta dell'utente (26/08/2026): una sezione «Forniture» accanto ai
-- Preventivi, «dove caricheremo dei dettagli di informazioni».
--
-- La differenza con i preventivi, che è il motivo per cui sono due cose:
--   · un PREVENTIVO è il prezzo di UN lavoro specifico, chiesto oggi e valido
--     per quello (`lavori` + `preventivi`, migr. 0055);
--   · una FORNITURA è quello che un fornitore fa SEMPRE — il suo listino, i
--     tempi, i minimi d'ordine, la zona che copre. È la memoria che oggi sta
--     nella testa di chi ha telefonato l'ultima volta.
-- Senza le forniture, ogni volta che serve un prezzo si riparte da zero anche
-- quando la risposta la sapevamo già.
create table if not exists forniture (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid references auth.users(id) on delete set null default auth.uid(),
  -- CHI fornisce. Il nome è sempre scritto (resta leggibile anche se la scheda
  -- viene unita o cancellata); l'identità vera è l'id del registro, quando c'è.
  fornitore     text not null check (length(btrim(fornitore)) > 0),
  fornitore_anagrafiche_id text,
  fornitore_place_id uuid references places(id) on delete set null,
  -- COSA fornisce, e a quali condizioni.
  titolo        text not null check (length(btrim(titolo)) > 0),
  descrizione   text,
  -- La linea di servizio a cui appartiene (catalogo `lines`): serve a cercare
  -- «chi mi fa i fiori» senza leggere tutte le schede.
  linea         text,
  -- ⚠️ Il prezzo è FACOLTATIVO e non è un impegno: è il riferimento che ci
  -- hanno dato. Zero non vuol dire gratis, vuol dire «non lo so»: si lascia
  -- vuoto. `prezzo_note` dice a cosa si riferisce (a pezzo, al kg, a persona).
  prezzo        numeric check (prezzo > 0),
  prezzo_note   text,
  tempi         text,          -- «48 ore», «3 giorni lavorativi»
  minimo_ordine text,          -- «minimo 20 pezzi»
  zona          text,          -- dove arriva
  -- Dove sta il documento vero (listino PDF, catalogo, cartella): un link, non
  -- una copia — i file vivono dove sono già.
  allegato_url  text,
  note          text,
  attiva        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table forniture enable row level security;

-- Stessa forma delle altre tabelle di squadra: si vedono tutte, si scrive sulle
-- proprie o su quelle senza padrone. Una fornitura è sapere condiviso: se la
-- vedesse solo chi l'ha scritta non servirebbe a niente.
drop policy if exists forniture_select on forniture;
create policy forniture_select on forniture for select to authenticated using (true);

drop policy if exists forniture_write on forniture;
create policy forniture_write on forniture
  for all to authenticated
  using (owner = auth.uid() or owner is null)
  with check (owner = auth.uid() or owner is null);

create index if not exists forniture_fornitore_idx on forniture (fornitore);
create index if not exists forniture_linea_idx on forniture (linea) where attiva;

-- «Modificata il» deve dire la verità: senza il trigger resta per sempre la
-- data di creazione (stessa trappola già vista sulle richieste cliente).
create or replace function forniture_tocca_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists forniture_updated_at on forniture;
create trigger forniture_updated_at before update on forniture
  for each row execute function forniture_tocca_updated_at();
