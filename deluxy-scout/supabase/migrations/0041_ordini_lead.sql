-- Deluxy Scout — 0041: ordini (dalla trattativa vinta) e lead web (inbox di
-- qualificazione). Idempotente. Applicare con scripts/mgmt-query.mjs.
--
-- docs/VISIONE-COMMERCIALE.md: il funnel finisce in un ORDINE, non in una fase
-- di deal; i lead da internet entrano in una CODA di qualificazione prima di
-- diventare trattative.

-- ── ORDINI ────────────────────────────────────────────────────────────────────
-- La trattativa vinta genera un ordine: cosa è stato venduto, a chi, per quanto,
-- e se è stato incassato. È il registro che risponde a "quanto abbiamo chiuso",
-- distinto dalla pipeline (che risponde a "quanto stiamo trattando").
create table if not exists ordini (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid references deals(id) on delete set null,
  place_id      uuid references places(id) on delete set null,
  cliente       text not null,             -- nome del negozio/cliente al momento della vinta
  descrizione   text,                      -- cosa è stato venduto (dall'oggetto della trattativa)
  valore        numeric(12,2),
  canale        text,                      -- ereditato dalla trattativa: quale attività l'ha prodotto
  linea         text,
  stato         text not null default 'da_incassare'
                check (stato in ('da_incassare', 'incassato', 'annullato')),
  incassato_il  date,
  owner         uuid references auth.users(id) default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists ordini_stato_ix on ordini (stato, created_at desc);
create unique index if not exists ordini_deal_uix on ordini (deal_id) where deal_id is not null;

alter table ordini enable row level security;
-- Dati di squadra, come deals: tutti gli autenticati leggono e scrivono.
do $$ begin
  create policy ordini_select on ordini for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ordini_insert on ordini for insert to authenticated with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ordini_update on ordini for update to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- ── LEAD WEB ──────────────────────────────────────────────────────────────────
-- I lead da internet (form del sito, mail, social) entrano qui come coda di
-- qualificazione: nuovo → qualificato (nasce la trattativa) | scartato.
create table if not exists leads (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,              -- chi ci ha contattato (persona o azienda)
  contatto     text,                       -- email o telefono
  fonte        text not null default 'altro'
               check (fonte in ('sito', 'mail', 'social', 'passaparola', 'altro')),
  messaggio    text,                       -- cosa chiede
  stato        text not null default 'nuovo'
               check (stato in ('nuovo', 'qualificato', 'scartato')),
  place_id     uuid references places(id) on delete set null,  -- negozio agganciato
  deal_id      uuid references deals(id) on delete set null,   -- trattativa generata
  owner        uuid references auth.users(id),                 -- chi lo sta lavorando
  created_at   timestamptz not null default now(),
  lavorato_il  timestamptz
);
create index if not exists leads_stato_ix on leads (stato, created_at desc);

alter table leads enable row level security;
do $$ begin
  create policy leads_select on leads for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy leads_insert on leads for insert to authenticated with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy leads_update on leads for update to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

comment on table ordini is 'Registro degli ordini generati dalle trattative vinte: quanto abbiamo chiuso (vs pipeline = quanto stiamo trattando).';
comment on table leads is 'Coda di qualificazione dei lead da internet: nuovo → qualificato (trattativa, canale web) | scartato.';
