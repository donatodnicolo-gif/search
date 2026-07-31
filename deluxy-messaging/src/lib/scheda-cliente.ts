// La SCHEDA CLIENTE: tutto quello che sappiamo di una persona, in un posto solo.
//
// Nasce da un gesto quotidiano: apri un ordine, devi rispondere, e le domande
// che contano non sono sull'ordine ma sul cliente — ha già scritto? si è già
// lamentato? è la prima volta o la decima? a chi manda di solito? Oggi quelle
// risposte stanno in cinque schermate diverse e nessuno le mette insieme mentre
// il cliente aspetta.
//
// ⚠️ CHI È «LO STESSO CLIENTE». Si riconosce per EMAIL, e in mancanza per
// TELEFONO (ultime 9 cifre, come fa la rubrica). Non per nome: gli omonimi
// esistono e «Mario Rossi» non è una chiave. Se non c'è né email né telefono la
// scheda non si apre — meglio nessuna scheda che la scheda di un altro.

import { db } from './db'
import { cercaInArchivio, ordiniClienteDaOrders, type OrdineCliente } from './orders'
import { contattiDelGruppo } from './clienti-uniti'

export type Chiave = { email: string; telefono: string }

/** Le ultime 9 cifre: un numero salvato con e senza prefisso è lo stesso. */
export function cifreTelefono(t: string): string {
  const c = (t ?? '').replace(/\D/g, '')
  return c.length >= 9 ? c.slice(-9) : ''
}

export function chiaveValida(k: Chiave): boolean {
  return Boolean(k.email?.trim() || cifreTelefono(k.telefono))
}

export type OrdinePassato = {
  numero: string
  brand: string
  data: string
  totale: number
  valuta: string
  dataConsegna: string | null
  destinatario: string
}

export type SchedaCliente = {
  nome: string
  email: string
  telefono: string
  /** Che numero ha il suo ordine più recente: 1 = ha comprato una volta sola. */
  ordiniInTutto: number | null
  tipoCliente: string
  /** Somma degli ordini che riusciamo a vedere. */
  speso: number
  ordini: OrdinePassato[]
  /** Quanti ordini vengono dallo storico Orders e quanti dalla copia locale. */
  fonteOrdini: 'registro' | 'copia locale'
  conversazioni: {
    id: string
    canale: string
    ultimoTesto: string
    ultimoMessaggioIl: string
    nonLetti: number
  }[]
  reclami: { ordineNumero: string; casistica: string; stato: string; gravita: number; creatoIl: string }[]
  rimborsi: { ordineNumero: string; importo: number; stato: string; creatoIl: string }[]
  /**
   * A chi manda di solito. In un'azienda di regali è l'informazione che manca
   * sempre: il cliente ordina per la stessa persona da tre anni e noi lo
   * trattiamo ogni volta come uno sconosciuto.
   */
  destinatari: { nome: string; volte: number; citta: string }[]
  /**
   * I mesi in cui ordina, quando il ripetersi è un fatto e non una coincidenza.
   * Vuoto se non c'è abbastanza storia: due ordini a maggio in due anni sono
   * un'abitudine, due ordini a maggio nello stesso anno sono due ordini.
   */
  ricorrenze: { mese: string; volte: number; anni: number }[]
  /**
   * Gli altri recapiti della stessa persona, quando due righe della rubrica
   * sono state unite. Va detto a schermo: chi legge deve sapere che questa
   * scheda tiene insieme due contatti, o non si spiega perché ci sono ordini
   * fatti da un numero che non è quello scritto in cima.
   */
  uniti: { email: string[]; telefoni: string[] }
  /** L'ultimo scambio: quando, su che canale, e da che parte. */
  ultimoContatto: { quando: string; canale: string; direzione: string; chi: string } | null
  avvisi: string[]
}

export async function schedaCliente(k: Chiave): Promise<SchedaCliente | null> {
  const email = (k.email ?? '').trim().toLowerCase()
  const cifre = cifreTelefono(k.telefono)
  if (!email && !cifre) return null

  // ⚠️ Se questa persona è stata UNITA a un'altra riga della rubrica, la scheda
  // deve seguire l'unione: altrimenti mostra la metà da cui si è entrati — tre
  // ordini invece di otto, i reclami di un numero e non dell'altro — cioè il
  // problema che l'unione doveva risolvere, spostato dove non si vede.
  const gruppo = await contattiDelGruppo(email, k.telefono)
  const tutteLeEmail = [...new Set([email, ...gruppo.email.map((e) => e.toLowerCase())])].filter(Boolean)
  const tutteLeCifre = [...new Set([cifre, ...gruppo.telefoni.map(cifreTelefono)])].filter(Boolean)
  const unita = gruppo.email.length > 0 || gruppo.telefoni.length > 0

  const dove = {
    OR: [
      ...tutteLeEmail.map((e) => ({ email: { equals: e, mode: 'insensitive' as const } })),
      ...tutteLeCifre.map((c) => ({ telefono: { contains: c } })),
    ],
  }

  const [ordiniLocali, conversazioni, reclami, rimborsi] = await Promise.all([
    db.ordine.findMany({ where: dove, orderBy: { data: 'desc' } }),
    db.conversazione.findMany({
      where: {
        OR: [
          ...tutteLeEmail.map((e) => ({ idEsterno: { equals: e, mode: 'insensitive' as const } })),
          ...tutteLeCifre.map((c) => ({ idEsterno: { contains: c } })),
        ],
      },
      orderBy: { ultimoMessaggioIl: 'desc' },
    }),
    db.reclamo.findMany({ where: dove, orderBy: { creatoIl: 'desc' } }),
    db.rimborso.findMany({ where: dove, orderBy: { creatoIl: 'desc' } }),
  ])

  const avvisi: string[] = []

  // Lo storico VERO sta in Orders: la copia locale è di due mesi. Se il registro
  // non risponde si mostra quello che c'è, DICENDOLO — una scheda che mostra
  // tre ordini su venti senza avvisare fa concludere «cliente occasionale» a chi
  // legge, ed è la conclusione opposta a quella giusta.
  let ordini: OrdinePassato[] = []
  let fonteOrdini: 'registro' | 'copia locale' = 'copia locale'

  // ⚠️ Orders cerca per UN identificativo alla volta. Su un cliente unito
  // bisogna chiedere per ognuno dei suoi recapiti e mettere insieme le
  // risposte, altrimenti lo storico è quello di mezza persona. Il tetto di
  // quattro non è pigrizia: ogni recapito è una chiamata di rete a un'altra
  // app, e una scheda che ci mette cinque secondi non la apre più nessuno.
  const identificativi = [
    ...new Set([email || k.telefono, ...tutteLeEmail, ...gruppo.telefoni].filter(Boolean)),
  ].slice(0, 4)

  const risposte = await Promise.all(identificativi.map((id) => cercaInArchivio(id, 50)))
  const trovati = risposte.filter((r) => r.stato === 'ok')
  if (trovati.length) {
    fonteOrdini = 'registro'
    // Lo stesso ordine può tornare da due recapiti: si tiene una volta sola.
    const perNumero = new Map<string, OrdinePassato>()
    for (const r of trovati) {
      if (r.stato !== 'ok') continue
      for (const o of r.ordini) {
        if (perNumero.has(o.numero)) continue
        perNumero.set(o.numero, {
          numero: o.numero,
          brand: o.brand,
          data: o.data,
          totale: o.totale,
          valuta: o.valuta,
          dataConsegna: o.dataConsegna,
          destinatario: '',
        })
      }
    }
    ordini = [...perNumero.values()].sort((a, b) => b.data.localeCompare(a.data))
  } else {
    // Il motivo del primo tentativo fallito: dire «non raggiungibile» senza
    // dire perché lascia chi legge senza niente da fare.
    const fallito = risposte.find((r) => r.stato !== 'ok')
    avvisi.push(
      !fallito || fallito.stato === 'non-configurato'
        ? 'Storico non disponibile (app Ordini non configurata): qui sotto ci sono solo gli ordini degli ultimi due mesi.'
        : `Storico non raggiungibile (${fallito.messaggio}): qui sotto ci sono solo gli ordini degli ultimi due mesi.`
    )
    ordini = ordiniLocali.map((o) => ({
      numero: o.numero,
      brand: o.negozioNome,
      data: o.data.toISOString(),
      totale: o.totale,
      valuta: o.valuta,
      dataConsegna: o.dataConsegna?.toISOString() ?? null,
      destinatario: '',
    }))
  }

  // A CHI MANDA DI SOLITO e QUANDO ORDINA: due domande che i dati sanno già
  // rispondere e che nessuno faceva. Servono il destinatario e le date, che
  // `cercaInArchivio` non porta: si chiedono a parte.
  const destinatari: { nome: string; volte: number; citta: string }[] = []
  const ricorrenze: { mese: string; volte: number; anni: number }[] = []
  // Anche qui: su un cliente unito si chiede per ogni recapito e si uniscono le
  // risposte, così «a chi manda di solito» conta i destinatari di tutti i suoi
  // ordini e non di metà.
  const risposteDest = await Promise.all(
    identificativi.map((id) => ordiniClienteDaOrders(id, 100))
  )
  const perNumeroDest = new Map<string, OrdineCliente>()
  for (const r of risposteDest) {
    if (r.stato !== 'ok') continue
    for (const o of r.ordini) if (!perNumeroDest.has(o.numero)) perNumeroDest.set(o.numero, o)
  }
  const conDest = { stato: 'ok' as const, ordini: [...perNumeroDest.values()] }
  if (conDest.stato === 'ok' && conDest.ordini.length) {
    const perNome = new Map<string, { volte: number; citta: string }>()
    for (const o of conDest.ordini) {
      if (!o.destinatario) continue
      const chiave = o.destinatario.toLowerCase()
      const g = perNome.get(chiave) ?? { volte: 0, citta: o.citta }
      g.volte++
      if (!g.citta && o.citta) g.citta = o.citta
      perNome.set(chiave, g)
    }
    // Solo chi torna: un destinatario visto una volta sola non è un'abitudine,
    // e riempire la scheda di nomi unici la rende illeggibile.
    for (const [chiave, g] of perNome) {
      if (g.volte < 2) continue
      const originale = conDest.ordini.find((o) => o.destinatario.toLowerCase() === chiave)
      destinatari.push({ nome: originale?.destinatario ?? chiave, volte: g.volte, citta: g.citta })
    }
    destinatari.sort((a, b) => b.volte - a.volte)

    // ⚠️ Una ricorrenza vera si ripete in ANNI DIVERSI. Contare solo il mese
    // farebbe passare per «abitudine di dicembre» chi a dicembre 2025 ha
    // ordinato tre volte per un evento e poi mai più: sarebbe un consiglio di
    // marketing costruito su un caso singolo.
    const perMese = new Map<number, Set<number>>()
    for (const o of conDest.ordini) {
      const d = new Date(o.data)
      if (Number.isNaN(d.getTime())) continue
      const s = perMese.get(d.getMonth()) ?? new Set<number>()
      s.add(d.getFullYear())
      perMese.set(d.getMonth(), s)
    }
    const NOMI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre']
    for (const [mese, anni] of perMese) {
      if (anni.size < 2) continue
      const volte = conDest.ordini.filter((o) => new Date(o.data).getMonth() === mese).length
      ricorrenze.push({ mese: NOMI[mese], volte, anni: anni.size })
    }
    ricorrenze.sort((a, b) => b.anni - a.anni || b.volte - a.volte)
  }

  // L'ULTIMO CONTATTO: quando ci siamo parlati e chi ha parlato per ultimo.
  // Un cliente che ha scritto e non ha ricevuto risposta è un problema in corso,
  // e dalla lista delle conversazioni non si vede.
  const idConv = conversazioni.map((c) => c.id)
  const ultimo = idConv.length
    ? await db.messaggio.findFirst({
        where: { conversazioneId: { in: idConv } },
        orderBy: { creatoIl: 'desc' },
        include: { conversazione: { select: { canale: true } } },
      })
    : null

  const piuRecente = ordiniLocali[0]
  const speso = ordini.reduce((s, o) => s + (o.totale || 0), 0)

  const emailInTesta = email || piuRecente?.email || ''
  const telefonoInTesta = piuRecente?.telefono || k.telefono || ''
  // Gli ALTRI recapiti: quelli già scritti in cima non sono «anche», sono
  // quelli che si sta guardando. Ripeterli fa sembrare l'unione un pasticcio.
  const altriRecapiti = {
    email: gruppo.email.filter((e) => e.toLowerCase() !== emailInTesta.toLowerCase()),
    telefoni: gruppo.telefoni.filter(
      (t) => cifreTelefono(t) !== cifreTelefono(telefonoInTesta)
    ),
  }

  return {
    nome: piuRecente?.clienteNome || '',
    email: emailInTesta,
    telefono: telefonoInTesta,
    ordiniInTutto: piuRecente?.clienteNumeroOrdine ?? null,
    tipoCliente: piuRecente?.clienteTipo ?? '',
    speso,
    ordini,
    fonteOrdini,
    conversazioni: conversazioni.map((c) => ({
      id: c.id,
      canale: c.canale,
      ultimoTesto: c.ultimoTesto,
      ultimoMessaggioIl: c.ultimoMessaggioIl.toISOString(),
      nonLetti: c.nonLetti,
    })),
    reclami: reclami.map((r) => ({
      ordineNumero: r.ordineNumero,
      casistica: r.casistica,
      stato: r.stato,
      gravita: r.gravita,
      creatoIl: r.creatoIl.toISOString(),
    })),
    rimborsi: rimborsi.map((r) => ({
      ordineNumero: r.ordineNumero,
      importo: r.importo,
      stato: r.stato,
      creatoIl: r.creatoIl.toISOString(),
    })),
    destinatari,
    ricorrenze,
    uniti: unita ? altriRecapiti : { email: [], telefoni: [] },
    ultimoContatto: ultimo
      ? {
          quando: ultimo.creatoIl.toISOString(),
          canale: ultimo.conversazione?.canale ?? '',
          direzione: ultimo.direzione,
          chi: ultimo.utenteNome ?? '',
        }
      : null,
    avvisi,
  }
}
