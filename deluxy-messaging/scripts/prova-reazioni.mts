// Prova delle reazioni, contro il database vero.
//   npx tsx scripts/prova-reazioni.mts
//
// ⚠️ SCRIVE, ma solo righe sue: crea una conversazione e due messaggi finti con
// un id riconoscibile, ci lavora sopra e **li cancella per id** alla fine. Mai
// un `deleteMany` senza filtro su questo database: è condiviso con le altre app
// ed è già successo di cancellare dati veri.
import { attaccaReazione } from '../src/lib/reazioni'
import { db } from '../src/lib/db'

const MARCA = `prova-reazioni-${process.pid}`
let falliti = 0
function prova(nome: string, avuto: unknown, atteso: unknown) {
  const ok = JSON.stringify(avuto) === JSON.stringify(atteso)
  if (!ok) falliti++
  console.log(
    `${ok ? 'OK  ' : 'NO  '} ${nome}${ok ? '' : `\n     avuto  ${JSON.stringify(avuto)}\n     atteso ${JSON.stringify(atteso)}`}`
  )
}

const conv = await db.conversazione.create({
  data: { canale: 'whatsapp', idEsterno: MARCA, numeroId: MARCA, nome: 'Prova' },
})
const msg = await db.messaggio.create({
  data: {
    conversazioneId: conv.id,
    direzione: 'in',
    testo: 'Grazie mille!',
    idEsterno: `${MARCA}-messaggio`,
  },
})
const quandoNasce = conv.ultimoMessaggioIl

try {
  // ── Il caso normale ──
  prova('trova il messaggio a cui è attaccata', await attaccaReazione(`${MARCA}-messaggio`, '❤️'), true)
  prova(
    'l’emoji finisce SUL messaggio',
    (await db.messaggio.findUnique({ where: { id: msg.id } }))?.reazione,
    '❤️'
  )
  prova('non è nata una riga nuova', await db.messaggio.count({ where: { conversazioneId: conv.id } }), 1)

  // ⚠️ Una reazione non deve rimettere la conversazione in cima: il filo si
  // ordina per `ultimoMessaggioIl`, e un pollice non è lavoro da fare.
  prova(
    'la conversazione non risale in cima',
    (await db.conversazione.findUnique({ where: { id: conv.id } }))?.ultimoMessaggioIl?.getTime(),
    quandoNasce.getTime()
  )

  // ── Cambiare reazione ──
  await attaccaReazione(`${MARCA}-messaggio`, '👍')
  prova(
    'la seconda emoji sostituisce la prima',
    (await db.messaggio.findUnique({ where: { id: msg.id } }))?.reazione,
    '👍'
  )

  // ── Toglierla ──
  // ⚠️ L'emoji vuota è l'ANNULLAMENTO, non un evento da ignorare: chi leva il
  // cuore se lo deve veder sparire.
  await attaccaReazione(`${MARCA}-messaggio`, '')
  prova(
    'l’emoji vuota toglie la reazione',
    (await db.messaggio.findUnique({ where: { id: msg.id } }))?.reazione,
    ''
  )

  // ── Il messaggio non c'è ──
  // Chi chiama, con `false`, scrive una riga normale: l'emoji non si perde.
  prova('un id che non esiste torna false', await attaccaReazione('mai-visto', '😀'), false)
  prova('un id vuoto torna false', await attaccaReazione('', '😀'), false)
} finally {
  // ⚠️ Per ID, e solo i miei.
  await db.messaggio.deleteMany({ where: { conversazioneId: conv.id } })
  await db.conversazione.delete({ where: { id: conv.id } })
  const rimaste = await db.conversazione.count({ where: { idEsterno: MARCA } })
  console.log(`\npulizia: ${rimaste === 0 ? 'fatta, non resta niente' : 'ATTENZIONE, resta qualcosa'}`)
  await db.$disconnect()
}

console.log(falliti === 0 ? '\nTutti i casi passano.' : `\n${falliti} FALLITI`)
process.exit(falliti === 0 ? 0 : 1)
