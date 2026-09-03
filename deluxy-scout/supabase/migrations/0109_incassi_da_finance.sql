-- 0109 — FINANCE DICE A SCOUT COSA È STATO PAGATO (31/08/2026, richiesta
-- dell'utente: «servirebbe che FINANCE comunicasse a Scout se una fattura o
-- pro-forma è stata pagata»).
--
-- ⚠️ FINANCE non si tocca, e non serve: il dato lo espone già —
-- `GET /api/fatture?numero=` risponde `pagata` + `dataPagamento`, e
-- `GET /api/proforma?numero=` risponde lo `stato`, dove «fatturata» è il
-- passaggio che scatta al ricevimento del saldo. Il proprietario espone, il
-- lettore legge (Standard §7): è SCOUT che va a chiedere, e non tiene copia
-- dei numeri di là — solo lo stato della propria riga e il giorno del saldo.
--
-- Qui ci sono le due cose che servono al giro: la colonna del giorno, e il
-- cron che lo fa girare anche quando nessuno apre l'app.

-- Il giorno in cui il saldo è arrivato, come lo dice FINANCE. Serve a
-- distinguere «pagata oggi» da «pagata tre mesi fa»: senza, l'unica data
-- resterebbe quella dell'ultima modifica della riga, che non è la stessa cosa.
alter table richieste_cliente add column if not exists pagata_il timestamptz;

-- ⚠️ IL GIRO NOTTURNO. Un dato che arriva solo quando qualcuno apre la
-- schermata non è una comunicazione: è una coincidenza. Il cron chiama la
-- stessa azione del bottone (`azione: 'incassi'` della Edge `proforma`), con
-- la chiave d'ingresso letta a runtime da `chiavi_app` — stesso stampo della
-- 0064 e della 0068: nessun segreto nel file, nessuno nella storia git.
--
-- Alle 05:30 UTC: dopo il sync HubSpot (04:00) e la copertura (04:40), e prima
-- che qualcuno apra l'app la mattina.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'incassi-da-finance') then
    perform cron.unschedule('incassi-da-finance');
  end if;
end $$;

select cron.schedule('incassi-da-finance', '30 5 * * *', $job$
  select net.http_post(
    url := 'https://fdsziebgkljfsugqqbqd.supabase.co/functions/v1/proforma',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-api-key', coalesce((select chiave from chiavi_app where app = '_ingresso'), '')
    ),
    body := jsonb_build_object('azione', 'incassi')
  );
$job$);
