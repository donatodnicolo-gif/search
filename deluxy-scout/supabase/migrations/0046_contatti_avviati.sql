-- Deluxy Scout — 0046: il registro dei contatti avviati (a chi abbiamo scritto).
-- Idempotente. Applicare con scripts/mgmt-query.mjs.
--
-- Serve a rispondere a una domanda che finora l'app non sapeva rispondere:
-- «a questo negozio abbiamo già scritto?». La mail partiva dall'app (Edge
-- Function `invio-email`) e non lasciava traccia da nessuna parte — la stessa
-- lista rischiava di essere ricontattata due volte, e soprattutto un negozio
-- appena scritto restava indistinguibile da uno mai toccato.
--
-- È la fonte del livello LEAD: selezionato + contatto avviato.
--
-- ⚠️ Le chiamate (`chiamate`) e le visite (`visits`) hanno già il loro registro:
-- qui NON si duplicano. Questa tabella copre i canali che una traccia non ce
-- l'hanno: email, WhatsApp, il **web** (ci ha scritto lui dal sito o dai
-- social) e tutto il resto.

create table if not exists contatti_avviati (
  id          uuid primary key default gen_random_uuid(),
  place_id    uuid not null references places(id) on delete cascade,
  canale      text not null,
  -- Con quale testo: serve a sapere cosa gli è già stato detto prima di
  -- riscrivergli la stessa cosa.
  script_id   uuid references script_email(id) on delete set null,
  oggetto     text,
  destinatari text[],                       -- a chi è partita davvero
  owner       uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now()
);

-- I canali ammessi stanno in un constraint a parte, ricreato a ogni esecuzione:
-- `create table if not exists` non tocca una tabella che esiste già, quindi
-- aggiungerne uno (è successo con 'web') non sarebbe mai arrivato a chi aveva
-- applicato la migrazione prima. Così questo file resta **rieseguibile**.
alter table contatti_avviati drop constraint if exists contatti_avviati_canale_ck;
alter table contatti_avviati add constraint contatti_avviati_canale_ck
  check (canale in ('email', 'whatsapp', 'web', 'altro'));

create index if not exists contatti_avviati_place_ix
  on contatti_avviati (place_id, created_at desc);

comment on table contatti_avviati is
  'Contatti avviati che non hanno un registro proprio (email, WhatsApp). Chiamate e visite stanno in `chiamate` e `visits`.';

alter table contatti_avviati enable row level security;

-- Team condiviso: tutti gli autenticati leggono; ognuno inserisce a proprio nome.
-- Stesse regole di `chiamate` (0017).
drop policy if exists contatti_avviati_select on contatti_avviati;
create policy contatti_avviati_select on contatti_avviati for select to authenticated using (true);

drop policy if exists contatti_avviati_insert on contatti_avviati;
create policy contatti_avviati_insert on contatti_avviati for insert to authenticated
  with check (owner = auth.uid() or owner is null);
