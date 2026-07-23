-- Deluxy Scout — 0039: data di apertura della trattativa.
-- Idempotente. Applicare con scripts/mgmt-query.mjs (Management API).
--
-- `deals` non ha mai avuto una data: non si poteva sapere da quanto una
-- trattativa è aperta. La colonna si aggiunge SENZA default, così le trattative
-- già esistenti restano a NULL (la loro data non è ricostruibile e inventarla
-- sarebbe peggio che non averla); il default si imposta subito dopo, quindi
-- tutte le nuove nascono con la data di oggi.

alter table deals add column if not exists created_at timestamptz;
alter table deals alter column created_at set default now();

create index if not exists deals_created_at_ix on deals (created_at desc);

comment on column deals.created_at is
  'Quando la trattativa è stata aperta. NULL sulle trattative precedenti alla migrazione 0039 (23/07/2026): data non ricostruibile.';
