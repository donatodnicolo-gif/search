// Prova le due cose nuove contro il database vero.
//   npx tsx scripts/prova-nota-e-rileggere.mts
//
// 1. LA NOTA DI DIARIO NATA IN CHAT deve tornare da tutte e due le parti: da
//    quella conversazione e — se la conversazione ha un ordine — dalla scheda
//    di quell'ordine. È il punto della feature: scriverla due volte sarebbe
//    l'unico modo per averne due versioni diverse.
// 2. IL SEGNO «DA RILEGGERE» deve far crescere di uno il numero di «chi aspetta
//    una risposta» della dashboard, e non deve toccare `nonLetti`.
//    ⚠️ È il controllo che conta: le due schermate leggono da due funzioni
//    diverse, e se una contasse il segno e l'altra no direbbero numeri diversi
//    sulla stessa cosa — senza che nessuna delle due dia errore.
//
// ⚠️ Scrive UNA riga di prova e se la ricancella per id a fine giro. Non tocca
// nessun dato vero: il segno sulla conversazione viene rimesso com'era.
import { db } from '../src/lib/db'
import { formeNumero } from '../src/lib/diario'
import { datiDashboard } from '../src/lib/dashboard'

let falliti = 0
function verifica(nome: string, ok: boolean, dettaglio = '') {
  if (!ok) falliti++
  console.log(`  ${ok ? 'OK  ' : 'NO  '} ${nome}${dettaglio ? ' — ' + dettaglio : ''}`)
}

// Una conversazione vera, meglio se con un ordine collegato: è il caso in cui
// la nota deve comparire in due posti.
const conv =
  (await db.conversazione.findFirst({
    where: { eliminataIl: null, ordineNumero: { not: '' } },
    orderBy: { ultimoMessaggioIl: 'desc' },
  })) ?? (await db.conversazione.findFirst({ where: { eliminataIl: null } }))

if (!conv) {
  console.log('Nessuna conversazione nel database: non c’è niente da provare.')
  await db.$disconnect()
  process.exit(0)
}

const chi = conv.nomeRubrica || conv.nome || conv.idEsterno
console.log(`\n── La nota, su «${chi}»${conv.ordineNumero ? ` (ordine ${conv.ordineNumero})` : ''} ──`)

const nota = await db.notaDiario.create({
  data: {
    testo: 'PROVA AUTOMATICA — si cancella da sola',
    conversazioneId: conv.id,
    conversazioneChi: chi.slice(0, 80),
    ordineNumero: conv.ordineNumero || '',
    autoreId: '',
    autoreNome: 'prova',
  },
})

try {
  // Come la cerca il pannello dentro la chat (`?conversazione=`).
  const dallaChat = await db.notaDiario.findMany({ where: { conversazioneId: conv.id } })
  verifica(
    'si ritrova dalla conversazione',
    dallaChat.some((n) => n.id === nota.id),
    `${dallaChat.length} note su questa chat`
  )

  // Come la cerca la scheda dell'ordine (`?ordine=`), che confronta le due
  // forme del numero — col cancelletto e senza.
  if (conv.ordineNumero) {
    const dallOrdine = await db.notaDiario.findMany({
      where: { ordineNumero: { in: formeNumero(conv.ordineNumero) } },
    })
    verifica(
      'si ritrova anche dall’ordine',
      dallOrdine.some((n) => n.id === nota.id),
      `${dallOrdine.length} note su ${conv.ordineNumero}`
    )
  } else {
    console.log('  --  senza ordine collegato: il secondo controllo non si applica')
  }

  verifica(
    'porta scritto di chi parlava',
    nota.conversazioneChi === chi.slice(0, 80),
    nota.conversazioneChi
  )

  // ── Il segno «da rileggere» ──
  console.log('\n── Il segno «da rileggere» ──')
  const prima = await datiDashboard()
  const eraSegnata = conv.daRileggere
  const nonLettiPrima = conv.nonLetti

  await db.conversazione.update({ where: { id: conv.id }, data: { daRileggere: true } })
  const dopo = await datiDashboard()
  const riletta = await db.conversazione.findUniqueOrThrow({ where: { id: conv.id } })

  // ⚠️ Se la conversazione aveva già messaggi non letti era GIÀ in coda: il
  // numero non deve cambiare, e contarla due volte sarebbe il difetto.
  const eraGiaInCoda = nonLettiPrima > 0 || eraSegnata
  const atteso = eraGiaInCoda ? prima.numeri.daRispondere : prima.numeri.daRispondere + 1
  verifica(
    eraGiaInCoda ? 'era già in coda: il numero non si muove' : 'entra fra chi aspetta risposta',
    dopo.numeri.daRispondere === atteso,
    `${prima.numeri.daRispondere} → ${dopo.numeri.daRispondere} (atteso ${atteso})`
  )
  verifica(
    'non tocca il contatore dei messaggi non letti',
    riletta.nonLetti === nonLettiPrima,
    `${nonLettiPrima} → ${riletta.nonLetti}`
  )

  // Rimesso com'era.
  await db.conversazione.update({
    where: { id: conv.id },
    data: { daRileggere: eraSegnata },
  })
  const tornata = await db.conversazione.findUniqueOrThrow({ where: { id: conv.id } })
  verifica('la conversazione torna com’era', tornata.daRileggere === eraSegnata)
} finally {
  // ⚠️ Per ID e solo questa: sul Postgres condiviso una cancellazione a filtro
  // largo porterebbe via righe vere.
  await db.notaDiario.delete({ where: { id: nota.id } })
  const resta = await db.notaDiario.findUnique({ where: { id: nota.id } })
  verifica('la riga di prova è stata cancellata', resta === null)
}

console.log(falliti === 0 ? '\nTutto torna.' : `\n${falliti} CONTROLLI FALLITI.`)
await db.$disconnect()
process.exit(falliti === 0 ? 0 : 1)
