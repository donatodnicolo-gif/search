-- 0086 — LA PROVA CHE UNA MAIL È STATA IMPORTATA (27/08/2026).
--
-- Nasce da una revisione ostile: l'accusa che le avevo passato è caduta, ma
-- sotto ce n'era una vera e diversa.
--
-- ⚠️ IL PROBLEMA: la Edge Function `mail`, per lasciar leggere il CORPO di un
-- messaggio della cassetta comune, chiedeva «questo messaggio Scout l'ha già
-- importato?» e lo verificava cercando `mail_ref` in `leads`,
-- `richieste_cliente` e `preventivi`. Ma quelle tre tabelle le SCRIVE l'utente:
-- `leads_insert` è `with check (true)` (0041), e `preventivi` è `for all
-- using(true) with check(true)` (0055). Bastava quindi inserire una riga
-- `leads` con `mail_ref = <identificativo>` e il controllo passava — e
-- l'identificativo può essere il Message-ID RFC, che si legge negli header
-- `References` di una mail ricevuta. Risultato: il corpo integrale di un
-- messaggio della cassetta personale di un altro, mai ricevuto da chi chiede.
--
-- ⚠️ LA REGOLA CHE NE ESCE: una prova non può stare dove la scrive chi deve
-- essere provato. Restringere `leads_insert` non sarebbe bastato — sarebbe
-- rimasta aperta `preventivi`, e domani un'altra tabella.
--
-- Qui la prova la scrive SOLO il server: RLS accesa e NESSUNA policy, quindi
-- passa il solo `service_role` (stesso schema di `chiavi_app` e `smtp_account`).
create table if not exists mail_importate (
  -- L'identificativo con cui AI Mail conosce il messaggio (id o Message-ID).
  mail_ref text primary key,
  -- Da quale cassetta è stato importato: serve a non allargare il permesso a
  -- una cassetta diversa da quella da cui la mail è arrivata davvero.
  casella text,
  quando timestamptz not null default now()
);

alter table mail_importate enable row level security;

comment on table mail_importate is
  'Quali messaggi Scout ha davvero importato. Scritta solo dal server (nessuna policy): è la prova su cui la Edge Function `mail` decide se far leggere un corpo, e non può stare in una tabella che l''utente scrive.';

-- ⚠️ IL RIPORTO DI CIÒ CHE C'È GIÀ, e il suo limite detto per intero.
--
-- Senza questo, ogni richiesta e ogni lead importati fino a oggi smetterebbero
-- di poter rileggere la mail da cui sono nati: la funzione che serve
-- quotidianamente si spegnerebbe per chiudere una porta che nessuno risulta
-- aver usato.
--
-- Il limite: se qualcuno AVESSE già piantato una riga falsa, questo riporto la
-- benedice. È una fotografia dell'esistente, non una garanzia sull'esistente —
-- da adesso in poi scrive solo il server, e quello sì è garantito.
insert into mail_importate (mail_ref, casella)
select distinct mail_ref, null
from (
  select mail_ref from leads where mail_ref is not null
  union
  select mail_ref from richieste_cliente where mail_ref is not null
  union
  select mail_ref from preventivi where mail_ref is not null
) t
on conflict (mail_ref) do nothing;
