-- Casella email personale del venditore (Register.it): da qui partono le email
-- che l'app manda per suo conto (notifiche task, promemoria).
--
-- SICUREZZA: la password è salvata CIFRATA (AES-256-GCM, chiave nel secret
-- SMTP_ENC_KEY della Edge Function) e la tabella ha RLS ATTIVO SENZA POLICY:
-- nessun client autenticato può leggerla o scriverla, solo il service_role
-- (cioè le Edge Function). La configurazione passa dalla funzione `smtp-config`.
create table if not exists smtp_account (
  owner uuid primary key references auth.users (id) on delete cascade,
  host text not null,
  porta integer not null default 465,
  utente text not null,
  password_cifrata text not null,
  mittente text,
  verificato_il timestamptz,
  updated_at timestamptz not null default now()
);

alter table smtp_account enable row level security;
-- Nessuna policy: di proposito. Solo service_role.
