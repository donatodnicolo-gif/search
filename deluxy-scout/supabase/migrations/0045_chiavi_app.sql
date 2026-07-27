-- Deluxy Scout — 0044: le chiavi API delle altre app Deluxy.
-- Idempotente. Applicare con scripts/mgmt-query.mjs.
--
-- Scout deve poter chiamare le altre app dell'ecosistema (Anagrafiche, Orders,
-- Tasks, Scripts…) e ognuna vuole la sua chiave. Finora si mettevano nei secret
-- delle Edge Function: per cambiarne una serviva la riga di comando.
--
-- ⚠️ Perché una tabella NUOVA e non `impostazioni` (0043): quella la leggono
-- TUTTI gli autenticati (`select … using (true)`), e infatti dice a chiare
-- lettere che i segreti non ci vanno. Qui invece **legge e scrive solo
-- l'amministratore**: una chiave di Anagrafiche in mano a ogni venditore
-- varrebbe come dargli l'accesso al registro.
--
-- Le chiamate vere restano lato server (Edge Function con service role, che
-- bypassa la RLS): l'app dei venditori non deve mai ricevere la chiave.

create table if not exists chiavi_app (
  app           text primary key,          -- 'anagrafiche', 'orders', 'tasks', …
  url_base      text,                      -- se vuoto si usa il default dell'app
  chiave        text,                      -- il segreto: mai esposto al client
  note          text,
  aggiornato_il timestamptz not null default now(),
  aggiornato_da uuid references auth.users(id)
);

alter table chiavi_app enable row level security;

-- Un'unica policy: tutto (lettura compresa) solo all'amministratore.
drop policy if exists chiavi_app_admin on chiavi_app;
create policy chiavi_app_admin on chiavi_app
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'nicolo.donato@deluxy.it')
  with check ((auth.jwt() ->> 'email') = 'nicolo.donato@deluxy.it');

-- Vista per la schermata: dice SE la chiave c'è, non qual è — così l'elenco
-- "app collegate" non fa mai viaggiare il segreto, nemmeno verso l'admin.
--
-- `security_invoker = true` è obbligatorio: senza, una vista in Postgres gira
-- con i privilegi di chi l'ha creata e **scavalca la RLS** della tabella sotto,
-- rendendo l'elenco visibile a tutti gli autenticati.
create or replace view chiavi_app_stato
  with (security_invoker = true) as
  select app, url_base, note, aggiornato_il, (chiave is not null and chiave <> '') as configurata
  from chiavi_app;
