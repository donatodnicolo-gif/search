-- 0069 — RICHIESTE CLIENTI: le richieste saltuarie che arrivano al commerciale.
--
-- Decisione dell'utente (26/08/2026, artifact «Architettura Commerciale Deluxy»).
-- Un cliente che c'è già chiede una fornitura una tantum: oggi il commerciale
-- non aveva DOVE scriverla. Le due strade esistenti erano tutte e due sbagliate:
--   · aprire una trattativa → la pipeline si riempie di evasioni, e la stessa
--     vendita varrebbe due volte (come trattativa e come incasso). La regola
--     del binario dice: si evade alle condizioni note = ordine, non trattativa;
--   · usare le richieste di pagamento → sono l'anello DOPO (chiedere i soldi),
--     e pretendono un importo che al momento della richiesta spesso non c'è.
--
-- Quindi una casa propria, che sta PRIMA dell'incasso e FUORI dalla pipeline.
--
-- ⚠️ Qui non si misura niente: il registro dei risultati è FINANCE (proforma →
-- fattura). Questa tabella è il lavoro del commerciale, e tiene solo il
-- RIFERIMENTO al documento (numero e url della pro-forma), mai una sua copia.
create table if not exists richieste_cliente (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null references auth.users(id) on delete cascade default auth.uid(),
  -- Il cliente in Scout, quando c'è: la richiesta nasce quasi sempre da uno che
  -- conosciamo già. Resta facoltativo perché il nome lo si ha comunque, e
  -- bloccare l'inserimento su un aggancio mancante vorrebbe dire perdere la
  -- richiesta (o inventare una scheda).
  place_id      uuid references places(id) on delete set null,
  -- ⚠️ Il nome SEMPRE, anche con place_id valorizzato: è quello che va a
  -- FINANCE per emettere il documento (là il partner si risolve per nome), e
  -- deve restare leggibile anche se la scheda in Scout viene unita o cancellata.
  cliente       text not null check (length(btrim(cliente)) > 0),
  descrizione   text not null check (length(btrim(descrizione)) > 0),
  -- ⚠️ FACOLTATIVO di proposito: «Tiffany chiede un catering per 40 persone» si
  -- scrive prima di sapere quanto costa. Zero non è «non lo so»: si lascia
  -- vuoto, e la fattura non si può chiedere finché non c'è.
  importo       numeric check (importo > 0),
  -- Come è arrivata la richiesta (serve al commerciale, non al budget).
  canale        text not null default 'altro'
                check (canale in ('mail', 'telefono', 'whatsapp', 'di_persona', 'web', 'altro')),
  -- L'etichetta di BUDGET decisa il 26/08: digitale in origine = «maison»,
  -- ricorrenti = «b2b». Default b2b perché questa schermata è dei clienti che
  -- ci sono già. Viaggerà verso FINANCE quando là esisteranno i due campi.
  tipologia     text not null default 'b2b' check (tipologia in ('maison', 'b2b')),
  -- nuova = da lavorare · concordata = prezzo pattuito, si può chiedere il
  -- documento · fatturata = la pro-forma è stata saldata · persa = non se ne fa
  -- niente (e si dice perché, nella nota).
  stato         text not null default 'nuova'
                check (stato in ('nuova', 'concordata', 'fatturata', 'persa')),
  -- Quando gli serve: una richiesta senza data non si sa quando è in ritardo.
  serve_entro   date,
  nota          text,
  -- Il riferimento al documento in FINANCE (non una copia: numero e link).
  proforma_numero text,
  proforma_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table richieste_cliente enable row level security;

-- Stessa forma delle trattative (0002): la squadra commerciale lavora sulle
-- stesse richieste, quindi si vedono tutte; si scrive sulle proprie o su
-- quelle non attribuite — una richiesta che nessuno ha preso in carico deve
-- poterla portare avanti chiunque, o resta ferma quando chi l'ha scritta è
-- in ferie.
drop policy if exists richieste_cliente_select on richieste_cliente;
create policy richieste_cliente_select on richieste_cliente
  for select to authenticated using (true);

drop policy if exists richieste_cliente_write on richieste_cliente;
create policy richieste_cliente_write on richieste_cliente
  for all to authenticated
  using (owner = auth.uid() or owner is null)
  with check (owner = auth.uid() or owner is null);

create index if not exists richieste_cliente_stato_ix
  on richieste_cliente (stato, created_at desc);
create index if not exists richieste_cliente_place_ix
  on richieste_cliente (place_id);

-- `updated_at` non si aggiorna da solo: senza questo, «modificata il» resta
-- per sempre la data di creazione e nessuno se ne accorge.
create or replace function tocca_richieste_cliente()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists richieste_cliente_tocca on richieste_cliente;
create trigger richieste_cliente_tocca before update on richieste_cliente
  for each row execute function tocca_richieste_cliente();
