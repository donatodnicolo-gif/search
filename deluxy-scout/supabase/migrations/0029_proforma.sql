-- Collega la richiesta di pagamento alla pro-forma emessa su Deluxy Partner:
-- il riferimento ("PF n/anno") e il link alla pagina del documento.
alter table richieste_pagamento add column if not exists proforma_numero text;
alter table richieste_pagamento add column if not exists proforma_url text;
