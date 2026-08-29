-- Deluxy Scout — 0106: la PIANIFICAZIONE COMMERCIALE per linea, e il responsabile.
-- Idempotente. Applicare con: node scripts/mgmt-query.mjs supabase/migrations/0106_pianificazione_commerciale.sql
--
-- Richiesta dell'utente (29/08/2026): «trasforma Da fare in Pianificazione.
-- Mostra in primis un calendario dove il responsabile (indicato con un flag
-- nei team) deve fare una pianificazione commerciale per linea con target e
-- obiettivi di conversione».
--
-- Il disegno segue la pratica dei piani vendita B2B: target di RICAVO per
-- periodo e per linea, più un obiettivo di CONVERSIONE (trattative → ordini)
-- che rende il target verificabile — dal target e dalla conversione si ricava
-- a ritroso quanta pipeline serve, e ogni mese si confronta piano e reale.

-- Il flag del responsabile vive sul profilo: è CHI può scrivere il piano.
alter table profiles add column if not exists responsabile boolean not null default false;
comment on column profiles.responsabile is
  'Responsabile commerciale: e'' l''unico (oltre all''amministratore) che scrive la pianificazione per linea. Lo assegna l''amministratore dalla schermata Team.';

-- Una riga = un mese × una linea. UNA sola pianificazione per coppia: il piano
-- e'' condiviso, non personale (unique, e l''upsert non crea doppioni).
create table if not exists pianificazioni_commerciali (
  id uuid primary key default gen_random_uuid(),
  mese date not null,                    -- primo giorno del mese pianificato
  linea text not null,                   -- la linea di business (catalogo LINEE di Scout)
  target_valore numeric,                 -- € IVA esclusa attesi dagli ordini del mese
  obiettivo_conversione numeric,         -- % obiettivo trattative -> ordini nel mese
  nota text,
  creato_da uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (mese, linea)
);

alter table pianificazioni_commerciali enable row level security;

-- Tutti leggono il piano (e'' la bussola della squadra); scrive SOLO chi ha il
-- flag responsabile o l''amministratore (stessa email del gate di Team —
-- deny-by-default, Libro Sicurezza).
drop policy if exists pianificazioni_read on pianificazioni_commerciali;
create policy pianificazioni_read on pianificazioni_commerciali
  for select to authenticated using (true);

drop policy if exists pianificazioni_insert on pianificazioni_commerciali;
create policy pianificazioni_insert on pianificazioni_commerciali
  for insert to authenticated
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.responsabile)
    or (auth.jwt() ->> 'email') = 'nicolo.donato@deluxy.it'
  );

drop policy if exists pianificazioni_update on pianificazioni_commerciali;
create policy pianificazioni_update on pianificazioni_commerciali
  for update to authenticated
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.responsabile)
    or (auth.jwt() ->> 'email') = 'nicolo.donato@deluxy.it'
  )
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.responsabile)
    or (auth.jwt() ->> 'email') = 'nicolo.donato@deluxy.it'
  );

drop policy if exists pianificazioni_delete on pianificazioni_commerciali;
create policy pianificazioni_delete on pianificazioni_commerciali
  for delete to authenticated
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.responsabile)
    or (auth.jwt() ->> 'email') = 'nicolo.donato@deluxy.it'
  );
