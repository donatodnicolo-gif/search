import { transactionsConfigurata, richiediPagamentoFornitore, statoRichiestaTransactions } from './transactions'

// Il «Paga» del Customer Service.
//
// IL CANALE È DELUXY TRANSACTIONS (contratto dell'ecosistema: l'unica app da
// cui può uscire denaro, richieste firmate HMAC con nonce e idempotenza,
// autorizzazione umana con secondo fattore). Dal 28/08/2026 accetta anche i
// metodi non-IBAN (link, PayPal, carta, altro): OGNI richiesta va lì, e
// l'esito — con la prova allegata — torna sul webhook
// `/api/pagamenti/notifica`.
//
// ⚠️ Il vecchio ponte verso Deluxy Partner (`POST /api/richieste-pagamento`)
// NON ESISTE PIÙ: quella coda è stata rimossa da Finance il 26/07/2026
// (commit 97b53692) e il ripiego colpiva un 404 — un canale morto che sembrava
// una rete di sicurezza. Spento il 28/08/2026: se Transactions non è
// configurata, si dice, non si finge di avere un'alternativa.
//
// L'invio è idempotente sul `riferimento`: rimandare la stessa richiesta non
// la duplica mai.

export type DatiRichiesta = {
  importo: number
  beneficiario: string
  iban: string
  /** iban | link | paypal | carta | altro */
  metodo?: string
  /** Il «come si paga» quando non è un IBAN. */
  riferimentoPagamento?: string
  bic?: string
  causale?: string
  contatto?: string
  linkConversazione?: string
  riferimento: string
  note?: string
}

export type EsitoInvio =
  | { stato: 'ok'; id: string; statoRichiesta: string; aggiornata?: boolean; canale: 'transactions' | 'finance' }
  | { stato: 'non-configurato' }
  | { stato: 'errore'; messaggio: string }

/** Manda la richiesta di pagamento a Transactions. L'importo dev'essere > 0. */
export async function inviaRichiestaPagamento(d: DatiRichiesta): Promise<EsitoInvio> {
  if (!(d.importo > 0)) {
    return { stato: 'errore', messaggio: 'Si accettano solo richieste con un importo maggiore di zero.' }
  }
  if (!transactionsConfigurata()) return { stato: 'non-configurato' }

  const note = [d.note, d.contatto && `Contatto: ${d.contatto}`, d.linkConversazione && `Conversazione: ${d.linkConversazione}`]
    .filter(Boolean)
    .join('\n')
  const t = await richiediPagamentoFornitore({
    riferimento: d.riferimento,
    importo: d.importo,
    beneficiario: d.beneficiario,
    iban: d.iban,
    metodo: d.metodo,
    riferimentoPagamento: d.riferimentoPagamento,
    causale: d.causale,
    note: note || undefined,
  })
  if (t.ok) {
    return { stato: 'ok', id: t.riferimento, statoRichiesta: t.stato, aggiornata: t.ripetuta, canale: 'transactions' }
  }
  return { stato: 'errore', messaggio: t.errore }
}

/** A che punto è una richiesta già inviata. Il canale è uno solo. */
export async function statoRichiestaPartner(
  riferimento: string,
  _canale?: string
): Promise<{ stato: string; decisoIl: string | null } | null> {
  if (!transactionsConfigurata()) return null
  return statoRichiestaTransactions(riferimento)
}
