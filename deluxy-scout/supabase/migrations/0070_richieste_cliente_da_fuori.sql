-- 0070 — RICHIESTE CLIENTI: possono arrivare anche da FUORI (26/08/2026 sera).
--
-- Decisione dell'utente: «potranno arrivare da mail, da applicativo di delivery
-- o anche manualmente». Finora la tabella (0069) sapeva nascere solo dalle mani
-- del commerciale: `owner` era NOT NULL con default `auth.uid()`, che da una
-- Edge Function (service_role, nessun utente) vale NULL — cioè l'inserimento
-- sarebbe stato rifiutato.
--
-- ⚠️ Idempotente, come ogni migrazione >= 0045: il workflow le rilancia tutte
-- a ogni push.

-- 1. Senza padrone si può. «Non attribuita» è uno stato legittimo: la stessa
--    scelta fatta per le trattative dell'auto-qualifica (owner null = la vede
--    tutta la squadra e se la prende chi può). La policy di scrittura di 0069
--    contempla già `owner is null`.
alter table richieste_cliente alter column owner drop not null;

-- 2. Da dove arriva, e come tornare al messaggio originale.
--    `origine` = quale app l'ha scritta (commerciale = a mano dall'app);
--    `mail_ref` = l'id del messaggio in AI Mail, per rileggere cosa ha chiesto
--    il cliente con parole sue invece di fidarsi del riassunto.
alter table richieste_cliente add column if not exists origine text;
alter table richieste_cliente add column if not exists mail_ref text;

-- 3. L'identità della richiesta NELL'APP CHE LA MANDA: senza, un retry della
--    piattaforma consegne (o un cron che rilegge la stessa mail) creerebbe la
--    stessa richiesta due volte, e il commerciale prezzerebbe due volte lo
--    stesso lavoro. Con l'indice unico il secondo invio non entra.
alter table richieste_cliente add column if not exists riferimento_esterno text;
create unique index if not exists richieste_cliente_origine_rif_uix
  on richieste_cliente (origine, riferimento_esterno)
  where riferimento_esterno is not null;

-- 4. La richiesta web che si è rivelata di un CLIENTE non genera una
--    trattativa: genera una richiesta cliente (regola del binario). Il lead
--    deve ricordare COSA ha generato, altrimenti resta «qualificato» senza
--    niente da mostrare e sembra un lavoro perso.
alter table leads add column if not exists richiesta_cliente_id uuid
  references richieste_cliente(id) on delete set null;

-- 5. Il documento in FINANCE è DUE, non uno: prima il preventivo (che il
--    cliente accetta) e poi la fattura. Fin qui si teneva il riferimento della
--    sola pro-forma. Si tengono i riferimenti, mai una copia degli importi:
--    il registro dei risultati resta FINANCE.
alter table richieste_cliente add column if not exists preventivo_numero text;
alter table richieste_cliente add column if not exists preventivo_url text;
alter table richieste_cliente add column if not exists fattura_numero text;
alter table richieste_cliente add column if not exists fattura_url text;

-- 6. Lo stato guadagna il passo che mancava: «preventivo mandato, aspetto la
--    risposta». Senza, una richiesta con il preventivo fuori era indistinguibile
--    da una ancora da lavorare.
--    ⚠️ Il vincolo si rifà da capo (drop + add): `add constraint if not exists`
--    non esiste in Postgres, e ripetere la 0069 lascerebbe il vecchio elenco.
alter table richieste_cliente drop constraint if exists richieste_cliente_stato_check;
alter table richieste_cliente add constraint richieste_cliente_stato_check
  check (stato in ('nuova', 'preventivo_inviato', 'concordata', 'fatturata', 'persa'));

comment on column richieste_cliente.origine is
  'Quale app ha scritto la richiesta: commerciale (a mano) | scout-mail | app-delivery | api';
comment on column richieste_cliente.riferimento_esterno is
  'Id della richiesta nell''app che l''ha mandata: rende l''ingresso ripetibile senza doppioni';
