-- Deluxy Scout — 0009: sincronizzazione HubSpot RICORRENTE (giornaliera) via pg_cron.
-- Chiama la Edge Function hubspot-sync (action sync_crm) ogni notte alle 04:00 UTC.
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
      'apikey', 'sb_publishable_MstzQCDKNm_OQ4XmLIOBUQ_yqysDV8f',
      'Authorization', 'Bearer sb_publishable_MstzQCDKNm_OQ4XmLIOBUQ_yqysDV8f'
    ),
    body := jsonb_build_object('action', 'sync_crm')
  );
$job$);
