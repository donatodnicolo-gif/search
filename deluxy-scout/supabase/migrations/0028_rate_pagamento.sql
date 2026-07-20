-- Split di una richiesta di pagamento in RATE (per valore € o per %), ognuna con
-- la propria scadenza e stato di incasso. La somma delle rate = importo richiesto.
create table if not exists rate_pagamento (
  id           uuid primary key default gen_random_uuid(),
  richiesta_id uuid not null references richieste_pagamento(id) on delete cascade,
  etichetta    text,                                  -- es. "Acconto", "Saldo"
  modo         text not null default 'valore' check (modo in ('valore', 'percentuale')),
  percentuale  numeric check (percentuale >= 0 and percentuale <= 100),
  importo      numeric not null check (importo >= 0), -- valore € della rata (calcolato dalla % se serve)
  scadenza     date,
  pagata       boolean not null default false,
  ordine       int not null default 0,
  created_at   timestamptz not null default now()
);

alter table rate_pagamento enable row level security;

-- Accesso derivato dalla richiesta padre (owner o admin).
create policy rate_all on rate_pagamento for all to authenticated
  using (
    exists (
      select 1 from richieste_pagamento r
      where r.id = richiesta_id
        and (r.owner = auth.uid() or (auth.jwt() ->> 'email') = 'nicolo.donato@deluxy.it')
    )
  )
  with check (
    exists (
      select 1 from richieste_pagamento r
      where r.id = richiesta_id
        and (r.owner = auth.uid() or (auth.jwt() ->> 'email') = 'nicolo.donato@deluxy.it')
    )
  );

create index if not exists rate_richiesta_ix on rate_pagamento (richiesta_id, ordine);
