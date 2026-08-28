-- 0104 — Richieste di pagamento ai FORNITORI (28/08/2026).
--
-- È il verso OPPOSTO di `richieste_pagamento` (che dal 0027 significa «il
-- cliente deve pagare noi»): qui NOI dobbiamo pagare il fioraio, il catering,
-- l'allestitore di un evento/ordine Scout. La forma è quella che il 0025 aveva
-- e il 0027 ha cancellato — stavolta la richiesta non resta in casa: parte
-- verso DELUXY TRANSACTIONS (l'unica app da cui può uscire denaro, Standard
-- Deluxy §7) e qui resta lo SPECCHIO dell'esito notificato dal suo webhook.
-- Non è una verità locale: si riconcilia col pull `?aggiornateDa=` di là.

create table if not exists richieste_pagamento_fornitore (
  id uuid primary key default gen_random_uuid(),
  creato_il timestamptz not null default now(),
  creato_da uuid references auth.users(id),

  -- chi va pagato e come
  beneficiario text not null,
  metodo text not null default 'iban',          -- iban | link | paypal | carta | altro
  iban text not null default '',
  riferimento_pagamento text not null default '', -- link/PayPal/nota quando non è IBAN
  importo numeric(10,2) not null check (importo > 0),
  causale text not null,

  -- a cosa si aggancia (l'evento è un ordine Scout, o un lavoro con preventivo)
  ordine_id uuid references ordini(id) on delete set null,
  lavoro_id uuid references lavori(id) on delete set null,
  note text not null default '',

  -- il viaggio verso Transactions
  trx_riferimento text,                          -- TRX-2026-000123
  trx_stato text not null default '',            -- specchio: in_attesa|approvata|in_lotto|pagata|rifiutata|annullata
  trx_pagato_con text not null default '',       -- distinta | qonto | fuori_app
  trx_pagata_il timestamptz,
  esito_invio text not null default '',          -- errore dell'ultimo tentativo, '' = ok
  inviata_il timestamptz,
  aggiornata_il timestamptz not null default now()
);

comment on table richieste_pagamento_fornitore is
  'Pagamenti da fare ai fornitori (eventi/ordini Scout): la richiesta parte verso Deluxy Transactions, qui lo specchio dell''esito.';

create index if not exists rpf_stato_idx on richieste_pagamento_fornitore (trx_stato, creato_il desc);
create index if not exists rpf_ordine_idx on richieste_pagamento_fornitore (ordine_id);

alter table richieste_pagamento_fornitore enable row level security;

-- Come per le altre tabelle di lavoro: ogni utente Scout autenticato legge e
-- scrive (il team è piccolo e condivide il lavoro); nessun accesso anonimo.
drop policy if exists rpf_select on richieste_pagamento_fornitore;
create policy rpf_select on richieste_pagamento_fornitore
  for select to authenticated using (true);
drop policy if exists rpf_insert on richieste_pagamento_fornitore;
create policy rpf_insert on richieste_pagamento_fornitore
  for insert to authenticated with check (true);
drop policy if exists rpf_update on richieste_pagamento_fornitore;
create policy rpf_update on richieste_pagamento_fornitore
  for update to authenticated using (true);
