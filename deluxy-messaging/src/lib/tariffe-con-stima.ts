import { tariffeConsegna } from './nuovo-ordine'
import { cittaDiCasa, stimaFuoriZona } from './consegna-fuori-zona'

// Le tariffe di consegna del sito per QUESTO carrello e QUESTO indirizzo, più
// la STIMA al chilometro quando serve. È il cuore della rotta interna
// /api/nuovo-ordine/tariffe, tirato fuori (11/09/2026) perché lo usa anche
// /api/v1/nuovo-ordine/tariffe per le altre app (il CRM): un conto solo, due
// porte — due conti separati prima o poi direbbero numeri diversi.

export type RichiestaTariffe = {
  negozioId?: string
  indirizzo?: { indirizzo?: string; citta?: string; cap?: string; provincia?: string; paese?: string }
  righe?: { variantId?: string; titolo?: string; prezzo?: number; quantita?: number }[]
}

export type RispostaTariffe = { status: number; corpo: Record<string, unknown> }

export async function tariffeConStima(c: RichiestaTariffe): Promise<RispostaTariffe> {
  const negozioId = (c.negozioId ?? '').trim()
  if (!negozioId) return { status: 200, corpo: { tariffe: [] } }

  const righe = (c.righe ?? []).map((r) => ({
    variantId: r.variantId,
    titolo: r.titolo,
    prezzo: r.prezzo,
    quantita: Math.max(1, r.quantita ?? 1),
  }))
  const esito = await tariffeConsegna(
    negozioId,
    {
      citta: c.indirizzo?.citta ?? '',
      cap: c.indirizzo?.cap ?? '',
      provincia: c.indirizzo?.provincia ?? '',
      paese: c.indirizzo?.paese ?? 'IT',
    },
    righe
  )
  if (esito.stato === 'errore') return { status: 502, corpo: { errore: esito.messaggio } }
  if (esito.stato === 'senza-negozio') return { status: 400, corpo: { errore: 'Negozio non trovato.' } }

  // ⚠️⚠️ Il sito non ha una tariffa per la consegna: è una risposta vera (una
  // provincia fuori dalle zone). Qui si aggiunge una STIMA al chilometro —
  // mostrata, mai scritta da sola: la decisione resta di chi sta al telefono.
  // La stima si calcola anche QUANDO una tariffa c'è, se la consegna è fuori
  // dalle città da cui usciamo (Cake chiede 10 € piatti anche a Palermo).
  const cittaConsegna = (c.indirizzo?.citta ?? '').trim().toLowerCase()
  const casa = await cittaDiCasa().catch(() => [] as string[])
  const inCasa = casa.includes(cittaConsegna)
  if (esito.tariffe.length && (inCasa || !cittaConsegna)) {
    return { status: 200, corpo: { tariffe: esito.tariffe } }
  }
  // ⚠️⚠️ La stima non può far cadere le TARIFFE: se Google o le impostazioni
  // sbagliano un colpo, al massimo la stima non c'è.
  const s = await stimaConCautela(
    negozioId,
    {
      indirizzo: c.indirizzo?.indirizzo ?? '',
      citta: c.indirizzo?.citta ?? '',
      cap: c.indirizzo?.cap ?? '',
      provincia: c.indirizzo?.provincia ?? '',
      paese: c.indirizzo?.paese ?? 'IT',
    },
    righe
  )
  return {
    status: 200,
    corpo: {
      tariffe: esito.tariffe,
      stima: s.stato === 'ok' ? s.stima : null,
      stimaStato: s.stato,
      stimaKm: s.stato === 'troppo-lontano' ? s.km : null,
      stimaPartenza: s.stato === 'troppo-lontano' ? s.partenza : '',
    },
  }
}

/** La stima, ma non può mai lanciare: al massimo non c'è. */
async function stimaConCautela(
  ...argomenti: Parameters<typeof stimaFuoriZona>
): Promise<Awaited<ReturnType<typeof stimaFuoriZona>>> {
  try {
    return await stimaFuoriZona(...argomenti)
  } catch {
    return { stato: 'senza-strada', provate: [] }
  }
}
