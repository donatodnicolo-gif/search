-- 27/08/2026 (sera) — L'INTESTAZIONE VIAGGIA COL DOCUMENTO, e i template se ne
-- vanno da qui.
--
-- Decisione dell'utente: «Scout sarà l'owner dei template, a Finance vengono
-- comunicate solo le pro-forme».
--
-- Stamattina avevo fatto il contrario — la tabella dei template QUI, e il
-- documento che ci puntava con una FK — perché è FINANCE a disegnare il foglio.
-- Ma la proprietà del dato è un'altra cosa dal renderlo, e questa versione è
-- migliore anche per un motivo che non c'entra con la proprietà:
--
-- ⚠️ UN DOCUMENTO GIÀ MANDATO AL CLIENTE NON DEVE CAMBIARE. Con la FK, chi
-- ritoccava il logo o l'IBAN di un template cambiava l'aspetto di TUTTE le
-- pro-forma già emesse con quello — comprese quelle stampate e spedite mesi
-- prima. Un documento è una fotografia: l'intestazione con cui è uscito resta
-- quella, per sempre. Qui diventa un dato del documento, non un riferimento.
--
-- Applicato a mano (database condiviso da 14 app: niente `prisma db push`).

-- 1. L'intestazione con cui il documento è stato emesso, come fotografia.
--    JSON e non dieci colonne: è un blocco che si legge tutto insieme e non si
--    interroga per campo — nessuno cercherà mai «le pro-forma con quell'IBAN».
alter table public."ProForma" add column if not exists intestazione jsonb;

comment on column public."ProForma".intestazione is
  'Fotografia dell''intestazione al momento dell''emissione (ragione sociale, P. IVA, logo, IBAN, testo di legge). Arriva da Scout, che possiede i template. Null = intestazione generale delle Impostazioni.';

-- 2. Via la FK e la tabella di stamattina: il registro dei template non abita
--    più qui. ⚠️ Si può fare senza rimpianti perché è nata oggi e non ha mai
--    avuto righe vere — l'unica creata era una prova, cancellata subito dopo.
alter table public."ProForma" drop constraint if exists "ProForma_templateId_fkey";
drop index if exists public."ProForma_templateId_idx";
alter table public."ProForma" drop column if exists "templateId";
drop table if exists public."TemplateDocumento";
