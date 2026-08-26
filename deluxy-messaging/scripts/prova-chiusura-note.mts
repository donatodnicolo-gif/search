// Prova di `chiudiNoteDellOrdine` sul database vero, con righe FINTE che si
// cancellano da sole.
//
// ⚠️ Le note di prova stanno su un numero d'ordine che non esiste (#999999) e si
// cancellano per ID alla fine: mai un `deleteMany` largo su un database
// condiviso con altre quattordici app.
//
//   npx tsx scripts/prova-chiusura-note.mts
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { chiudiNoteDellOrdine } from '../src/lib/diario-chiusura'

const db = new PrismaClient()
const FINTO = '999999'
let male = 0
const prova = (nome: string, ok: boolean, extra = '') => {
  if (!ok) male++
  console.log(`${ok ? '  ok ' : '  NO '} ${nome}${extra ? ' — ' + extra : ''}`)
}

const creati: string[] = []
try {
  // Tre righe: due sul finto (una col cancelletto, una senza, come stanno
  // davvero in tabella) e una GIÀ FATTA, che non va toccata.
  const conCanc = await db.notaDiario.create({
    data: { ordineNumero: `#${FINTO}`, testo: 'prova A', autoreNome: 'Prova' },
  })
  const senzaCanc = await db.notaDiario.create({
    data: { ordineNumero: FINTO, testo: 'prova B', autoreNome: 'Prova' },
  })
  const giaFatta = await db.notaDiario.create({
    data: {
      ordineNumero: `#${FINTO}`,
      testo: 'prova C',
      autoreNome: 'Prova',
      fatta: true,
      fattaIl: new Date('2020-01-01'),
      fattaDaNome: 'Qualcun altro',
    },
  })
  // Una quarta su un ALTRO numero: non deve essere toccata.
  const altroOrdine = await db.notaDiario.create({
    data: { ordineNumero: '#999998', testo: 'prova D', autoreNome: 'Prova' },
  })
  creati.push(conCanc.id, senzaCanc.id, giaFatta.id, altroOrdine.id)

  const quante = await chiudiNoteDellOrdine(`#${FINTO}`, 'Chi Ha Premuto')
  prova('ne chiude due (col cancelletto e senza)', quante === 2, `ne ha chiuse ${quante}`)

  const dopo = await db.notaDiario.findMany({
    where: { id: { in: creati } },
    select: { id: true, testo: true, fatta: true, fattaDaNome: true, fattaIl: true },
  })
  const per = new Map(dopo.map((n) => [n.testo, n]))
  prova('A è chiusa', per.get('prova A')?.fatta === true)
  prova('B è chiusa (numero SENZA cancelletto)', per.get('prova B')?.fatta === true)
  prova('porta il nome di chi ha premuto', per.get('prova A')?.fattaDaNome === 'Chi Ha Premuto')
  prova(
    'la già fatta NON viene riscritta',
    per.get('prova C')?.fattaDaNome === 'Qualcun altro' &&
      per.get('prova C')?.fattaIl?.getFullYear() === 2020,
    `${per.get('prova C')?.fattaDaNome} · ${per.get('prova C')?.fattaIl?.toISOString()}`
  )
  prova("la nota di un ALTRO ordine resta aperta", per.get('prova D')?.fatta === false)

  // Rilanciarla non deve trovare più niente da fare.
  const ancora = await chiudiNoteDellOrdine(`#${FINTO}`, 'Chi Ha Premuto')
  prova('rilanciandola non chiude niente', ancora === 0, `ne ha chiuse ${ancora}`)

  // Un numero vuoto non deve toccare NIENTE (sarebbe la peggiore: chiuderebbe
  // tutte le note senza ordine).
  const vuoto = await chiudiNoteDellOrdine('', 'Chi Ha Premuto')
  prova('con numero vuoto non tocca niente', vuoto === 0, `ne ha chiuse ${vuoto}`)
} finally {
  // ⚠️ Per ID, uno per uno: le righe di prova le ho create io e cancello solo
  // quelle.
  for (const id of creati) await db.notaDiario.delete({ where: { id } }).catch(() => {})
  const rimaste = await db.notaDiario.count({ where: { ordineNumero: { in: [`#${FINTO}`, FINTO, '#999998'] } } })
  prova('le righe di prova sono state ripulite', rimaste === 0, `${rimaste} rimaste`)
  await db.$disconnect()
}
console.log(male ? `\n${male} PROVE FALLITE` : '\nTutte le prove passate.')
process.exit(male ? 1 : 0)
