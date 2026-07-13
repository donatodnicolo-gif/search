-- Deluxy Scout — seed: 9 linee di servizio + regole di categoria.
-- Idempotente: si può rieseguire.

-- LINES — le 3 in standby hanno attiva_bool=false (mai ipotesi primaria).
insert into lines (nome, attiva_bool, pitch) values
  ('Consegne',         true,  'Consegne guanti bianchi, assicurate e multi-città'),
  ('Catering',         true,  'Catering per eventi e allestimenti'),
  ('Regali aziendali', true,  'Gifting stagionale, macarons B2B, kit ricorrenze'),
  ('Affiliazioni',     true,  'Programma di affiliazione partner'),
  ('Re-seller',        true,  'Affiliazione re-seller su deluxy.it'),
  ('Food Supplier',    true,  'Fornitura B2B di torte e pasticceria'),
  ('Clientelling',     false, 'STANDBY — solo cross-sell manuale'),
  ('Concierge',        false, 'STANDBY — solo cross-sell manuale'),
  ('Magazzino',        false, 'STANDBY — solo cross-sell manuale')
on conflict (nome) do update
  set attiva_bool = excluded.attiva_bool,
      pitch = excluded.pitch;

-- CATEGORY_RULES
insert into category_rules (categoria, linea_ipotizzata, aggancio_apertura, priorita) values
  ('moda',                 'Consegne',        'Consegne guanti bianchi + regalistica VIP multi-città', 'P1'),
  ('maison',               'Consegne',        'Consegne guanti bianchi + regalistica VIP multi-città', 'P1'),
  ('gioielleria',          'Consegne',        'Consegne assicurate di pregio per top client',          'P1'),
  ('orologeria',           'Consegne',        'Consegne assicurate di pregio per top client',          'P1'),
  ('hotel',                'Consegne',        'Consegne in struttura + amenities + catering eventi',   'P1'),
  ('ristorante premium',   'Food Supplier',   'Fornitura torte e pasticceria B2B',                     'P1'),
  ('fioraio',              'Re-seller',       'Affiliazione su deluxy.it',                             'P1'),
  ('pasticceria',          'Re-seller',       'Affiliazione su deluxy.it',                             'P1'),
  ('studio legale',        'Regali aziendali','Gifting stagionale e chiusura deal',                    'P2'),
  ('consulenza',           'Regali aziendali','Gifting stagionale e chiusura deal',                    'P2'),
  ('banca',                'Regali aziendali','Gifting stagionale e chiusura deal',                    'P2'),
  ('profumeria',           'Regali aziendali','Regali aziendali + consegne PR/redazionali',            'P2'),
  ('cosmetica',            'Regali aziendali','Regali aziendali + consegne PR/redazionali',            'P2'),
  ('immobiliare di pregio','Regali aziendali','Gift closing e welcome home',                           'P2'),
  ('wedding',              'Catering',        'Catering + Consegne per allestimenti',                  'P2'),
  ('event planner',        'Catering',        'Catering + Consegne per allestimenti',                  'P2'),
  ('azienda corporate',    'Regali aziendali','Macarons B2B, kit ricorrenze',                          'P2'),
  ('uffici',               'Regali aziendali','Macarons B2B, kit ricorrenze',                          'P2'),
  ('retail generico',      'Consegne',        'Da qualificare in visita; consegne come aggancio',      'P3'),
  ('altro',                'Consegne',        'Da qualificare in visita; consegne come aggancio',      'P3')
on conflict (categoria) do update
  set linea_ipotizzata = excluded.linea_ipotizzata,
      aggancio_apertura = excluded.aggancio_apertura,
      priorita = excluded.priorita;
