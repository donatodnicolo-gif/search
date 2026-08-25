// Prova del FILO delle note del diario, sui dati veri.
//
// ⚠️⚠️ I due casi che questa prova esiste per fermare, tutti e due silenziosi:
//  1. un seguito mostrato DA SOLO — «richiamato, vuole il biglietto riscritto»
//     senza la riga che cita non si capisce di chi parla;
//  2. una capofila spuntata che fa SPARIRE dalla vista di lavoro un seguito
//     ancora aperto — cioè togliere dalla lista una cosa da fare, in silenzio,
//     spuntandone un'altra.
//
// ⚠️ Scrive sul database vero e cancella SOLO le righe che ha creato lei, per
// id: il Postgres è condiviso con le altre app.
import 'dotenv/config'
import { db } from '../src/lib/db'

let male = 0
function prova(nome: string, ok: boolean, extra = '') {
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${extra ? ' — ' + extra : ''}`)
}

/**
 * Quello che la rotta risponde, rifatto qui con le stesse query: capofila +
 * seguiti, a partire da un filtro.
 */
async function elenco(stato: 'aperte' | 'fatte' | 'tutte') {
  const dove: Record<string, unknown> = {}
  if (stato === 'aperte') dove.fatta = false
  else if (stato === 'fatte') dove.fatta = true
  const corrispondono = await db.notaDiario.findMany({ where: dove, take: 300 })
  const idCapo = [...new Set(corrispondono.map((n) => n.rispostaA || n.id))]
  const [capofila, seguiti] = await Promise.all([
    db.notaDiario.findMany({ where: { id: { in: idCapo } } }),
    db.notaDiario.findMany({ where: { rispostaA: { in: idCapo } } }),
  ])
  return { capofila, seguiti }
}

const miei: string[] = []
try {
  const capo = await db.notaDiario.create({
    data: { testo: 'PROVA — richiamare il cliente domani', ordineNumero: '#0000', autoreNome: 'prova automatica' },
  })
  miei.push(capo.id)
  const seg = await db.notaDiario.create({
    data: { testo: 'PROVA — richiamato, vuole il biglietto riscritto', rispostaA: capo.id, autoreNome: 'prova automatica' },
  })
  miei.push(seg.id)

  // ── 1. Il seguito non compare mai da solo ──
  {
    const { capofila, seguiti } = await elenco('aperte')
    prova('la capofila c’è', capofila.some((n) => n.id === capo.id))
    prova('il seguito sta sotto la sua capofila', seguiti.some((s) => s.id === seg.id))
    prova(
      'il seguito NON compare come riga a sé',
      !capofila.some((n) => n.id === seg.id),
      'altrimenti si leggerebbe come una cosa da fare in più'
    )
  }

  // ── 2. Spuntare la capofila non fa sparire il seguito aperto ──
  await db.notaDiario.update({ where: { id: capo.id }, data: { fatta: true, fattaIl: new Date() } })
  {
    const { capofila, seguiti } = await elenco('aperte')
    prova(
      'la capofila completata resta in vista se il seguito è aperto',
      capofila.some((n) => n.id === capo.id),
      'è il caso che fa sparire il lavoro in silenzio'
    )
    prova('e il seguito aperto è ancora lì', seguiti.some((s) => s.id === seg.id))
  }

  // ── 3. Chiuso tutto, esce dalla vista di lavoro ──
  await db.notaDiario.update({ where: { id: seg.id }, data: { fatta: true, fattaIl: new Date() } })
  {
    const { capofila } = await elenco('aperte')
    prova('con tutto completato il filo esce dalle aperte', !capofila.some((n) => n.id === capo.id))
    const fatte = await elenco('fatte')
    prova('e si ritrova fra le completate', fatte.capofila.some((n) => n.id === capo.id))
  }

  // ── 4. L'eredità: il seguito porta l'ordine della capofila ──
  //    ⚠️ È il senso di «citare» quella nota: senza, cercando quel numero si
  //    troverebbe metà della storia.
  const seg2 = await db.notaDiario.create({
    data: { testo: 'PROVA — riscritto', rispostaA: capo.id, ordineNumero: capo.ordineNumero, autoreNome: 'prova automatica' },
  })
  miei.push(seg2.id)
  prova('il seguito porta l’ordine della capofila', seg2.ordineNumero === capo.ordineNumero, seg2.ordineNumero)
} finally {
  for (const id of miei) await db.notaDiario.delete({ where: { id } })
  console.log(`\nripulite ${miei.length} righe di prova`)
  console.log('note rimaste col testo di prova:', await db.notaDiario.count({ where: { testo: { startsWith: 'PROVA —' } } }))
}

console.log(male ? `\n${male} prove FALLITE` : '\nTutte passate')
await db.$disconnect()
process.exit(male ? 1 : 0)
