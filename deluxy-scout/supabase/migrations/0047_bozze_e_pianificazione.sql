-- Deluxy Scout — 0047: le bozze di visita non si perdono, e la visita si può
-- pianificare. Idempotente. Applicare con scripts/mgmt-query.mjs.
--
-- DUE COSE, tutte e due sul "prima e dopo" della visita.
--
-- 1. BOZZE. Il pop-up della visita chiedeva esito, contatto e note, ma se lo si
--    chiudeva senza premere «Salva» **tutto quello che era stato scritto
--    spariva**. «Compila dopo» segnava solo il flag `places.da_completare`: si
--    ritrovava il negozio, non le parole. Sul campo — con una mano sola, in
--    piedi in un negozio — è la cosa più facile del mondo da perdere.
--    Qui la bozza si salva da sola: una riga per negozio, riscritta ogni volta.
--
-- 2. PIANIFICAZIONE. Un Selezionato si lavora andandoci: `visita_pianificata`
--    dice **quando si ha intenzione di andarci**, prima e indipendentemente dal
--    fatto che ci si vada davvero. Non confondere con `visits.data`, che è
--    quando ci si è andati per davvero.

-- ── 1. BOZZE DI VISITA ────────────────────────────────────────────────────────
create table if not exists bozze_visita (
  place_id    uuid primary key references places(id) on delete cascade,
  esito       text,
  note        text,
  concorrenti text,
  -- Il contatto raccolto sul posto, ancora da confermare: finché la visita non
  -- è salvata NON diventa una riga di `contacts`, altrimenti mezza rubrica si
  -- riempirebbe di nomi presi male.
  nome        text,
  ruolo       text,
  telefono    text,
  email       text,
  decisore    boolean not null default false,
  owner       uuid references auth.users(id) default auth.uid(),
  updated_at  timestamptz not null default now()
);

comment on table bozze_visita is
  'Il pop-up della visita a metà: si salva da solo mentre si scrive, si cancella quando la visita viene registrata.';

alter table bozze_visita enable row level security;

-- Una bozza è di chi la sta scrivendo: al team serve la visita finita, non gli
-- appunti a metà di un collega (che verrebbero anche sovrascritti a vicenda).
drop policy if exists bozze_visita_all on bozze_visita;
create policy bozze_visita_all on bozze_visita for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid() or owner is null);

-- ── 2. VISITA PIANIFICATA ─────────────────────────────────────────────────────
alter table places add column if not exists visita_pianificata date;

comment on column places.visita_pianificata is
  'Quando si ha intenzione di andarci. Il fatto compiuto sta in visits.data.';

-- Serve a «cosa devo fare questa settimana»: poche righe con la data, tante
-- senza — l'indice parziale le ignora del tutto.
create index if not exists places_visita_pianificata_ix
  on places (visita_pianificata)
  where visita_pianificata is not null;
