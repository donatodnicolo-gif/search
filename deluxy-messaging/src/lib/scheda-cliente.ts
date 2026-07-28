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
import { cercaInArchivio } from './orders'

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
  destinatari: { nome: string; volte: number }[]
  avvisi: string[]
}

export async function schedaCliente(k: Chiave): Promise<SchedaCliente | null> {
  const email = (k.email ?? '').trim().toLowerCase()
  const cifre = cifreTelefono(k.telefono)
  if (!email && !cifre) return null

  const dove = {
    OR: [
      ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
      ...(cifre ? [{ telefono: { contains: cifre } }] : []),
    ],
  }

  const [ordiniLocali, conversazioni, reclami, rimborsi] = await Promise.all([
    db.ordine.findMany({ where: dove, orderBy: { data: 'desc' } }),
    db.conversazione.findMany({
      where: {
        OR: [
          ...(email ? [{ idEsterno: { equals: email, mode: 'insensitive' as const } }] : []),
          ...(cifre ? [{ idEsterno: { contains: cifre } }] : []),
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
  const esito = await cercaInArchivio(email || k.telefono, 50)
  if (esito.stato === 'ok') {
    fonteOrdini = 'registro'
    ordini = esito.ordini.map((o) => ({
      numero: o.numero,
      brand: o.brand,
      data: o.data,
      totale: o.totale,
      valuta: o.valuta,
      dataConsegna: o.dataConsegna,
      destinatario: '',
    }))
  } else {
    avvisi.push(
      esito.stato === 'non-configurato'
        ? 'Storico non disponibile (app Ordini non configurata): qui sotto ci sono solo gli ordini degli ultimi due mesi.'
        : `Storico non raggiungibile (${esito.messaggio}): qui sotto ci sono solo gli ordini degli ultimi due mesi.`
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

  const piuRecente = ordiniLocali[0]
  const speso = ordini.reduce((s, o) => s + (o.totale || 0), 0)

  return {
    nome: piuRecente?.clienteNome || '',
    email: email || piuRecente?.email || '',
    telefono: piuRecente?.telefono || k.telefono || '',
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
    destinatari: [],
    avvisi,
  }
}
