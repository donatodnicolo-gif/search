-- Deluxy Scout — 0007: tipologia di interesse MULTIPLA (più linee per negozio).
-- `linea_ipotizzata` (singola) resta come "primaria" (= prima dell'array) per
-- compatibilità con lista/mappa/giro/HubSpot; `linee_ipotizzate` tiene tutte.
alter table places add column if not exists linee_ipotizzate text[];

-- Inizializza l'array dai valori singoli esistenti.
update places
set linee_ipotizzate = array[linea_ipotizzata]
where linee_ipotizzate is null and linea_ipotizzata is not null;
