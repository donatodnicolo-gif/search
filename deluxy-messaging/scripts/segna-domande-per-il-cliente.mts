// LE DOMANDE GIÀ APERTE DALL'AI, marcate «per il cliente».
//
// ⚠️⚠️ Correggere il codice non corregge quello che il codice ha già scritto.
// Il 27/08/2026 è nato il campo `DomandaAiuto.perIlCliente`, che è il permesso
// perché la risposta dell'amministratore venga **girata al cliente**. Nasce
// `false`, quindi tutte le domande aperte PRIMA — che sono esattamente quelle
// dei clienti che stanno aspettando — resterebbero fuori dal giro nuovo: si
// risponderebbe dal telefono e al cliente non arriverebbe niente, esattamente
// come prima e senza che nessuno se ne accorga.
//
// ⚠️ Si marcano SOLO quelle che hanno tutte e tre le cose:
//   · aperte dall'AI fuori turno (`utenteNome`), non da una persona;
//   · legate a una conversazione (`conversazioneId` pieno);
//   · ancora aperte.
// Una domanda che un operatore ha scritto per sé («aiutami») non si tocca: la
// sua risposta è una nota di lavoro, e mandarla a un cliente sarebbe il danno
// che questo campo esiste per impedire.
//
// ⚠️ Con `--scrivi` scrive. Senza, dice soltanto cosa farebbe.
//
//   npx tsx scripts/segna-domande-per-il-cliente.mts [--scrivi]
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const scrivi = process.argv.includes('--scrivi')
const db = new PrismaClient()

const candidate = await db.domandaAiuto.findMany({
  where: {
    stato: 'aperta',
    perIlCliente: false,
    utenteNome: 'AI fuori turno',
    conversazioneId: { not: '' },
  },
  orderBy: { creatoIl: 'asc' },
})

console.log(`domande aperte dall'AI, legate a un cliente e non ancora marcate: ${candidate.length}\n`)
for (const d of candidate) {
  const c = await db.conversazione.findUnique({
    where: { id: d.conversazioneId },
    select: { nome: true, idEsterno: true, canale: true, archiviata: true, eliminataIl: true },
  })
  const stato = !c
    ? 'conversazione sparita'
    : c.archiviata || c.eliminataIl
      ? 'conversazione chiusa'
      : 'viva'
  console.log(
    `  ${d.creatoIl.toISOString().slice(5, 16)}  ${(c?.nome || c?.idEsterno || '—').slice(0, 26).padEnd(27)} ${(c?.canale ?? '—').padEnd(10)} ${stato}`
  )
}

if (!scrivi) {
  console.log(`\nPROVA — rilancia con --scrivi per marcarne ${candidate.length}.`)
} else {
  const n = await db.domandaAiuto.updateMany({
    where: { id: { in: candidate.map((d) => d.id) } },
    data: { perIlCliente: true },
  })
  console.log(`\nSCRITTO: ${n.count} marcate «per il cliente».`)
  console.log(
    '⚠️ Da adesso, rispondendo a uno di questi avvisi su WhatsApp, il testo va al cliente.\n' +
      '   Per tenerlo dentro, comincia la risposta con «INTERNO».'
  )
}
await db.$disconnect()
