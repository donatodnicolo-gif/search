-- Deluxy Scout — 0107: la pianificazione diventa SETTIMANALE, discorsiva e a CLIENTI.
-- Idempotente. Applicare con: node scripts/mgmt-query.mjs supabase/migrations/0107_pianificazione_settimanale.sql
--
-- Correzione chiesta dall'utente (29/08/2026) sulla 0106: «la pianificazione
-- deve essere per settimana; deve essere anche discorsiva di quello che voglio
-- dire; più focalizzata su numero clienti piuttosto che su €; la conversione
-- non in %, la % la calcoli tu. Ad esempio per consegne dovremo capire che
-- giro faranno a Milano, che settimana».
--
-- Quindi: una riga = una SETTIMANA (il lunedì) × una linea, con
--   descrizione     — il piano detto a parole (il giro, le zone, le azioni);
--   target_clienti  — quanti clienti si vogliono chiudere quella settimana.
-- La conversione NON si scrive più: la calcola l'app da trattative e clienti
-- reali della settimana.
--
-- ⚠️ Migrazione ADDITIVA: mese, target_valore, obiettivo_conversione e nota
-- della 0106 restano ma nessuno le scrive più (la tabella era VUOTA al momento
-- del cambio — verificato con una select prima di scrivere questa migrazione).
-- mese perde il NOT NULL, se no le righe settimanali non entrerebbero. Le
-- colonne morte si potranno togliere con una migrazione futura concordata.

alter table pianificazioni_commerciali add column if not exists settimana date;
alter table pianificazioni_commerciali add column if not exists descrizione text;
alter table pianificazioni_commerciali add column if not exists target_clienti integer;

-- Se mai esistessero righe mensili (oggi zero), diventano la settimana del
-- primo giorno del mese: meglio spostate che perse.
update pianificazioni_commerciali
   set settimana = (mese - ((extract(isodow from mese)::int - 1) || ' days')::interval)::date
 where settimana is null and mese is not null;

alter table pianificazioni_commerciali alter column mese drop not null;

-- UNA riga per settimana × linea (il piano è condiviso, l'upsert non doppia).
do $$ begin
  alter table pianificazioni_commerciali
    add constraint pianificazioni_settimana_linea_key unique (settimana, linea);
exception when duplicate_table then null; when duplicate_object then null; end $$;

comment on table pianificazioni_commerciali is
  'Piano commerciale SETTIMANALE per linea (migr. 0107): il lunedi'' della settimana, il piano a parole (descrizione) e il target in NUMERO DI CLIENTI. La conversione non si scrive: la calcola l''app dai dati. Scrive solo il responsabile (profiles.responsabile) o l''amministratore (RLS della 0106, invariata). Le colonne mese/target_valore/obiettivo_conversione/nota sono morte dalla 0107.';
comment on column pianificazioni_commerciali.settimana is 'Il LUNEDI'' della settimana pianificata.';
comment on column pianificazioni_commerciali.descrizione is 'Il piano detto a parole: che giro si fara'', dove, con chi (es. «giro Milano centro: Montenapoleone e Spiga, martedi''-mercoledi''»).';
comment on column pianificazioni_commerciali.target_clienti is 'Quanti clienti si vogliono chiudere nella settimana, per questa linea.';
