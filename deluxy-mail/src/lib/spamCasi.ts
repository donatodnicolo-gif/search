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
 *
 * ⚠️ **Le decisioni di un AMMINISTRATORE valgono per tutta l'azienda** (scelta
 * dell'utente, 17/08/2026): quando un admin dice «sì, è spam», quella casistica
 * va in SPAM per **ogni** utente, senza che gliela si richieda. Le decisioni di
 * un utente normale restano sue. Per questo ci sono due righe: quella globale
 * (`spam.casi`) che scrivono solo gli admin, e quella personale
 * (`spam.casi:<utenteId>`); in lettura si sommano, e **la globale vince** sulla
 * personale (se l'azienda ha deciso, la decisione è quella).
 */
export type DecisioniSpam = { approvate: string[]; rifiutate: string[] }

const VUOTE: DecisioniSpam = { approvate: [], rifiutate: [] }

/** La riga personale di un utente. */
function chiave(utenteId: string): string {
  return `spam.casi:${utenteId}`
}

/** La riga dell'azienda: la scrivono solo gli amministratori. */
const CHIAVE_GLOBALE = 'spam.casi'

async function leggi(chiave: string): Promise<DecisioniSpam> {
  try {
    const r = await db.impostazione.findUnique({ where: { chiave } })
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

/** Solo le decisioni dell'azienda (quelle prese da un admin). */
export async function decisioniSpamAzienda(): Promise<DecisioniSpam> {
  return leggi(CHIAVE_GLOBALE)
}

/**
 * Le decisioni che valgono per questo utente: le sue più quelle dell'azienda.
 * ⚠️ La globale VINCE: una casistica approvata dall'azienda resta approvata
 * anche se l'utente in passato l'aveva rifiutata — se no «vale per tutti»
 * sarebbe falso proprio per chi aveva già detto no.
 */
export async function decisioniSpam(utenteId: string): Promise<DecisioniSpam> {
  const [mie, azienda] = await Promise.all([leggi(chiave(utenteId)), leggi(CHIAVE_GLOBALE)])
  const approvate = [...new Set([...mie.approvate.filter((x) => !azienda.rifiutate.includes(x)), ...azienda.approvate])]
  const rifiutate = [...new Set([...mie.rifiutate.filter((x) => !azienda.approvate.includes(x)), ...azienda.rifiutate])]
  return { approvate, rifiutate }
}

/**
 * Registra la decisione presa su una casistica. Il sì toglie il no e viceversa.
 * `perTutti` (vero per gli admin) la scrive sulla riga dell'azienda.
 */
export async function decidiCasoSpam(
  utenteId: string,
  casoId: string,
  decisione: 'approva' | 'rifiuta',
  perTutti = false
): Promise<void> {
  const k = perTutti ? CHIAVE_GLOBALE : chiave(utenteId)
  const d = await leggi(k)
  const approvate = d.approvate.filter((x) => x !== casoId)
  const rifiutate = d.rifiutate.filter((x) => x !== casoId)
  if (decisione === 'approva') approvate.push(casoId)
  else rifiutate.push(casoId)

  const valore = JSON.stringify({ approvate, rifiutate })
  await db.impostazione.upsert({
    where: { chiave: k },
    create: { chiave: k, valore },
    update: { valore },
  })
}
