-- 0080 — I DATI PER LA FATTURAZIONE, in un posto solo (27/08/2026).
--
-- Richiesta dell'utente: i dati societari veri, «cambiabili da impostazioni
-- solo da admin».
--
-- Sono l'identità fiscale dell'azienda: non appartengono a un template né a un
-- documento, e non si riscrivono a mano ogni volta che si crea un'insegna
-- nuova. Da qui diventano il punto di partenza di ogni template — così una
-- partita IVA si scrive UNA volta, e se cambia si cambia in un posto.
--
-- ⚠️ Chi può scriverli: SOLO l'amministratore, e non è un filtro dell'interfaccia
-- — la policy `impostazioni_write` della migrazione 0043 lo impone nel
-- database. Un venditore li legge (servono alle schermate) e non li tocca.
--
-- ⚠️ Qui NON vanno segreti: sono dati che finiscono stampati su un documento
-- che il cliente riceve. Le chiavi API restano nei secret delle Edge Function.

insert into impostazioni (chiave, valore) values
  ('azienda.ragione_sociale', 'Deluxy Srl'),
  ('azienda.piva',            '11453140961'),
  ('azienda.indirizzo',       'Via Varesina 60'),
  ('azienda.cap_citta',       '20156 Milano'),
  ('azienda.sdi',             'M5UXCR1'),
  ('azienda.pec',             'deluxy@pec.net')
on conflict (chiave) do nothing;

-- Il codice destinatario SDI e la PEC sul template: sono dati di fatturazione e
-- vanno con l'intestazione, non lasciati fuori. Servono a chi riceve il
-- documento per sapere dove mandare la fattura elettronica.
alter table template_documento add column if not exists sdi text;
alter table template_documento add column if not exists pec text;

comment on column template_documento.sdi is 'Codice destinatario SDI di chi emette.';
comment on column template_documento.pec is 'PEC di chi emette.';
