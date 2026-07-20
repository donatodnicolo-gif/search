-- Richieste di pagamento: il commerciale apre una richiesta, Finance la gestisce.
-- Stati: inviata → in_lavorazione → pagata | rifiutata.
create table if not exists richieste_pagamento (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null references auth.users(id) on delete cascade default auth.uid(),
  place_id      uuid references places(id) on delete set null,
  beneficiario  text not null,
  importo       numeric not null check (importo > 0),
  causale       text not null,
  iban          text,
  urgenza       text not null default 'normale' check (urgenza in ('normale', 'urgente')),
  stato         text not null default 'inviata' check (stato in ('inviata', 'in_lavorazione', 'pagata', 'rifiutata')),
  nota_finance  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table richieste_pagamento enable row level security;

-- Vedo: le mie; Finance (per ora l'admin) vede tutte.
drop policy if exists pagamenti_select on richieste_pagamento;
create policy pagamenti_select on richieste_pagamento for select to authenticated
  using (owner = auth.uid() or (auth.jwt() ->> 'email') = 'nicolo.donato@deluxy.it');

-- Creo: solo a mio nome.
drop policy if exists pagamenti_insert on richieste_pagamento;
create policy pagamenti_insert on richieste_pagamento for insert to authenticated
  with check (owner = auth.uid());

-- Modifico: io finché è "inviata" (correzioni); Finance sempre (cambio stato + nota).
drop policy if exists pagamenti_update on richieste_pagamento;
create policy pagamenti_update on richieste_pagamento for update to authenticated
  using (
    (owner = auth.uid() and stato = 'inviata')
    or (auth.jwt() ->> 'email') = 'nicolo.donato@deluxy.it'
  );

-- Elimino: solo io e solo finché è "inviata".
drop policy if exists pagamenti_delete on richieste_pagamento;
create policy pagamenti_delete on richieste_pagamento for delete to authenticated
  using (owner = auth.uid() and stato = 'inviata');

create index if not exists pagamenti_owner_ix on richieste_pagamento (owner, stato, created_at desc);
