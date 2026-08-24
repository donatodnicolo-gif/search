-- 0068 — Il cron HubSpot torna vivo, e si autentica come si deve.
--
-- STORIA (audit 24/08/2026): il job `sync-hubspot-crm` era nato nella 0009 con
-- la sola anon key negli header. Quando il 23/08 la correzione di sicurezza ha
-- messo l'auth di `hubspot-match` PRIMA dello smistamento delle azioni, quel
-- job ha cominciato a prendersi 401 ogni notte — in silenzio: il mirror
-- HubSpot ha semplicemente smesso di aggiornarsi e nessun errore è arrivato a
-- nessuno. Lezione: quando si chiude una falla d'auth, i chiamanti interni che
-- usavano il canale debole vanno censiti e migrati nello stesso giro.
--
-- Qui si rifà il job con la chiave d'ingresso letta a runtime da
-- `chiavi_app._ingresso` (stesso stampo della 0064: niente segreti nel file,
-- niente segreti nella storia git). La 0009 resta nella storia ma il suo job
-- viene sostituito; la chiave che contiene è la anon/publishable, pubblica per
-- progettazione.
--
-- Idempotente: si può rilanciare (unschedule se esiste, poi schedule).

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-hubspot-crm') then
    perform cron.unschedule('sync-hubspot-crm');
  end if;
end $$;

select cron.schedule('sync-hubspot-crm', '0 4 * * *', $job$
  select net.http_post(
    url := 'https://fdsziebgkljfsugqqbqd.supabase.co/functions/v1/hubspot-match',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-api-key', coalesce((select chiave from chiavi_app where app = '_ingresso'), '')
    ),
    body := jsonb_build_object('action', 'sync_crm')
  );
$job$);
