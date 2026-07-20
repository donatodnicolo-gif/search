-- Più linee (tipologie di interesse) per una trattativa. `linea` resta la primaria
-- (prima dell'array) per compatibilità con display e sync HubSpot.
alter table deals add column if not exists linee text[];
update deals set linee = array[linea] where linee is null and linea is not null;
