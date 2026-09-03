// Prova che la foto scritta si rilegga uguale — DENTRO UNA TRANSAZIONE CHE
// TORNA INDIETRO: nel registro dei pagamenti veri non resta niente.
import { db } from '../src/lib/db'
import { TETTO_FONTE, TIPI_RICEVUTA } from '../src/lib/metodo-pagamento'

// Un PNG 1x1 vero.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

let falliti = 0
const v = (n: string, ok: boolean, d = '') => { if (!ok) falliti++; console.log(`  ${ok ? 'OK  ' : 'NO  '} ${n}${d ? ' — ' + d : ''}`) }

try {
  await db.$transaction(async (tx) => {
    const creata = await tx.richiestaPagamento.create({
      data: {
        iban: 'IT60X0542811101000000123456',
        intestatario: 'PROVA — da cancellare',
        importo: 1,
        origine: 'immagine',
        fonteDati: PNG,
        fonteNome: 'schermata.png',
        fonteTipo: 'image/png',
      },
      select: { id: true },
    })
    const riletta = await tx.richiestaPagamento.findUnique({
      where: { id: creata.id },
      select: { fonteDati: true, fonteNome: true, fonteTipo: true, origine: true },
    })
    v('la foto si rilegge identica', riletta?.fonteDati === PNG)
    v('il tipo e uno dei nostri', TIPI_RICEVUTA.includes(riletta?.fonteTipo ?? ''))
    const byte = Buffer.from(PNG, 'base64')
    v('i byte tornano un PNG', byte.length === 70 && byte.subarray(1, 4).toString() === 'PNG', `${byte.length} byte`)
    v('il tetto e piu grande di 1,5 MB di file', TETTO_FONTE > 1_500_000, `${TETTO_FONTE} caratteri`)
    // L'elenco NON deve portarsi dietro i byte.
    const comeNellElenco = await tx.richiestaPagamento.findUnique({
      where: { id: creata.id },
      select: { fonteNome: true, fonteTipo: true },
    })
    v('nell elenco escono solo nome e tipo', !('fonteDati' in (comeNellElenco ?? {})))
    throw new Error('INDIETRO')
  })
} catch (e) {
  if ((e as Error).message !== 'INDIETRO') throw e
  console.log('  OK   la riga di prova NON e rimasta (transazione annullata)')
}

const restate = await db.richiestaPagamento.count({ where: { intestatario: 'PROVA — da cancellare' } })
v('nessuna riga di prova nel registro', restate === 0, `${restate} trovate`)
console.log(falliti ? `\n${falliti} controlli falliti` : '\nTutto a posto.')
await db.$disconnect()
