-- Deluxy Scout — 0065: la Copertura si salva e si aggiorna da sola ogni giorno.
-- Idempotente. La applica scripts/allinea-supabase.mjs (o il workflow al push).
--
-- PERCHÉ. Aprire «Affiliazioni · Copertura» faceva ogni volta due chiamate
-- lente: il registro Anagrafiche (1056 partner, sei pagine) e Deluxy Orders (il
-- venduto per provincia). Segnalato dall'utente il 23/08/2026: «puoi evitare il
-- ricalcolo ogni volta? salva la vista e aggiorna ogni giorno».
--
-- COSA SI SALVA: i **dati grezzi** delle due chiamate, non la tabella già
-- calcolata. Il conto (sigla della provincia, attivi, in lavorazione, somme)
-- resta dov'è sempre stato, nel client: se si salvasse il risultato, la stessa
-- regola vivrebbe in due posti — qui in SQL e là in TypeScript — e al primo
-- ritocco direbbero due cose diverse. È lo stesso motivo per cui la tabella
-- delle province è un componente solo e non due copie.
create table if not exists copertura_cache (
  chiave text primary key,          -- 'partner' | 'vendite:<periodo>'
  dati jsonb not null,
  aggiornato_il timestamptz not null default now()
);

comment on table copertura_cache is
  'Risposte grezze del registro e di Orders per la vista Copertura. Si aggiorna da sola ogni notte; il calcolo resta nel client.';

alter table copertura_cache enable row level security;

-- Leggono tutti gli autenticati (è la vista che serve a chiunque apra la
-- schermata); scrive solo il service_role, cioè la Edge Function del cron.
drop policy if exists copertura_cache_read on copertura_cache;
create policy copertura_cache_read on copertura_cache for select to authenticated using (true);

-- ⚠️ Nessuna policy di INSERT/UPDATE per gli utenti: senza, un client non può
-- riempirla — ed è voluto. Il dato deve venire da un posto solo, se no due
-- schermate aperte insieme si sovrascrivono a vicenda con periodi diversi.

-- Aggiornamento notturno alle 04:40 UTC: prima dell'import delle richieste
-- (05:00) e prima che qualcuno apra l'app.
-- La chiave non sta nel file: il job la legge da `chiavi_app` al momento.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'aggiorna-copertura') then
    perform cron.unschedule('aggiorna-copertura');
  end if;
end $$;

select cron.schedule('aggiorna-copertura', '40 4 * * *', $job$
  select net.http_post(
    url := 'https://fdsziebgkljfsugqqbqd.supabase.co/functions/v1/ordini',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-api-key', coalesce((select chiave from chiavi_app where app = '_ingresso'), '')
    ),
    body := jsonb_build_object('action', 'aggiorna_copertura')
  );
$job$);
