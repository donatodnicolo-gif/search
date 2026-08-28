-- 28/08/2026 — LA P.IVA DEL CLIENTE ENTRA IN FINANCE.
--
-- Il difetto, verificato: `POST /api/v1/partners` dichiarava `pIva` (e
-- `codiceFiscale`) fra i campi in ingresso, il registro Anagrafiche gliele
-- mandava davvero (`src/lib/finance.ts` di deluxy-anagrafiche, campi `pIva` e
-- `codiceFiscale` letti dal soggetto fiscale della sede) e FINANCE le buttava
-- **in silenzio**, perché sul modello `Partner` quelle colonne non esistevano.
-- Risultato: FINANCE non sapeva con quale SOCIETÀ fattura nessuna delle sue
-- schede — e per la pro-forma doveva rileggersele dal registro a ogni stampa,
-- perdendo i dati fiscali del cliente quando il registro tardava (successo in
-- produzione il 28/08).
--
-- ⚠️ L'unica P.IVA presente fin qui in FINANCE sta su `TemplateDocumento`: è
-- di **CHI EMETTE** (i brand Deluxy), non di chi riceve. Sono due dati diversi
-- e non vanno confusi.
--
-- Applicato a mano (non con `prisma db push`): su un database condiviso da 14
-- app il push confronta TUTTO lo schema e può proporre di cancellare ciò che
-- non è in questo file. Qui si scrive solo ciò che serve, ed è idempotente.

alter table public."Partner" add column if not exists "pIva" text;
alter table public."Partner" add column if not exists "codiceFiscale" text;

-- ⚠️ Nessun vincolo di unicità: tre negozi della stessa catena possono
-- fatturare tutti con la stessa società (CHANEL a Milano, Roma e Firenze), e
-- in FINANCE restano tre schede. Un @unique qui rifiuterebbe la seconda.
comment on column public."Partner"."pIva" is
  'P.IVA della societa'' con cui QUESTO negozio fattura (chi riceve). Copia operativa: la fonte di verita'' e'' il soggetto fiscale nel registro Anagrafiche. Non confondere con TemplateDocumento.piva, che e'' di chi EMETTE.';
comment on column public."Partner"."codiceFiscale" is
  'Codice fiscale della societa'' con cui QUESTO negozio fattura. Copia operativa dal registro Anagrafiche.';
