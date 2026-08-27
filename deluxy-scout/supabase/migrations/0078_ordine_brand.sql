-- 0078 — PER QUALE BRAND È QUESTA VENDITA (27/08/2026).
--
-- Richiesta dell'utente: «fai indicare anche il brand per cui è la pro-forma,
-- default deluxy».
--
-- Il gruppo vende con tre insegne — deluxy.it, deluxyflowers.com,
-- cakedesign.me — e FINANCE tiene un'intestazione (logo, dati societari,
-- coordinate di pagamento) per ciascuna. Finora Scout non diceva quale, quindi
-- ogni documento usciva con l'intestazione predefinita: al cliente di
-- Cake Design arrivava un foglio intestato Deluxy.
--
-- ⚠️ Nullable, e chi è null vale «deluxy.it». Gli ordini che ci sono già non si
-- toccano: mettere a forza un brand su una vendita passata vorrebbe dire
-- affermare una cosa che nessuno ha detto. La lettura del default sta nel
-- codice, in un posto solo, così cambiare idea non richiede di riscrivere le
-- righe.
alter table ordini add column if not exists brand text;

comment on column ordini.brand is
  'Con quale insegna si vende: decide l''intestazione del documento in FINANCE. Null = deluxy.it.';

-- Anche la richiesta cliente: il documento nasce da lì quando la vendita non
-- passa da una trattativa, e la domanda «di chi è questa vendita» è la stessa.
alter table richieste_cliente add column if not exists brand text;

comment on column richieste_cliente.brand is
  'Con quale insegna si vende. Null = deluxy.it.';
