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
