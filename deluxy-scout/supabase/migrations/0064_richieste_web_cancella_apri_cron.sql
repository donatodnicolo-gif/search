-- Deluxy Scout — 0064: le Richieste Web si cancellano, si aprono, e si importano da sole.
-- Idempotente. La applica scripts/allinea-supabase.mjs (o il workflow al push).
--
-- Tre cose chieste dall'utente il 21/08/2026 sulla schermata /lead:
-- «fai import automatico ogni giorno, consenti di cancellare mail o aprire nel
--  dettaglio la mail, più opzioni di creare contatto e trattativa».

-- ① CANCELLARE. ⚠️ `leads` aveva policy per select/insert/update ma **nessuna
--    per la DELETE**: il bottone «elimina» avrebbe cancellato zero righe SENZA
--    errore (una delete che non trova nulla non è un errore in Postgres), e la
--    richiesta sarebbe ricomparsa al ricaricamento. Stessa apertura delle
--    altre: la coda è del team, non di chi l'ha importata.
drop policy if exists leads_delete on leads;
create policy leads_delete on leads for delete to authenticated using (true);

-- ② APRIRE LA MAIL. Serve l'id INTERNO di AI Mail (quello dell'URL
--    /messaggio/<id>), che è cosa diversa dal Message-ID della posta salvato in
--    `mail_id` — quello serve a non reimportare due volte, ma non apre niente.
alter table leads add column if not exists mail_ref text;
comment on column leads.mail_ref is
  'Id del messaggio dentro AI Mail: apre https://deluxy-mail.vercel.app/messaggio/<id>. Diverso da mail_id, che è il Message-ID della posta e serve solo contro i doppioni.';

-- ③ IMPORT AUTOMATICO OGNI GIORNO, alle 05:00 UTC (le 7 in Italia d'estate):
--    la coda è pronta prima che qualcuno apra l'app.
--
--    ⚠️ LA CHIAVE NON STA QUI DENTRO. Il job la legge al volo da `chiavi_app`
--    (riga `_ingresso`, la stessa che l'admin genera da Profilo → Impostazioni):
--    scriverla nel file avrebbe messo un segreto dentro il repository, dove
--    resta anche dopo averlo cambiato. È la differenza con la 0009, che la
--    chiave (anon) ce l'ha in chiaro.
--
--    ⚠️ E il job serve DAVVERO: il workflow GitHub che importa le anagrafiche
--    non parte mai, perché gli `schedule` di GitHub girano solo dal branch di
--    default e lì i workflow non ci sono. pg_cron gira nel database, che il
--    branch non ce l'ha.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'import-richieste-web') then
    perform cron.unschedule('import-richieste-web');
  end if;
end $$;

select cron.schedule('import-richieste-web', '0 5 * * *', $job$
  select net.http_post(
    url := 'https://fdsziebgkljfsugqqbqd.supabase.co/functions/v1/mail',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-api-key', coalesce((select chiave from chiavi_app where app = '_ingresso'), '')
    ),
    body := jsonb_build_object('azione', 'richieste', 'limite', 100)
  );
$job$);
