-- Data di scadenza (follow-up) per le trattative: quando va fatta la prossima azione.
alter table deals add column if not exists scadenza date;
