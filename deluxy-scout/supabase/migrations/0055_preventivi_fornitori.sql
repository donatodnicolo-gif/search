-- Deluxy Scout — 0055: i PREVENTIVI DEI FORNITORI per i lavori che ci chiedono.
-- Idempotente. Applicare con scripts/allinea-supabase.mjs (o mgmt-query.mjs).
--
-- Il problema: un cliente chiede un lavoro specifico — un allestimento, una
-- fornitura fuori standard, un evento — e per rispondergli si chiedono i prezzi
-- a due o tre fornitori. Quei numeri finora vivevano in WhatsApp e nella
-- memoria di chi li ha chiesti: dopo una settimana nessuno sapeva più chi
-- avesse offerto cosa, e la stessa richiesta si rifaceva da capo.
--
-- Due tabelle, e la separazione è il punto: **il lavoro è uno, i preventivi
-- sono tanti**. Tenerli in una riga sola vorrebbe dire non poterli confrontare,
-- che è esattamente la ragione per cui si chiedono.

-- ── IL LAVORO CHIESTO ─────────────────────────────────────────────────────────
create table if not exists lavori (
  id           uuid primary key default gen_random_uuid(),
  titolo       text not null,                                   -- cosa ci hanno chiesto
  descrizione  text,
  -- Chi l'ha chiesto e a quale trattativa appartiene. Entrambi facoltativi: un
  -- lavoro può arrivare prima che esista una trattativa, ed è anzi il caso
  -- normale — il preventivo serve proprio a poterla aprire.
  place_id     uuid references places(id) on delete set null,
  deal_id      uuid references deals(id) on delete set null,
  linea        text,                                            -- linea di servizio
  serve_entro  date,                                            -- quando serve la risposta
  stato        text not null default 'aperto'
               check (stato in ('aperto', 'chiuso', 'annullato')),
  note         text,
  owner        uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists lavori_stato_ix on lavori (stato, serve_entro);
create index if not exists lavori_place_ix on lavori (place_id);

comment on table lavori is 'Lavori specifici chiesti da un cliente, per cui si chiedono preventivi ai fornitori.';

-- ── I PREVENTIVI ──────────────────────────────────────────────────────────────
create table if not exists preventivi (
  id            uuid primary key default gen_random_uuid(),
  lavoro_id     uuid not null references lavori(id) on delete cascade,
  -- Il fornitore per NOME, più il collegamento al negozio in Scout quando c'è.
  -- ⚠️ Il nome resta scritto anche col collegamento: un preventivo è un
  -- documento di un momento, e deve restare leggibile anche se domani quel
  -- negozio viene rinominato o cancellato.
  fornitore           text not null,
  fornitore_place_id  uuid references places(id) on delete set null,
  -- NULL = glielo abbiamo chiesto ma non ha ancora risposto. È uno stato vero,
  -- non un dato mancante: distinguerlo da «zero» è il motivo per cui la colonna
  -- non ha un default.
  importo       numeric(12,2) check (importo is null or importo >= 0),
  tempi         text,                                           -- «3 giorni», «entro il 12»
  valido_fino   date,
  note          text,
  allegato_url  text,                                           -- link al PDF/foto del preventivo
  stato         text not null default 'richiesto'
                check (stato in ('richiesto', 'ricevuto', 'scelto', 'scartato')),
  owner         uuid references auth.users(id) default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists preventivi_lavoro_ix on preventivi (lavoro_id, created_at);

-- Un lavoro ha UN fornitore scelto, non due. L'indice parziale lo impone nel
-- database: farlo rispettare solo dall'app vuol dire non farlo rispettare.
create unique index if not exists preventivi_scelto_uix
  on preventivi (lavoro_id) where stato = 'scelto';

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Dati di squadra, come `deals` e `ordini`: il preventivo di un fornitore serve
-- a chiunque debba rispondere a quel cliente, non solo a chi l'ha chiesto.
alter table lavori     enable row level security;
alter table preventivi enable row level security;

do $$
declare t text;
begin
  foreach t in array array['lavori', 'preventivi'] loop
    execute format('drop policy if exists %I_select on %I', t, t);
    execute format('create policy %I_select on %I for select to authenticated using (true)', t, t);
    execute format('drop policy if exists %I_write on %I', t, t);
    execute format('create policy %I_write on %I for all to authenticated using (true) with check (true)', t, t);
  end loop;
end $$;
