// Il messaggio da mandare al fornitore per chiedere se un prodotto è fattibile.
//
// Si scrive in ITALIANO e non nella lingua del cliente: qui il destinatario è un
// fornitore (fiorista, pasticceria), che è un partner italiano. La lingua del
// cliente serve per i messaggi al cliente — vedi src/lib/lingua.ts.
//
// IL RITIRO È UN'ORA PRIMA DELLA CONSEGNA. Il valet deve avere il prodotto in
// mano prima di partire, quindi la fascia di ritiro è quella di consegna
// spostata indietro di un'ora: consegna 16-20 → ritiro 15-19.

/** La fascia di ritiro: quella di consegna spostata indietro di un'ora. */
export function fasciaRitiro(fasciaConsegna: string): string | null {
  const t = (fasciaConsegna || '').trim()
  if (!t) return null
  const m = /^(\d{1,2})\s*[-–]\s*(\d{1,2})$/.exec(t)
  // Una fascia di forma diversa da HH-HH non si interpreta: meglio dire "da
  // concordare" che inventare un orario a un fornitore che deve organizzarsi.
  if (!m) return null

  const dalle = Number(m[1])
  const alle = Number(m[2])
  if (!Number.isFinite(dalle) || !Number.isFinite(alle)) return null
  // Se la consegna comincia a mezzanotte, un'ora prima è il giorno precedente:
  // non si scrive "23-03" a un fornitore, si fa concordare.
  if (dalle < 1) return null

  return `${dalle - 1}-${alle - 1}`
}

/** «mercoledì 29 luglio», per il messaggio al fornitore. */
export function dataLunga(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
}

export type MessaggioFornitore = {
  testo: string
  /** Cosa manca per scriverlo per bene: si mostra all'operatore, non si nasconde. */
  mancante: 'data' | 'fascia' | 'entrambe' | null
}

/**
 * Il messaggio pronto: «Per mercoledì 29 luglio possibile questo prodotto con
 * ritiro 15-19?».
 *
 * Quello che non si sa NON si inventa: senza data o senza fascia il messaggio si
 * scrive comunque — serve a chiedere, e l'operatore lo completa — ma si dice
 * quale pezzo manca, perché mandare a un fornitore una data sbagliata costa più
 * che scrivergli una riga a mano.
 */
export function messaggioFornitore(
  dataConsegna: string | null,
  fasciaConsegna: string
): MessaggioFornitore {
  const data = dataLunga(dataConsegna)
  const ritiro = fasciaRitiro(fasciaConsegna)

  const quando = data ?? '[data da confermare]'
  const conRitiro = ritiro ? ` con ritiro ${ritiro}` : ' con ritiro da concordare'

  const mancante = !data && !ritiro ? 'entrambe' : !data ? 'data' : !ritiro ? 'fascia' : null
  return { testo: `Per ${quando} possibile questo prodotto${conRitiro}?`, mancante }
}
