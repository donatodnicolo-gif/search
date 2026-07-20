-- Linea Deluxy (tipologia di interesse) sulla copia locale dei deal HubSpot.
-- Popolata dalla proprietà custom `deluxy_linea` durante sync_crm (hubspot-match).
alter table hubspot_deals add column if not exists linea text;
