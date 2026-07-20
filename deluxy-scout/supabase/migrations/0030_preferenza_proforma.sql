-- Preferenza per utente: emettere la pro-forma su Deluxy Partner insieme alla
-- richiesta di pagamento. Attiva di default; si disattiva da Profilo → Pagamenti.
alter table profiles add column if not exists proforma_default boolean not null default true;
