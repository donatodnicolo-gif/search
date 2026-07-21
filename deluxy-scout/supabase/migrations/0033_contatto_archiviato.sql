-- Archiviazione dei contatti (referenti) in Rubrica: sparisce dall'elenco
-- attivo ma resta nel database (soft-hide). Comunicata anche ad Anagrafiche
-- come archiviazione del referente (best-effort, vedi Edge Function `anagrafiche`).
alter table contacts add column if not exists archiviato boolean not null default false;
