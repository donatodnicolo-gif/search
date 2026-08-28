-- Deluxy Scout — 0103: l'ACCONTO richiesto vive sull'ordine.
-- Idempotente. Applicare con: node scripts/mgmt-query.mjs supabase/migrations/0103_ordine_acconto.sql
--
-- Richiesta dell'utente (28/08/2026): «ho chiesto anticipo del 30%, colora
-- l'icona relativa per far capire che è stato richiesto; la pro-forma deve
-- tener conto che è richiesto un anticipo e farlo vedere».
--
-- ⚠️ Finora l'acconto nasceva SOLO come richiesta di pagamento in Pagamenti:
-- l'ordine non ne sapeva niente, quindi né l'icona né la pro-forma potevano
-- mostrarlo. Si scrive la PERCENTUALE, non l'importo: se il valore dell'ordine
-- cambia, il 30% resta il 30% — un importo secco invecchierebbe in silenzio.
alter table ordini add column if not exists acconto_percento numeric(5,2);
alter table ordini add column if not exists acconto_richiesto_il timestamptz;

comment on column ordini.acconto_percento is
  'La percentuale di acconto richiesta al cliente (es. 30). Null = nessun acconto richiesto.';
comment on column ordini.acconto_richiesto_il is
  'Quando l''acconto è stato richiesto (data della richiesta di pagamento).';
