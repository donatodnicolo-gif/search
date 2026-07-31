import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { googleAccessToken } from '@/lib/contatti'
import { chiaveDi, mappaUnioni, possibiliDoppioni } from '@/lib/clienti-uniti'

export const dynamic = 'force-dynamic'

// Rubrica clienti: non è una tabella a sé, si ricava dagli ordini raggruppando
// per persona (ultime 9 cifre del telefono, altrimenti email). Così la rubrica
// è sempre allineata agli ordini scaricati, senza dati duplicati.
//
// Sopra a quel raggruppamento ci sono le UNIONI FATTE A MANO (ClienteUnito):
// quando la stessa persona ha due numeri o due email, i dati non la collegano e
// nessuno può indovinarlo — lo decide una persona, e da lì in poi le sue righe
// si contano insieme.

export type ClienteDto = {
  chiave: string
  nome: string
  telefono: string
  email: string
  citta: string
  negozi: string[]
  ordini: number
  speso: number
  ultimoNumero: string
  ultimaData: string
  inRubrica: boolean
  /** Gli altri contatti finiti in questa riga perché qualcuno li ha uniti. */
  uniti: { telefono: string; email: string; nome: string }[]
  /** Con chi *potrebbe* essere la stessa persona, e perché. */
  doppione: '' | 'email' | 'nome'
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const q = (p.get('q') ?? '').trim()
  const soloDaSalvare = p.get('rubrica') === 'no'
  const soloDoppioni = p.get('doppioni') === 'si'

  const dove: Prisma.OrdineWhereInput = {}
  if (q) {
    const testo: Prisma.StringFilter = { contains: q, mode: 'insensitive' }
    dove.OR = [{ clienteNome: testo }, { telefono: testo }, { email: testo }, { citta: testo }]
    const cifre = q.replace(/[^\d]/g, '')
    if (cifre.length >= 4) dove.OR.push({ telefono: { contains: cifre } })
  }

  const [ordini, token, unioni] = await Promise.all([
    // Ordinati dal più recente: il primo di ogni gruppo è l'ultimo ordine.
    db.ordine.findMany({ where: dove, orderBy: { data: 'desc' } }),
    googleAccessToken().catch(() => null),
    mappaUnioni(),
  ])

  const mappa = new Map<string, ClienteDto>()
  for (const o of ordini) {
    const originale = chiaveDi(o.telefono, o.email)
    if (!originale) continue
    // ⚠️ Il raggruppamento segue l'unione: la riga assorbita non compare più da
    // sola, i suoi ordini si sommano a quella che resta.
    const chiave = unioni.get(originale) ?? originale
    const esistente = mappa.get(chiave)
    if (esistente) {
      esistente.ordini++
      esistente.speso += o.totale
      if (!esistente.negozi.includes(o.negozioNome)) esistente.negozi.push(o.negozioNome)
      // i campi mancanti si completano con quelli degli ordini più vecchi
      if (!esistente.email && o.email) esistente.email = o.email
      if (!esistente.citta && o.citta) esistente.citta = o.citta
      if (!esistente.nome && o.clienteNome) esistente.nome = o.clienteNome
      if (o.contattoSalvato) esistente.inRubrica = true
      // Il contatto della riga assorbita non si butta: è un numero a cui quel
      // cliente risponde davvero, e chi deve chiamarlo deve poterlo vedere.
      if (
        originale !== chiave &&
        !esistente.uniti.some((u) => u.telefono === o.telefono && u.email === o.email)
      ) {
        esistente.uniti.push({ telefono: o.telefono, email: o.email, nome: o.clienteNome })
      }
    } else {
      mappa.set(chiave, {
        chiave,
        nome: o.clienteNome,
        telefono: o.telefono,
        email: o.email,
        citta: o.citta,
        negozi: o.negozioNome ? [o.negozioNome] : [],
        ordini: 1,
        speso: o.totale,
        ultimoNumero: o.numero,
        ultimaData: o.data.toISOString(),
        inRubrica: o.contattoSalvato,
        uniti: [],
        doppione: '',
      })
    }
  }

  let clienti = [...mappa.values()]

  // I possibili doppioni si calcolano su TUTTE le righe rimaste, prima dei
  // filtri: sapere che una riga ha un gemello è un'informazione della riga.
  for (const g of possibiliDoppioni(clienti.map((c) => ({ chiave: c.chiave, nome: c.nome, email: c.email })))) {
    for (const k of g.chiavi) {
      const c = mappa.get(k)
      // «email» è un indizio più forte di «nome» e non si lascia sovrascrivere.
      if (c && (c.doppione !== 'email' || g.motivo === 'email')) c.doppione = g.motivo
    }
  }

  if (soloDaSalvare) clienti = clienti.filter((c) => !c.inRubrica)
  if (soloDoppioni) clienti = clienti.filter((c) => c.doppione)

  // Ordinamento (come in Deluxy Orders): più spesa, più ordini, più recenti, nome.
  const ordina = p.get('ordina') ?? 'recenti'
  const per: Record<string, (a: ClienteDto, b: ClienteDto) => number> = {
    speso: (a, b) => b.speso - a.speso,
    ordini: (a, b) => b.ordini - a.ordini,
    recenti: (a, b) => b.ultimaData.localeCompare(a.ultimaData),
    nome: (a, b) => (a.nome || '').localeCompare(b.nome || '', 'it'),
  }
  // Coi doppioni si ordina per nome: i gemelli devono stare uno sotto l'altro,
  // altrimenti per confrontarli si scorre la pagina avanti e indietro.
  clienti.sort(soloDoppioni ? per.nome : per[ordina] ?? per.recenti)

  // Riepiloghi sull'insieme intero, non solo sulla pagina mostrata.
  const inRubrica = clienti.filter((c) => c.inRubrica).length
  const spesoTotale = clienti.reduce((s, c) => s + c.speso, 0)

  return NextResponse.json({
    totale: clienti.length,
    inRubrica,
    spesoTotale,
    clienti: clienti.slice(0, 300),
    googleCollegato: !!token,
  })
}
