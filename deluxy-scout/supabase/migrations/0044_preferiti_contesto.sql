-- Deluxy Scout — 0044: i preferiti sanno da dove vengono.
-- Idempotente. Applicare con scripts/mgmt-query.mjs.
--
-- Le località salvate dalla Ricerca affiliazioni devono comparire nel menu
-- SOTTO Affiliazioni, non mischiate ai preferiti della Mappa: il contesto
-- distingue le due liste (e dice dove riaprire il punto salvato).

alter table indirizzi_preferiti add column if not exists contesto text not null default 'mappa'
  check (contesto in ('mappa', 'affiliazioni'));

comment on column indirizzi_preferiti.contesto is 'Da dove è stato salvato (e dove si riapre): mappa | affiliazioni.';
