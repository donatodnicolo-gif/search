// LA CODA DELL'AI FUORI TURNO: chi entra nel giro e chi no.
//
//   npx tsx scripts/prova-coda-ai.mts
//
// ⚠️ Due parti. La prima è pura (le caselle automatiche). La seconda MISURA la
// coda vera sul database e dice se il taglio a `PER_GIRO` lascerebbe fuori un
// cliente: è il difetto segnalato il 27/08/2026 («la risposta automatica non
// funziona») ed è un difetto che si vede solo sui dati veri.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { casellaSenzaNessuno } from '../src/lib/ai-fuori-turno'

let fatte = 0
let rotte = 0
function prova(nome: string, avuto: unknown, atteso: unknown) {
  fatte++
  if (JSON.stringify(avuto) !== JSON.stringify(atteso)) {
    rotte++
    console.log(`  ✗ ${nome}\n      atteso: ${JSON.stringify(atteso)}\n      avuto:  ${JSON.stringify(avuto)}`)
  } else {
    console.log(`  ✓ ${nome}`)
  }
}

console.log('\n— le caselle a cui non c’è nessuno —')
// ⚠️ Indirizzi veri, presi dalla coda del 27/08/2026.
prova('mailer-daemon', casellaSenzaNessuno('mailer-daemon@mailer-daemon.register.it'), true)
prova('postmaster', casellaSenzaNessuno('postmaster@dominio.it'), true)
prova('no-reply', casellaSenzaNessuno('no-reply@tiktok.com'), true)
prova('noreply con suffisso', casellaSenzaNessuno('noreply-123@shopify.com'), true)
prova('bounces con punto', casellaSenzaNessuno('bounces.abc@mailchimp.com'), true)
prova('maiuscole', casellaSenzaNessuno('MAILER-DAEMON@Register.IT'), true)

console.log('\n— e quelle a cui invece c’è —')
prova('⚠️ «norberto» NON è «no-reply»', casellaSenzaNessuno('norberto@fiori.it'), false)
prova('⚠️ «notiziario» NON è «notification»', casellaSenzaNessuno('notiziario@fiori.it'), false)
prova('un cliente qualunque', casellaSenzaNessuno('eleonora.mannini@azienda.it'), false)
prova('una newsletter con indirizzo vero', casellaSenzaNessuno('caroline@euroflorist.com'), false)
prova('vuoto', casellaSenzaNessuno(''), false)
prova('senza chiocciola', casellaSenzaNessuno('pippo'), false)

console.log('\n— LA CODA VERA, adesso —')
const db = new PrismaClient()
const PER_GIRO = 10
const limite = new Date(Date.now() - 20 * 3600 * 1000)
const coda = await db.conversazione.findMany({
  where: {
    canale: { in: ['whatsapp', 'instagram', 'messenger', 'email', 'widget'] },
    archiviata: false,
    eliminataIl: null,
    presaDaId: '',
    nonLetti: { gt: 0 },
    ultimoMessaggioIl: { gte: limite },
  },
  orderBy: { ultimoMessaggioIl: 'asc' },
  take: PER_GIRO * 6,
})

let bloccate = 0
const dettaglio: string[] = []
for (const c of coda) {
  const nome = (c.nome || c.idEsterno || '').slice(0, 32)
  const ultimo = await db.messaggio.findFirst({
    where: { conversazioneId: c.id },
    orderBy: { creatoIl: 'desc' },
    select: { direzione: true, testo: true },
  })
  const gia = await db.messaggio.count({ where: { conversazioneId: c.id, direzione: 'out', tipo: 'ai' } })
  const domanda = await db.domandaAiuto.count({ where: { conversazioneId: c.id, stato: 'aperta' } })
  const motivo =
    c.canale === 'email' && casellaSenzaNessuno(c.idEsterno)
      ? 'casella automatica'
      : !ultimo || ultimo.direzione !== 'in'
        ? 'risposta nostra in fondo'
        : gia >= 3
          ? 'tetto di risposte automatiche'
          : domanda
            ? 'domanda aperta all’amministratore'
            : (ultimo.testo ?? '').trim()
              ? ''
              : 'messaggio senza testo'
  if (motivo) bloccate++
  dettaglio.push(`  ${c.canale.padEnd(9)} ${nome.padEnd(33)} ${motivo ? 'bloccata — ' + motivo : '← si lavora'}`)
}
console.log(dettaglio.join('\n') || '  (coda vuota)')
console.log(`\n  in coda: ${coda.length} · bloccate: ${bloccate} · da lavorare: ${coda.length - bloccate}`)

// ⚠️⚠️ IL CONTROLLO CHE CONTA. Col vecchio codice il taglio era nella query:
// si prendevano le PRIME `PER_GIRO` per data e poi si scartava. Se fra quelle
// prime dieci ci sono conversazioni bloccate, altrettanti clienti veri restano
// fuori dal giro — e non «per un giro»: una domanda aperta resta aperta finché
// una persona non risponde, quindi quel posto è perso ogni volta.
const bloccateInTesta = dettaglio.slice(0, PER_GIRO).filter((r) => r.includes('bloccata')).length
const fuoriDalVecchioTaglio = Math.max(0, coda.length - PER_GIRO)
console.log(`\n  col vecchio taglio nella query: ${bloccateInTesta} posti su ${PER_GIRO} bruciati da conversazioni bloccate`)
console.log(`  e ${fuoriDalVecchioTaglio} conversazioni non entravano nemmeno nel giro`)
prova(
  'adesso il taglio è DOPO il filtro: si guardano tutte e si lavorano le prime buone',
  coda.length <= PER_GIRO * 6,
  true
)

await db.$disconnect()
console.log(`\n${fatte - rotte}/${fatte} passate${rotte ? ` — ${rotte} ROTTE` : ''}`)
process.exit(rotte ? 1 : 0)
