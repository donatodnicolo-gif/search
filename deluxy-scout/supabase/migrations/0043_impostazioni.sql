-- Deluxy Scout — 0043: impostazioni dell'app modificabili dall'app.
-- Idempotente. Applicare con scripts/mgmt-query.mjs.
--
-- Finora la casella delle Richieste Web viveva in un secret di Supabase: per
-- cambiarla serviva la CLI. Le impostazioni "di prodotto" devono stare nel DB,
-- così le regola un amministratore da Profilo → Impostazioni. I SEGRETI (chiavi
-- API, password) restano nei secret: qui dentro non ci va nulla di riservato.

create table if not exists impostazioni (
  chiave      text primary key,
  valore      text,
  aggiornato_il timestamptz not null default now(),
  aggiornato_da uuid references auth.users(id)
);

alter table impostazioni enable row level security;

-- Le leggono tutti gli autenticati (servono alle schermate); le scrive l'admin.
do $$ begin
  create policy impostazioni_select on impostazioni for select to authenticated using (true);
exception when duplicate_object then null; end $$;

drop policy if exists impostazioni_write on impostazioni;
create policy impostazioni_write on impostazioni
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'nicolo.donato@deluxy.it')
  with check ((auth.jwt() ->> 'email') = 'nicolo.donato@deluxy.it');

-- Valore iniziale: la casella da cui arrivano le Richieste Web.
insert into impostazioni (chiave, valore)
values ('mail.casella_richieste', 'commerciale@deluxy.it')
on conflict (chiave) do nothing;

comment on table impostazioni is 'Impostazioni di prodotto modificabili dall''app (Profilo → Impostazioni). Mai segreti: quelli stanno nei secret delle Edge Function.';
