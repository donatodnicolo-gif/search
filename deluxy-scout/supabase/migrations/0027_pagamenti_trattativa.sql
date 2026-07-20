-- Ridisegno: la "richiesta di pagamento" nasce da una TRATTATIVA vinta. Il
-- commerciale invia al cliente una richiesta (anche parziale/acconto) e monitora
-- qui l'ESITO dell'incasso. Nessun dato pregresso → ricreo pulita.
drop table if exists richieste_pagamento;

create table richieste_pagamento (
  id                uuid primary key default gen_random_uuid(),
  owner             uuid not null references auth.users(id) on delete cascade default auth.uid(),
  deal_id           uuid references deals(id) on delete set null,
  place_id          uuid references places(id) on delete set null,
  cliente           text not null,                       -- chi deve pagare (negozio/cliente)
  importo           numeric not null check (importo > 0), -- importo richiesto (anche parziale)
  importo_incassato numeric not null default 0 check (importo_incassato >= 0),
  causale           text,
  scadenza          date,                                -- entro quando ci si aspetta l'incasso
  stato             text not null default 'inviata'
                    check (stato in ('inviata', 'in_attesa', 'pagata', 'parziale', 'insoluta', 'annullata')),
  nota              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table richieste_pagamento enable row level security;

-- Vedo/gestisco le mie; l'admin (supervisione) vede e modifica tutte.
create policy pagamenti_select on richieste_pagamento for select to authenticated
  using (owner = auth.uid() or (auth.jwt() ->> 'email') = 'nicolo.donato@deluxy.it');
create policy pagamenti_insert on richieste_pagamento for insert to authenticated
  with check (owner = auth.uid());
create policy pagamenti_update on richieste_pagamento for update to authenticated
  using (owner = auth.uid() or (auth.jwt() ->> 'email') = 'nicolo.donato@deluxy.it')
  with check (owner = auth.uid() or (auth.jwt() ->> 'email') = 'nicolo.donato@deluxy.it');
create policy pagamenti_delete on richieste_pagamento for delete to authenticated
  using (owner = auth.uid() or (auth.jwt() ->> 'email') = 'nicolo.donato@deluxy.it');

create index pagamenti_owner_ix on richieste_pagamento (owner, stato, created_at desc);
create index pagamenti_deal_ix on richieste_pagamento (deal_id);
