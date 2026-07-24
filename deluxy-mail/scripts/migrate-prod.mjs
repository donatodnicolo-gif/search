// Migrazione idempotente eseguita a ogni build/deploy (vedi package.json).
// Crea le tabelle nuove se mancano, usando la STESSA connessione dell'app
// (DATABASE_URL, il pooler IPv4 di Supabase che dal build è raggiungibile).
//
// È volutamente NON BLOCCANTE: se il DB non è raggiungibile durante il build,
// logga e prosegue senza far fallire il deploy — le letture nell'app sono
// difensive e la migrazione si riapplica al build successivo.
import { PrismaClient } from '@prisma/client'

const stmts = [
  `CREATE TABLE IF NOT EXISTS "RiassuntoThread" (
     "id" TEXT PRIMARY KEY, "utenteId" TEXT NOT NULL, "chiave" TEXT NOT NULL,
     "riassunto" TEXT NOT NULL, "partecipanti" INTEGER NOT NULL DEFAULT 0,
     "messaggiVisti" INTEGER NOT NULL DEFAULT 0,
     "generatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "RiassuntoThread_utenteId_chiave_key" ON "RiassuntoThread"("utenteId","chiave")`,
  `CREATE TABLE IF NOT EXISTS "ContattoAI" (
     "id" TEXT PRIMARY KEY, "utenteId" TEXT NOT NULL, "email" TEXT NOT NULL,
     "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ContattoAI_utenteId_email_key" ON "ContattoAI"("utenteId","email")`,
  `CREATE INDEX IF NOT EXISTS "ContattoAI_utenteId_idx" ON "ContattoAI"("utenteId")`,
  `ALTER TABLE "ContattoAI" ADD COLUMN IF NOT EXISTS "istruzioni" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "Regola" ADD COLUMN IF NOT EXISTS "attivitaTesto" TEXT`,
  `CREATE TABLE IF NOT EXISTS "IstruzioneThread" (
     "id" TEXT PRIMARY KEY, "utenteId" TEXT NOT NULL, "chiave" TEXT NOT NULL,
     "istruzioni" TEXT NOT NULL,
     "aggiornatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "IstruzioneThread_utenteId_chiave_key" ON "IstruzioneThread"("utenteId","chiave")`,
  // Come è partita una mail in uscita: 'rispondi' | 'inoltra' | 'nuova'
  // (per l'iconcina «inoltrato» nelle liste).
  `ALTER TABLE "Messaggio" ADD COLUMN IF NOT EXISTS "modoInvio" TEXT NOT NULL DEFAULT ''`,
  // Appuntamenti ricorrenti: le occorrenze sono righe vere legate da serieId.
  `ALTER TABLE "Evento" ADD COLUMN IF NOT EXISTS "serieId" TEXT`,
  `ALTER TABLE "Evento" ADD COLUMN IF NOT EXISTS "regola" TEXT NOT NULL DEFAULT ''`,
  `CREATE INDEX IF NOT EXISTS "Evento_serieId_idx" ON "Evento"("serieId")`,
  // Allegati grandi caricati a pezzi (il corpo di una richiesta su Vercel non
  // può superare 4,5 MB: i file grossi arrivano a blocchi e si ricompongono).
  `CREATE TABLE IF NOT EXISTS "AllegatoCaricato" (
     "id" TEXT PRIMARY KEY, "utenteId" TEXT NOT NULL, "gruppo" TEXT NOT NULL,
     "file" INTEGER NOT NULL, "parte" INTEGER NOT NULL,
     "nome" TEXT NOT NULL, "tipo" TEXT NOT NULL DEFAULT '', "dati" BYTEA NOT NULL,
     "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS "AllegatoCaricato_utenteId_gruppo_idx" ON "AllegatoCaricato"("utenteId","gruppo")`,
  // PLUS AI su una conversazione (una riga per ogni mail del thread).
  `CREATE TABLE IF NOT EXISTS "ThreadAI" (
     "id" TEXT PRIMARY KEY, "utenteId" TEXT NOT NULL, "chiave" TEXT NOT NULL,
     "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ThreadAI_utenteId_chiave_key" ON "ThreadAI"("utenteId","chiave")`,
  // Pulizia dei DOPPIONI di attività non fatte: stessa persona, stesso titolo,
  // stessa mail (o stesso contatto). Si tiene la più vecchia (o, a parità,
  // l'id minore) e si eliminano le copie. Non tocca le attività già FATTE.
  // Idempotente: al secondo giro non trova più niente da cancellare.
  `DELETE FROM "Attivita" a
     USING "Attivita" b
     WHERE a."fatta" = false AND b."fatta" = false
       AND a."utenteId" = b."utenteId"
       AND a."titolo" = b."titolo"
       AND COALESCE(a."messaggioId", '') = COALESCE(b."messaggioId", '')
       AND COALESCE(a."contattoEmail", '') = COALESCE(b."contattoEmail", '')
       AND (a."creataIl" > b."creataIl" OR (a."creataIl" = b."creataIl" AND a."id" > b."id"))`,
  // Dimensione in byte del messaggio (per l'ordinamento della posta).
  `ALTER TABLE "Messaggio" ADD COLUMN IF NOT EXISTS "dimensione" INTEGER`,
  // Alias dei contatti (un nome tuo per un indirizzo, capito anche dall'AI).
  `CREATE TABLE IF NOT EXISTS "AliasContatto" (
     "id" TEXT PRIMARY KEY, "utenteId" TEXT NOT NULL, "email" TEXT NOT NULL,
     "alias" TEXT NOT NULL, "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AliasContatto_utenteId_email_key" ON "AliasContatto"("utenteId","email")`,
  // Riempimento una-tantum sullo STORICO: le mail scaricate prima di questo
  // campo hanno dimensione nulla (= 0), quindi l'ordinamento per dimensione non
  // faceva niente. Qui si stima dai byte del corpo già salvati (testo + HTML):
  // non è il byte esatto della mail grezza, ma dà un ordine sensato. Le nuove
  // mail continuano a memorizzare la dimensione reale. Idempotente: gira solo
  // sulle righe ancora NULL.
  `UPDATE "Messaggio"
     SET "dimensione" = octet_length("corpoTesto") + COALESCE(octet_length("corpoHtml"), 0)
     WHERE "dimensione" IS NULL`,
  // Marcatore anti-doppia-notifica push.
  `ALTER TABLE "Messaggio" ADD COLUMN IF NOT EXISTS "notificatoIl" TIMESTAMP(3)`,
  // Conversazioni chiuse (fuori dai Top thread, etichetta «Chiuso»).
  `CREATE TABLE IF NOT EXISTS "ThreadChiuso" (
     "id" TEXT PRIMARY KEY, "utenteId" TEXT NOT NULL, "chiave" TEXT NOT NULL,
     "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ThreadChiuso_utenteId_chiave_key" ON "ThreadChiuso"("utenteId","chiave")`,
  // Nome dato a mano a una conversazione (per ritrovarla e cercarla).
  `CREATE TABLE IF NOT EXISTS "NomeThread" (
     "id" TEXT PRIMARY KEY, "utenteId" TEXT NOT NULL, "chiave" TEXT NOT NULL,
     "nome" TEXT NOT NULL,
     "aggiornatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "NomeThread_utenteId_chiave_key" ON "NomeThread"("utenteId","chiave")`,
  // Pulizia una-tantum delle mail arrivate in più copie (stesso Message-ID,
  // uid diversi: alias/inoltri). Si tiene la copia con uid più basso; le
  // attività/bozze delle copie cadono in cascata (erano duplicate anche loro).
  // Idempotente: al secondo giro non trova più niente da cancellare.
  `DELETE FROM "Messaggio" m
     USING "Messaggio" k
     WHERE m."direzione" = 'entrata' AND k."direzione" = 'entrata'
       AND m."messageId" IS NOT NULL
       AND m."utenteId" = k."utenteId" AND m."messageId" = k."messageId"
       AND (k."uid" < m."uid" OR (k."uid" = m."uid" AND k."id" < m."id"))`,
  // Sottosezioni + riassunti AI per sezione.
  `ALTER TABLE "Sezione" ADD COLUMN IF NOT EXISTS "genitoreId" TEXT`,
  `CREATE INDEX IF NOT EXISTS "Sezione_utenteId_genitoreId_idx" ON "Sezione"("utenteId","genitoreId")`,
  `CREATE TABLE IF NOT EXISTS "RiassuntoSezione" (
     "id" TEXT PRIMARY KEY, "utenteId" TEXT NOT NULL, "sezioneId" TEXT NOT NULL,
     "taglio" TEXT NOT NULL, "giorni" INTEGER NOT NULL DEFAULT 7,
     "testo" TEXT NOT NULL, "punti" TEXT NOT NULL DEFAULT '',
     "messaggiVisti" INTEGER NOT NULL DEFAULT 0, "threadVisti" INTEGER NOT NULL DEFAULT 0,
     "generatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS "RiassuntoSezione_utenteId_sezioneId_generatoIl_idx" ON "RiassuntoSezione"("utenteId","sezioneId","generatoIl")`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Sezione_genitoreId_fkey') THEN
       ALTER TABLE "Sezione" ADD CONSTRAINT "Sezione_genitoreId_fkey"
         FOREIGN KEY ("genitoreId") REFERENCES "Sezione"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='RiassuntoSezione_utenteId_fkey') THEN
       ALTER TABLE "RiassuntoSezione" ADD CONSTRAINT "RiassuntoSezione_utenteId_fkey"
         FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='RiassuntoSezione_sezioneId_fkey') THEN
       ALTER TABLE "RiassuntoSezione" ADD CONSTRAINT "RiassuntoSezione_sezioneId_fkey"
         FOREIGN KEY ("sezioneId") REFERENCES "Sezione"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
   END $$`,
  // Traduzioni fatte a torto: mail in una lingua che l'utente ha spuntato come
  // "già letta" ma tradotte lo stesso (il vecchio codice si fidava del prompt).
  // Si butta solo la traduzione: la mail e la lingua rilevata restano.
  `UPDATE "Messaggio" m SET "corpoTradotto" = NULL
     FROM "Utente" u
     WHERE m."utenteId" = u."id"
       AND m."corpoTradotto" IS NOT NULL
       AND m."lingua" IS NOT NULL
       AND position(lower(trim(m."lingua")) in lower(u."lingueLette")) > 0`,
  // Traduzioni FINTE: il campo traduzione contiene (quasi) l'originale, così il
  // badge "Tradotto" compare su un testo ancora straniero. Confronto sui primi
  // 300 caratteri, normalizzati (minuscole, spazi compattati).
  `UPDATE "Messaggio" SET "corpoTradotto" = NULL
     WHERE "corpoTradotto" IS NOT NULL
       AND left(lower(regexp_replace("corpoTradotto", '\\s+', ' ', 'g')), 300)
         = left(lower(regexp_replace("corpoTesto", '\\s+', ' ', 'g')), 300)`,
  // Renè AI: memoria, analisi, proposte e conseguenze.
  `CREATE TABLE IF NOT EXISTS "ReneMemoria" (
     "id" TEXT PRIMARY KEY, "utenteId" TEXT NOT NULL UNIQUE,
     "testo" TEXT NOT NULL DEFAULT '',
     "aggiornatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS "ReneAnalisi" (
     "id" TEXT PRIMARY KEY, "utenteId" TEXT NOT NULL,
     "periodo" TEXT NOT NULL, "riassunto" TEXT NOT NULL,
     "urgenti" TEXT NOT NULL DEFAULT '[]',
     "creataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS "ReneAnalisi_utenteId_creataIl_idx" ON "ReneAnalisi"("utenteId","creataIl")`,
  `CREATE TABLE IF NOT EXISTS "ReneProposta" (
     "id" TEXT PRIMARY KEY, "utenteId" TEXT NOT NULL, "analisiId" TEXT,
     "tipo" TEXT NOT NULL, "dati" TEXT NOT NULL, "firma" TEXT NOT NULL,
     "stato" TEXT NOT NULL DEFAULT 'proposta', "esitoTesto" TEXT NOT NULL DEFAULT '',
     "daConseguenza" BOOLEAN NOT NULL DEFAULT false,
     "creataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS "ReneProposta_utenteId_stato_creataIl_idx" ON "ReneProposta"("utenteId","stato","creataIl")`,
  `CREATE INDEX IF NOT EXISTS "ReneProposta_utenteId_firma_idx" ON "ReneProposta"("utenteId","firma")`,
  `CREATE TABLE IF NOT EXISTS "ReneConseguenza" (
     "id" TEXT PRIMARY KEY, "utenteId" TEXT NOT NULL,
     "tipo" TEXT NOT NULL, "descrizione" TEXT NOT NULL DEFAULT '',
     "attiva" BOOLEAN NOT NULL DEFAULT true,
     "creataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ReneConseguenza_utenteId_tipo_key" ON "ReneConseguenza"("utenteId","tipo")`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ReneMemoria_utenteId_fkey') THEN
       ALTER TABLE "ReneMemoria" ADD CONSTRAINT "ReneMemoria_utenteId_fkey"
         FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ReneAnalisi_utenteId_fkey') THEN
       ALTER TABLE "ReneAnalisi" ADD CONSTRAINT "ReneAnalisi_utenteId_fkey"
         FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ReneProposta_utenteId_fkey') THEN
       ALTER TABLE "ReneProposta" ADD CONSTRAINT "ReneProposta_utenteId_fkey"
         FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ReneProposta_analisiId_fkey') THEN
       ALTER TABLE "ReneProposta" ADD CONSTRAINT "ReneProposta_analisiId_fkey"
         FOREIGN KEY ("analisiId") REFERENCES "ReneAnalisi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ReneConseguenza_utenteId_fkey') THEN
       ALTER TABLE "ReneConseguenza" ADD CONSTRAINT "ReneConseguenza_utenteId_fkey"
         FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
   END $$`,
  // Intervallo di sincronizzazione automatica scelto dall'utente (secondi).
  `ALTER TABLE "Utente" ADD COLUMN IF NOT EXISTS "sincronizzaOgniSec" INTEGER NOT NULL DEFAULT 300`,
  // Default portato a 5 minuti per tutti. Sposta a 300 solo chi era ancora sul
  // vecchio default (60): chi ha scelto un altro valore non viene toccato.
  `ALTER TABLE "Utente" ALTER COLUMN "sincronizzaOgniSec" SET DEFAULT 300`,
  `UPDATE "Utente" SET "sincronizzaOgniSec" = 300 WHERE "sincronizzaOgniSec" = 60`,
  // Scarico automatico di tutta la posta di sempre (storico) in background.
  `ALTER TABLE "Utente" ADD COLUMN IF NOT EXISTS "scaricaStoricoAuto" BOOLEAN NOT NULL DEFAULT false`,
  // L'impostazione è stata RITIRATA (lo storico si prende on-demand in fondo
  // alla lista): spunta tolta a tutti, così il drain in background non riparte.
  `UPDATE "Utente" SET "scaricaStoricoAuto" = false WHERE "scaricaStoricoAuto" = true`,
  // Dati della firma (JSON) per riaprire il form di modifica.
  `ALTER TABLE "Utente" ADD COLUMN IF NOT EXISTS "firmaDati" TEXT NOT NULL DEFAULT ''`,
  // Flag "ignora verifica certificato TLS" per casella (register.it & simili).
  `ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "ignoraCertTls" BOOLEAN NOT NULL DEFAULT false`,
  // Cursori per lo storico della cartella "Inviata" (scarico inviati in background).
  `ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "ultimoUidInviata" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "primoUidInviata" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "storicoInviataFinito" BOOLEAN NOT NULL DEFAULT false`,
  // Iscrizioni alle notifiche push (Web Push).
  `CREATE TABLE IF NOT EXISTS "PushIscrizione" (
     "id" TEXT PRIMARY KEY,
     "utenteId" TEXT NOT NULL,
     "endpoint" TEXT NOT NULL UNIQUE,
     "p256dh" TEXT NOT NULL,
     "auth" TEXT NOT NULL,
     "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "PushIscrizione_utenteId_fkey"
       FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE
   )`,
  `CREATE INDEX IF NOT EXISTS "PushIscrizione_utenteId_idx" ON "PushIscrizione"("utenteId")`,
  // Appuntamento proposto dall'AI su una mail (invito a riunione).
  `ALTER TABLE "Messaggio" ADD COLUMN IF NOT EXISTS "eventoProposto" TEXT`,
  // Aggancio manuale delle mail a una conversazione.
  `ALTER TABLE "Messaggio" ADD COLUMN IF NOT EXISTS "threadManuale" TEXT`,
  `CREATE INDEX IF NOT EXISTS "Messaggio_utenteId_threadManuale_idx" ON "Messaggio"("utenteId","threadManuale")`,
  // Sgancio manuale di una mail da una conversazione (isola dal legame naturale).
  `ALTER TABLE "Messaggio" ADD COLUMN IF NOT EXISTS "scollegato" BOOLEAN NOT NULL DEFAULT false`,
  // Sequenze di follow-up: modelli a passi + iscrizioni dei destinatari.
  `CREATE TABLE IF NOT EXISTS "Sequenza" (
     "id" TEXT PRIMARY KEY, "utenteId" TEXT NOT NULL,
     "nome" TEXT NOT NULL, "descrizione" TEXT NOT NULL DEFAULT '',
     "attiva" BOOLEAN NOT NULL DEFAULT true,
     "creataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS "Sequenza_utenteId_idx" ON "Sequenza"("utenteId")`,
  `CREATE TABLE IF NOT EXISTS "SequenzaPasso" (
     "id" TEXT PRIMARY KEY, "sequenzaId" TEXT NOT NULL,
     "ordine" INTEGER NOT NULL, "giorniAttesa" INTEGER NOT NULL DEFAULT 3,
     "oggetto" TEXT NOT NULL, "corpo" TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "SequenzaPasso_sequenzaId_ordine_idx" ON "SequenzaPasso"("sequenzaId","ordine")`,
  `CREATE TABLE IF NOT EXISTS "SequenzaIscrizione" (
     "id" TEXT PRIMARY KEY, "utenteId" TEXT NOT NULL, "sequenzaId" TEXT NOT NULL,
     "destinatario" TEXT NOT NULL, "nomeDestinatario" TEXT NOT NULL DEFAULT '',
     "oggettoIniziale" TEXT NOT NULL DEFAULT '', "thread" TEXT,
     "passoFatto" INTEGER NOT NULL DEFAULT 0, "prossimoInvio" TIMESTAMP(3),
     "stato" TEXT NOT NULL DEFAULT 'attiva', "esito" TEXT NOT NULL DEFAULT '',
     "creataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS "SequenzaIscrizione_utenteId_stato_prossimoInvio_idx" ON "SequenzaIscrizione"("utenteId","stato","prossimoInvio")`,
  // Percorsi A/B: ramo su passo e su iscrizione (A = se non risponde, B = se risponde).
  `ALTER TABLE "SequenzaPasso" ADD COLUMN IF NOT EXISTS "ramo" TEXT NOT NULL DEFAULT 'A'`,
  `ALTER TABLE "SequenzaIscrizione" ADD COLUMN IF NOT EXISTS "ramo" TEXT NOT NULL DEFAULT 'A'`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Sequenza_utenteId_fkey') THEN
       ALTER TABLE "Sequenza" ADD CONSTRAINT "Sequenza_utenteId_fkey"
         FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SequenzaPasso_sequenzaId_fkey') THEN
       ALTER TABLE "SequenzaPasso" ADD CONSTRAINT "SequenzaPasso_sequenzaId_fkey"
         FOREIGN KEY ("sequenzaId") REFERENCES "Sequenza"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SequenzaIscrizione_utenteId_fkey') THEN
       ALTER TABLE "SequenzaIscrizione" ADD CONSTRAINT "SequenzaIscrizione_utenteId_fkey"
         FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SequenzaIscrizione_sequenzaId_fkey') THEN
       ALTER TABLE "SequenzaIscrizione" ADD CONSTRAINT "SequenzaIscrizione_sequenzaId_fkey"
         FOREIGN KEY ("sequenzaId") REFERENCES "Sequenza"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
   END $$`,
  // Inviti via mail sugli eventi: invitati, token dei link, risposte raccolte.
  `ALTER TABLE "Evento" ADD COLUMN IF NOT EXISTS "invitati" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "Evento" ADD COLUMN IF NOT EXISTS "tokenInvito" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "Evento" ADD COLUMN IF NOT EXISTS "risposteInvito" TEXT NOT NULL DEFAULT ''`,
  // Calendario: appuntamenti + token del feed iCal sull'utente.
  `ALTER TABLE "Utente" ADD COLUMN IF NOT EXISTS "tokenCalendario" TEXT NOT NULL DEFAULT ''`,
  `CREATE TABLE IF NOT EXISTS "Evento" (
     "id" TEXT PRIMARY KEY, "utenteId" TEXT NOT NULL,
     "titolo" TEXT NOT NULL, "descrizione" TEXT NOT NULL DEFAULT '',
     "luogo" TEXT NOT NULL DEFAULT '',
     "inizio" TIMESTAMP(3) NOT NULL, "fine" TIMESTAMP(3),
     "giornataIntera" BOOLEAN NOT NULL DEFAULT false,
     "messaggioId" TEXT, "creatoDaAI" BOOLEAN NOT NULL DEFAULT false,
     "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "aggiornatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS "Evento_utenteId_inizio_idx" ON "Evento"("utenteId","inizio")`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Evento_utenteId_fkey') THEN
       ALTER TABLE "Evento" ADD CONSTRAINT "Evento_utenteId_fkey"
         FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Evento_messaggioId_fkey') THEN
       ALTER TABLE "Evento" ADD CONSTRAINT "Evento_messaggioId_fkey"
         FOREIGN KEY ("messaggioId") REFERENCES "Messaggio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
     END IF;
   END $$`,
  // APP DELUXY: regole di smistamento verso le app + storico degli invii.
  `CREATE TABLE IF NOT EXISTS "RegolaApp" (
     "id" TEXT PRIMARY KEY, "utenteId" TEXT NOT NULL,
     "nome" TEXT NOT NULL, "attiva" BOOLEAN NOT NULL DEFAULT true,
     "priorita" INTEGER NOT NULL DEFAULT 0,
     "seMittente" TEXT, "seOggetto" TEXT, "seContiene" TEXT,
     "azioneId" TEXT NOT NULL, "istruzioni" TEXT NOT NULL DEFAULT '',
     "creataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS "RegolaApp_utenteId_attiva_priorita_idx" ON "RegolaApp"("utenteId","attiva","priorita")`,
  `CREATE TABLE IF NOT EXISTS "InvioApp" (
     "id" TEXT PRIMARY KEY, "utenteId" TEXT NOT NULL, "messaggioId" TEXT,
     "azioneId" TEXT NOT NULL, "esito" TEXT NOT NULL,
     "esitoTesto" TEXT NOT NULL, "dati" TEXT NOT NULL DEFAULT '', "link" TEXT,
     "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS "InvioApp_utenteId_creatoIl_idx" ON "InvioApp"("utenteId","creatoIl")`,
  `CREATE INDEX IF NOT EXISTS "InvioApp_messaggioId_idx" ON "InvioApp"("messaggioId")`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='RegolaApp_utenteId_fkey') THEN
       ALTER TABLE "RegolaApp" ADD CONSTRAINT "RegolaApp_utenteId_fkey"
         FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='InvioApp_utenteId_fkey') THEN
       ALTER TABLE "InvioApp" ADD CONSTRAINT "InvioApp_utenteId_fkey"
         FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='InvioApp_messaggioId_fkey') THEN
       ALTER TABLE "InvioApp" ADD CONSTRAINT "InvioApp_messaggioId_fkey"
         FOREIGN KEY ("messaggioId") REFERENCES "Messaggio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
     END IF;
   END $$`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='RiassuntoThread_utenteId_fkey') THEN
       ALTER TABLE "RiassuntoThread" ADD CONSTRAINT "RiassuntoThread_utenteId_fkey"
         FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ContattoAI_utenteId_fkey') THEN
       ALTER TABLE "ContattoAI" ADD CONSTRAINT "ContattoAI_utenteId_fkey"
         FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='IstruzioneThread_utenteId_fkey') THEN
       ALTER TABLE "IstruzioneThread" ADD CONSTRAINT "IstruzioneThread_utenteId_fkey"
         FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='NomeThread_utenteId_fkey') THEN
       ALTER TABLE "NomeThread" ADD CONSTRAINT "NomeThread_utenteId_fkey"
         FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='AliasContatto_utenteId_fkey') THEN
       ALTER TABLE "AliasContatto" ADD CONSTRAINT "AliasContatto_utenteId_fkey"
         FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ThreadChiuso_utenteId_fkey') THEN
       ALTER TABLE "ThreadChiuso" ADD CONSTRAINT "ThreadChiuso_utenteId_fkey"
         FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ThreadAI_utenteId_fkey') THEN
       ALTER TABLE "ThreadAI" ADD CONSTRAINT "ThreadAI_utenteId_fkey"
         FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='AllegatoCaricato_utenteId_fkey') THEN
       ALTER TABLE "AllegatoCaricato" ADD CONSTRAINT "AllegatoCaricato_utenteId_fkey"
         FOREIGN KEY ("utenteId") REFERENCES "Utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
   END $$`,
]

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('[migrate-prod] DATABASE_URL assente: salto (build locale?).')
    return
  }
  const db = new PrismaClient()
  try {
    let ok = 0
    for (const s of stmts) {
      try {
        await db.$executeRawUnsafe(s)
        ok++
      } catch (e) {
        console.warn('[migrate-prod] statement saltato:', String(e?.message || e).split('\n')[0])
      }
    }
    console.log(`[migrate-prod] completata (${ok}/${stmts.length} statement applicati).`)
  } catch (e) {
    console.warn('[migrate-prod] non applicata:', String(e?.message || e).split('\n')[0])
  } finally {
    try { await db.$disconnect() } catch {}
  }
}

// Non far mai fallire il build per la migrazione.
main().catch(() => {}).finally(() => process.exit(0))
