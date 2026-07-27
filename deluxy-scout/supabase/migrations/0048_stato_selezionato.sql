-- Deluxy Scout — 0048: «Selezionato» diventa uno stato scegliibile a mano.
-- Idempotente. Applicare con scripts/mgmt-query.mjs (o allinea-supabase.mjs).
--
-- Nel funnel di Scout (lib/livelli.ts) SELEZIONATO esiste dal 27/07: è il
-- negozio scelto con la ⭐ ma a cui non è ancora stato detto niente. Fin qui era
-- solo **derivato** dai dati; nella scheda del negozio si poteva scegliere fra
-- gli stati del registro, dove «selezionato» non c'è — e chi voleva segnarlo a
-- mano non poteva.
--
-- ⚠️ Questo valore è **di Scout, non del registro**: Anagrafiche ha i suoi 8
-- stati e `selezionato` non è fra quelli. Verso il registro viene tradotto in
-- `prospect` (vedi `statoRegistroDaAffiliazione` in lib/db.ts), che è
-- esattamente ciò che è: un potenziale non ancora contattato.

-- `add value if not exists` è idempotente e non riscrive la tabella. Va da solo
-- in questo file: Postgres non permette di USARE un valore appena aggiunto
-- all'enum nella stessa transazione, quindi qualsiasi update che lo usasse qui
-- fallirebbe.
alter type stato_affiliazione_t add value if not exists 'selezionato' before 'prospect';
