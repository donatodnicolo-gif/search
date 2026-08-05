import { db } from './db'

/**
 * LE CASISTICHE DI SPAM APPROVATE (o rifiutate) da te.
 *
 * La regola non sposta niente da sola: la **prima** mail di una casistica —
 * «si presenta come Shopify ma scrive da gmail.com» — resta in posta e ti
 * chiede il permesso. Quando dici di sì, quella casistica diventa automatica:
 * le prossime uguali vanno in SPAM senza chiedere più niente.
 *
 * ⚠️ Il «no» si ricorda quanto il «sì». Una proposta rifiutata che ritorna a
 * ogni mail è peggio di non averla mai fatta — è la stessa regola delle
 * proposte di Renè, che una volta rifiutate non tornano.
 *
 * ⚠️ Si tiene in `Impostazione` e non in una tabella nuova: sono una manciata
 * di stringhe per utente, e una tabella andrebbe migrata in produzione per
 * niente. La chiave porta l'id utente (`spam.casi:<utenteId>`) — è la stessa
 * forma già usata per lo stato dello svuota-cestino.
 */
export type DecisioniSpam = { approvate: string[]; rifiutate: string[] }

const VUOTE: DecisioniSpam = { approvate: [], rifiutate: [] }

function chiave(utenteId: string): string {
  return `spam.casi:${utenteId}`
}

export async function decisioniSpam(utenteId: string): Promise<DecisioniSpam> {
  try {
    const r = await db.impostazione.findUnique({ where: { chiave: chiave(utenteId) } })
    if (!r) return VUOTE
    const d = JSON.parse(r.valore) as Partial<DecisioniSpam>
    return {
      approvate: Array.isArray(d.approvate) ? d.approvate : [],
      rifiutate: Array.isArray(d.rifiutate) ? d.rifiutate : [],
    }
  } catch {
    // Riga assente o JSON rotto: si riparte da zero, non si blocca la posta.
    return VUOTE
  }
}

/** Registra la decisione presa su una casistica. Il sì toglie il no e viceversa. */
export async function decidiCasoSpam(
  utenteId: string,
  casoId: string,
  decisione: 'approva' | 'rifiuta'
): Promise<void> {
  const d = await decisioniSpam(utenteId)
  const approvate = d.approvate.filter((x) => x !== casoId)
  const rifiutate = d.rifiutate.filter((x) => x !== casoId)
  if (decisione === 'approva') approvate.push(casoId)
  else rifiutate.push(casoId)

  const valore = JSON.stringify({ approvate, rifiutate })
  await db.impostazione.upsert({
    where: { chiave: chiave(utenteId) },
    create: { chiave: chiave(utenteId), valore },
    update: { valore },
  })
}
