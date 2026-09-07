// Riparazione idempotente (04/09/2026): rimette in posta in arrivo le mail a cui
// una persona ha dato una priorità e che l'AI, rileggendole, aveva messo in SPAM
// (la posta in arrivo nasconde solo quella sezione: la mail «spariva»).
//
//   cd deluxy-mail; node --env-file=.env scripts/ripara-priorita-spam.mjs
//
// Rieseguirlo non fa danni: se non trova righe colpite non scrive niente.
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const colpite = await db.messaggio.findMany({
  where: { prioritaDa: 'manuale', direzione: 'entrata', smistatoDa: 'ai', sezione: { nome: 'SPAM' } },
  select: { id: true, oggetto: true, priorita: true, utente: { select: { email: true } } },
})
for (const c of colpite) console.log('PRIMA:', c.utente.email, c.priorita, c.oggetto.slice(0, 60))

const esito = colpite.length
  ? await db.messaggio.updateMany({
      where: { id: { in: colpite.map((c) => c.id) } },
      data: { sezioneId: null, smistatoDa: null },
    })
  : { count: 0 }
console.log('rimesse in arrivo:', esito.count)

const dopo = await db.messaggio.count({
  where: { prioritaDa: 'manuale', direzione: 'entrata', sezione: { nome: 'SPAM' } },
})
console.log('manuali ancora in SPAM:', dopo)
await db.$disconnect()
