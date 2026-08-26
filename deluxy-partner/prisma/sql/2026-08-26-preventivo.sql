-- 26/08/2026 — IL PREVENTIVO COME DOCUMENTO (decisione dell'utente: «preventivo
-- e fattura da finance»).
--
-- Fin qui FINANCE aveva la pro-forma e basta: il preventivo non esisteva —
-- zero occorrenze in tutto il codice — e la catena decisa il 26/08
-- (preventivo → proforma → fattura) partiva da un anello mancante.
--
-- ⚠️ NON si crea una tabella nuova. Un preventivo e una pro-forma sono lo
-- stesso documento: un'intestazione, delle righe, dei totali, un destinatario.
-- Cambiano il NOME, la numerazione e cosa vuol dire chiuderlo. Duplicare
-- modello, API e cinque pagine per due documenti gemelli avrebbe voluto dire
-- due posti da correggere per ogni bug: si aggiunge il `tipo`.
--
-- Applicato a mano (non con `prisma db push`): su un database condiviso da 14
-- app il push confronta TUTTO lo schema e può proporre di cancellare ciò che
-- non è nel file. Qui si scrive solo ciò che serve.

-- 1. Che documento è. Le righe che c'erano sono tutte pro-forma.
alter table public."ProForma" add column if not exists tipo text not null default 'proforma';

-- 2. Fino a quando vale l'offerta, e quando il cliente ha detto di sì. Sono le
--    due date che una pro-forma non ha bisogno di avere e un preventivo sì:
--    un'offerta senza scadenza non si può sollecitare, e senza la data
--    dell'accettazione non si sa quando è nato l'impegno.
alter table public."ProForma" add column if not exists "validoFino" timestamp(3);
alter table public."ProForma" add column if not exists "accettatoIl" timestamp(3);

-- 3. Numerazione SEPARATA per tipo: PV 1/2026 e PF 1/2026 devono poter
--    coesistere. Il vincolo vecchio (anno, numero) lo impediva.
drop index if exists public."ProForma_anno_numero_key";
create unique index if not exists "ProForma_tipo_anno_numero_key"
  on public."ProForma" (tipo, anno, numero);

create index if not exists "ProForma_tipo_stato_idx" on public."ProForma" (tipo, stato);

comment on column public."ProForma".tipo is
  'proforma | preventivo — stesso documento, due nomi e due numerazioni';
