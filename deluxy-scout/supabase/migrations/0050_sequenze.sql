-- Deluxy Scout — 0050: le SEQUENZE, cioè i solleciti che si ricordano da soli.
-- Idempotente. Applicare con scripts/mgmt-query.mjs (o allinea-supabase.mjs).
--
-- Il problema: la prima mail parte, e poi? Il secondo colpo lo si manda «quando
-- ci si ricorda», cioè quasi mai — e i negozi che non hanno risposto restano lì
-- senza che nessuno decida niente. Una sequenza è la risposta scritta una volta
-- sola: primo testo, aspetta N giorni, secondo testo, aspetta ancora, terzo.
--
-- ⚠️ LA REGOLA CHE CONTA PIÙ DI TUTTE: **se il cliente risponde, la sequenza si
-- ferma.** Un sollecito che arriva dopo la risposta non è un sollecito, è una
-- figuraccia — e con gli invii automatici succede al primo giorno di
-- distrazione. La risposta si verifica leggendo la posta (Edge Function `mail`
-- → AI Mail) PRIMA di ogni invio, non a campione.

-- ── LA SEQUENZA ───────────────────────────────────────────────────────────────
create table if not exists sequenze (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  descrizione text,
  -- Spenta = non parte più niente, ma le iscrizioni restano (si può riaccendere
  -- senza rifare tutto).
  attiva      boolean not null default true,
  owner       uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now()
);

-- ── I PASSI ───────────────────────────────────────────────────────────────────
-- Ogni passo è «quale testo» + «quanti giorni dopo il precedente».
create table if not exists sequenza_passi (
  id            uuid primary key default gen_random_uuid(),
  sequenza_id   uuid not null references sequenze(id) on delete cascade,
  ordine        int not null,
  script_id     uuid references script_email(id) on delete set null,
  -- Giorni di attesa PRIMA di questo passo, contati dal passo precedente (o
  -- dall'iscrizione, per il primo). 0 = subito.
  giorni_attesa int not null default 0,
  created_at    timestamptz not null default now(),
  unique (sequenza_id, ordine)
);

-- ── CHI È DENTRO ──────────────────────────────────────────────────────────────
create table if not exists sequenza_iscrizioni (
  id             uuid primary key default gen_random_uuid(),
  sequenza_id    uuid not null references sequenze(id) on delete cascade,
  place_id       uuid not null references places(id) on delete cascade,
  -- Quanti passi sono già stati mandati. 0 = non è ancora partito niente.
  passi_fatti    int not null default 0,
  -- Quando tocca al prossimo passo. NULL = niente in programma (finita/ferma).
  prossimo_il    date,
  -- attiva | risposto | finita | ferma
  --   risposto = il cliente ha scritto: si ferma da sé, ed è il caso normale
  --              di successo, non un errore;
  --   ferma    = fermata a mano.
  stato          text not null default 'attiva',
  -- Perché si è fermata, in parole: si legge nella scheda senza indovinare.
  motivo         text,
  ultimo_invio_il timestamptz,
  owner          uuid references auth.users(id) default auth.uid(),
  created_at     timestamptz not null default now(),
  -- Lo stesso negozio non entra due volte nella stessa sequenza: sarebbero due
  -- solleciti in parallelo allo stesso indirizzo.
  unique (sequenza_id, place_id)
);

create index if not exists sequenza_iscrizioni_coda_ix
  on sequenza_iscrizioni (prossimo_il)
  where stato = 'attiva' and prossimo_il is not null;

-- ── STORICO DEGLI INVII ───────────────────────────────────────────────────────
-- Cosa è partito davvero, e quando. Serve a due cose: non mandare due volte lo
-- stesso passo, e poter dire a chi guarda «l'ultima mail è di 6 giorni fa».
create table if not exists sequenza_invii (
  id            uuid primary key default gen_random_uuid(),
  iscrizione_id uuid not null references sequenza_iscrizioni(id) on delete cascade,
  passo_ordine  int not null,
  script_id     uuid references script_email(id) on delete set null,
  destinatari   text[],
  inviate       int not null default 0,
  errore        text,
  created_at    timestamptz not null default now(),
  unique (iscrizione_id, passo_ordine)
);

comment on table sequenze is 'Solleciti a più passi: quale testo, dopo quanti giorni. Si fermano da sé quando il cliente risponde.';

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Team condiviso in lettura (le sequenze sono dell'azienda, non della persona);
-- scrittura a chi è autenticato. Stesse regole del resto dell'app.
alter table sequenze enable row level security;
alter table sequenza_passi enable row level security;
alter table sequenza_iscrizioni enable row level security;
alter table sequenza_invii enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sequenze', 'sequenza_passi', 'sequenza_iscrizioni', 'sequenza_invii'] loop
    execute format('drop policy if exists %I_select on %I', t, t);
    execute format('create policy %I_select on %I for select to authenticated using (true)', t, t);
    execute format('drop policy if exists %I_write on %I', t, t);
    execute format('create policy %I_write on %I for all to authenticated using (true) with check (true)', t, t);
  end loop;
end $$;
