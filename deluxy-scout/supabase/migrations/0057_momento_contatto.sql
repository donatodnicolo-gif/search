-- Deluxy Scout — 0057: «in contatto / in attesa / da ricontattare» diventano
-- una dimensione a sé, non più stati commerciali.
-- Idempotente. Applicare con scripts/allinea-supabase.mjs.
--
-- Non erano gradini del funnel ma il **momento del contatto**, e stare nella
-- stessa lista degli altri costringeva a scegliere fra due informazioni vere
-- insieme: «è un prospect» **e** «sta aspettando una risposta». Con uno stato
-- solo, la seconda si perdeva — o peggio, cancellava la prima.
--
-- La stessa decisione è stata presa nel registro Anagrafiche (31/07/2026), dove
-- le 180 anagrafiche che li avevano sono diventate `prospect` conservando il
-- vecchio valore come livello. Qui si fa lo stesso, sugli stessi valori.
--
-- ⚠️ Il campo si chiama `livello_contatto`, **non** `livello`: in Scout
-- «livello» è già la scala del funnel (Selezionato · Lead · Prospect · Cliente
-- · Dormiente, lib/livelli.ts). Chiamarlo uguale avrebbe creato la stessa
-- trappola di `prospect`, che nelle due app voleva dire due cose opposte.
alter table places add column if not exists livello_contatto text
  check (livello_contatto is null or livello_contatto in ('in_contatto', 'in_attesa', 'da_ricontattare'));

comment on column places.livello_contatto is
  'Momento del contatto (in_contatto|in_attesa|da_ricontattare). Nel registro Anagrafiche si chiama `livello`; qui no, perché «livello» è già la scala del funnel.';

create index if not exists places_livello_contatto_ix on places (livello_contatto)
  where livello_contatto is not null;

-- ── I dati che stanno sui vecchi stati ────────────────────────────────────────
-- Si sposta il valore nella colonna nuova e lo stato commerciale diventa
-- `lead`: quei tre valori dicevano tutti che **un contatto c'è stato**, che è
-- esattamente la definizione di Lead nella scala di Scout.
--
-- ⚠️ NON si può togliere un valore da un enum Postgres: `in_contatto` &c.
-- restano dentro `stato_affiliazione_t` per sempre. Nessun problema — nessuno
-- li scriverà più — ma è il motivo per cui questa migrazione sposta i dati
-- invece di «rinominare» il tipo.
update places
   set livello_contatto = stato_affiliazione::text,
       stato_affiliazione = 'lead'
 where stato_affiliazione::text in ('in_contatto', 'in_attesa', 'da_ricontattare');

-- Lo stesso per quello che arriva dal registro: `anagrafiche_stato` è testo
-- libero, quindi qui si riscrive senza vincoli di enum.
update places
   set livello_contatto = coalesce(livello_contatto, anagrafiche_stato),
       anagrafiche_stato = 'lead'
 where anagrafiche_stato in ('in_contatto', 'in_attesa', 'da_ricontattare');
