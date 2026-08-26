import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { googleAccessToken } from '@/lib/contatti'
import { chiaveDi, mappaUnioni, possibiliDoppioni } from '@/lib/clienti-uniti'
import { utenteCorrente } from '@/lib/sessione'

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
  /** Quante righe della rubrica sono state assorbite qui dentro. */
  assorbite: number
  /** Con chi *potrebbe* essere la stessa persona, e perché. */
  doppione: '' | 'email' | 'nome'
}

export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const p = req.nextUrl.searchParams
  const q = (p.get('q') ?? '').trim()
  const soloDaSalvare = p.get('rubrica') === 'no'
  const soloDoppioni = p.get('doppioni') === 'si'
  // ⚠️ Le righe appena unite restano visibili anche se un filtro le
  // escluderebbe. Appena unite non sono più «possibili doppioni» — è il
  // risultato giusto — ma sparire subito dopo che ci hai lavorato sopra si
  // legge come «l'ho persa», non come «è fatta».
  const tieni = new Set(
    (p.get('tieni') ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
  )

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
  // ⚠️ I recapiti del gruppo si raccolgono A PARTE e si assegnano DOPO.
  //
  // Farlo dentro il ciclo sembrava più semplice e invece perdeva i casi
  // peggiori: se l'ordine più recente del gruppo apparteneva alla riga
  // ASSORBITA, quella riga apriva il gruppo (ramo «else») e il suo recapito non
  // veniva registrato da nessuna parte — la riga risultava non unita, senza
  // badge «unito» e senza il bottone «Allinea in Google», proprio sui clienti
  // appena uniti. Capitato davvero su Nicolò Donato.
  const recapiti = new Map<string, { telefono: string; email: string; nome: string }[]>()
  // Quante righe della rubrica sono finite dentro questo gruppo: è il numero
  // del badge «unito · N», e non si può dedurre dai recapiti — due righe unite
  // possono avere la stessa email e differire solo per il telefono.
  const assorbite = new Map<string, Set<string>>()
  for (const o of ordini) {
    const originale = chiaveDi(o.telefono, o.email)
    if (!originale) continue
    // ⚠️ Il raggruppamento segue l'unione: la riga assorbita non compare più da
    // sola, i suoi ordini si sommano a quella che resta.
    const chiave = unioni.get(originale) ?? originale

    // Tutti i recapiti visti in questo gruppo, quale che sia l'ordine in cui
    // arrivano gli ordini.
    const suoi = recapiti.get(chiave) ?? []
    if (!suoi.some((r) => r.telefono === o.telefono && r.email === o.email)) {
      suoi.push({ telefono: o.telefono, email: o.email, nome: o.clienteNome })
      recapiti.set(chiave, suoi)
    }
    if (originale !== chiave) {
      const s = assorbite.get(chiave) ?? new Set<string>()
      s.add(originale)
      assorbite.set(chiave, s)
    }

    const esistente = mappa.get(chiave)
    if (esistente) {
      esistente.ordini++
      esistente.speso += o.totale
      if (!esistente.negozi.includes(o.negozioNome)) esistente.negozi.push(o.negozioNome)
      // I campi mancanti si completano con quelli degli ordini più vecchi.
      // ⚠️ Il TELEFONO non c'era, e si vedeva: una riga unita il cui ordine più
      // recente arrivava dalla parte senza numero mostrava «—» al posto del
      // telefono che il cliente ha davvero — proprio il dato per cui l'unione
      // era stata fatta.
      if (!esistente.telefono && o.telefono) esistente.telefono = o.telefono
      if (!esistente.email && o.email) esistente.email = o.email
      if (!esistente.citta && o.citta) esistente.citta = o.citta
      if (!esistente.nome && o.clienteNome) esistente.nome = o.clienteNome
      if (o.contattoSalvato) esistente.inRubrica = true
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
        assorbite: 0,
        doppione: '',
      })
    }
  }

  // Gli ALTRI recapiti della persona: quelli diversi da quello mostrato in
  // riga. È anche il segnale che fa comparire il badge «unito» e il bottone
  // «Allinea in Google», quindi qui una svista si vede subito come «il bottone
  // non c'è».
  const cifre = (t: string) => (t ?? '').replace(/\D/g, '').slice(-9)
  for (const [chiave, tutti] of recapiti) {
    const c = mappa.get(chiave)
    if (!c) continue
    c.assorbite = assorbite.get(chiave)?.size ?? 0
    // Si mostrano solo i recapiti che AGGIUNGONO qualcosa: un telefono o
    // un'email che sulla riga non ci sono già. Ripetere quello che è scritto
    // due centimetri più su fa sembrare l'unione un errore.
    c.uniti = tutti.filter(
      (r) =>
        (r.telefono && cifre(r.telefono) !== cifre(c.telefono)) ||
        (r.email && r.email.toLowerCase() !== c.email.toLowerCase())
    )
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

  if (soloDaSalvare) clienti = clienti.filter((c) => tieni.has(c.chiave) || !c.inRubrica)
  if (soloDoppioni) clienti = clienti.filter((c) => tieni.has(c.chiave) || c.doppione)

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
