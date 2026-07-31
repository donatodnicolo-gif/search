-- Deluxy Scout — 0057: due dimensioni per il rapporto commerciale.
-- Idempotente. Applicare con scripts/allinea-supabase.mjs.
--
-- LO STATO dice **a che punto del funnel** siamo: selezionato · lead ·
-- prospect · in_trattativa · attivo (che si legge «Cliente») · dismesso
-- (che si legge «Dormiente»).
--
-- IL LIVELLO dice **come va il rapporto** dentro quel punto: in_contatto ·
-- in_attesa · da_ricontattare · attivo · a_rischio · non_interessato.
--
-- Perché separarli (decisione utente 31/07/2026, presa prima nel registro
-- Anagrafiche e poi qui): con una dimensione sola si era costretti a scegliere
-- fra due informazioni vere insieme. «A rischio» toglieva la parola *cliente*
-- proprio a chi cliente lo è ancora; «non interessato» cancellava il fatto che
-- restava un lead a cui avevamo parlato; «in attesa» sostituiva «prospect»
-- invece di aggiungersi. Sono modi in cui va il rapporto, non gradini.
--
-- ⚠️ La colonna si chiama `livello_rapporto`, **non** `livello` — che nel
-- registro è invece il suo nome. In Scout «livello» è già la scala del funnel
-- (Selezionato · Lead · Prospect · Cliente · Dormiente, lib/livelli.ts):
-- chiamarli uguale avrebbe rifatto la trappola di `prospect`, che nelle due app
-- voleva dire due cose opposte e ci è costata un giro a vuoto. I **valori** sono
-- gli stessi del registro; cambia solo il nome della colonna.
alter table places add column if not exists livello_rapporto text
  check (livello_rapporto is null or livello_rapporto in
    ('in_contatto', 'in_attesa', 'da_ricontattare', 'attivo', 'a_rischio', 'non_interessato'));

comment on column places.livello_rapporto is
  'Come va il rapporto dentro lo stato. Nel registro Anagrafiche si chiama `livello`; qui no, perché «livello» è già la scala del funnel.';

create index if not exists places_livello_rapporto_ix on places (livello_rapporto)
  where livello_rapporto is not null;

-- ── I dati che stanno sui vecchi stati ────────────────────────────────────────
-- Il valore si sposta nella colonna nuova e lo stato diventa quello che è
-- sempre stato sotto: chi è «in contatto» è un lead, chi è «a rischio» è un
-- cliente, chi è «non interessato» è un lead a cui abbiamo parlato.
--
-- ⚠️ NON si può togliere un valore da un enum Postgres: quei cinque restano
-- dentro `stato_affiliazione_t` per sempre. Nessuno li scriverà più, ma è il
-- motivo per cui qui si spostano i dati invece di ridefinire il tipo.
update places
   set livello_rapporto = stato_affiliazione::text,
       stato_affiliazione = case stato_affiliazione::text
                              when 'a_rischio' then 'attivo'
                              else 'lead'
                            end::stato_affiliazione_t
 where stato_affiliazione::text in
   ('in_contatto', 'in_attesa', 'da_ricontattare', 'a_rischio', 'non_interessato');

-- Lo stesso per quello che arriva dal registro: `anagrafiche_stato` è testo
-- libero, quindi si riscrive senza vincoli di enum.
update places
   set livello_rapporto = coalesce(livello_rapporto, anagrafiche_stato),
       anagrafiche_stato = case anagrafiche_stato
                             when 'a_rischio' then 'attivo'
                             else 'lead'
                           end
 where anagrafiche_stato in
   ('in_contatto', 'in_attesa', 'da_ricontattare', 'a_rischio', 'non_interessato');
