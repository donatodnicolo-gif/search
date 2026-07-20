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
  // Aggancio manuale delle mail a una conversazione.
  `ALTER TABLE "Messaggio" ADD COLUMN IF NOT EXISTS "threadManuale" TEXT`,
  `CREATE INDEX IF NOT EXISTS "Messaggio_utenteId_threadManuale_idx" ON "Messaggio"("utenteId","threadManuale")`,
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
