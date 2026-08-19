// I due segnali che devono fermare la mano PRIMA di far partire un ordine:
// il pagamento non incassato e il sospetto di frode.
//
// Perché in lista e non solo nel dettaglio: l'ordine si lavora scorrendo la
// bacheca — si guarda la consegna, si chiama il fornitore, si paga. Un dato che
// esiste solo dentro un pannello che si apre a richiesta non ferma nessuno: lo
// vede chi era già andato a cercarlo.
//
// I dati arrivano da Shopify attraverso Orders: qui si traducono soltanto.

export type Segnale = {
  /** L'etichetta corta da mettere nella riga: poche parole, si legge di sfuggita. */
  etichetta: string
  /** La frase intera, nel titolo: dice cosa fare, non solo cosa c'è. */
  spiegazione: string
  /** \`true\` = rosso, va guardato adesso. \`false\` = grigio, è un'informazione. */
  grave: boolean
}

/**
 * Il pagamento, quando c'è qualcosa da sapere.
 *
 * ⚠️ Vuoto = **non lo sappiamo**, e non si mostra niente: 491 ordini in tabella
 * hanno il campo vuoto perché sono più vecchi del giorno in cui abbiamo
 * cominciato a leggerlo da Orders. Un bollino «pagamento sconosciuto» su un
 * terzo della bacheca sarebbe rumore, non un avviso — e il rumore si impara a
 * saltare, portandosi via anche i tre veri.
 */
export function segnalePagamento(statoPagamento: string): Segnale | null {
  switch ((statoPagamento || '').toUpperCase()) {
    case 'PENDING':
      return {
        etichetta: 'Pagamento in sospeso',
        spiegazione:
          'Shopify non risulta aver incassato questo ordine. Prima di farlo partire, verifica che il pagamento sia arrivato.',
        grave: true,
      }
    case 'VOIDED':
      return {
        etichetta: 'Pagamento stornato',
        spiegazione:
          'Il pagamento risulta STORNATO: il denaro potrebbe non essere mai stato incassato.',
        grave: true,
      }
    case 'REFUNDED':
      return {
        etichetta: 'Rimborsato',
        spiegazione: 'Shopify risulta già rimborsato per intero: di norma non va lavorato.',
        grave: false,
      }
    case 'PARTIALLY_REFUNDED':
      return {
        etichetta: 'Rimborsato in parte',
        spiegazione: 'Shopify risulta rimborsato in parte: verifica quanto è stato reso.',
        grave: false,
      }
    default:
      // PAID e sconosciuto: niente da dire. Un ordine normale non merita un
      // bollino, altrimenti i bollini non vogliono più dire niente.
      return null
  }
}

/**
 * Il rischio frode, quando Shopify lo considera almeno medio.
 *
 * ⚠️ **LOW e NONE non si mostrano.** Sono il 99% degli ordini: segnalarli
 * vorrebbe dire mettere un bollino su tutto, che è lo stesso che non metterlo
 * su niente. Si mostra solo quello che chiede una decisione — MEDIUM e HIGH,
 * gli stessi che Orders chiama «sospetti».
 *
 * ⚠️ Il livello è la valutazione **più severa** fra quelle che Shopify conosce
 * (la sua e quelle delle app antifrode): è quella che deve far fermare.
 */
export function segnaleRischio(livello: string, raccomandazione: string): Segnale | null {
  const l = (livello || '').toUpperCase()
  if (l !== 'MEDIUM' && l !== 'HIGH') return null
  const alto = l === 'HIGH'
  const cosaDice =
    (raccomandazione || '').toUpperCase() === 'CANCEL'
      ? ' Shopify consiglia di ANNULLARE l’ordine.'
      : (raccomandazione || '').toUpperCase() === 'INVESTIGATE'
        ? ' Shopify consiglia di verificarlo prima di spedire.'
        : ''
  return {
    etichetta: alto ? 'Rischio frode alto' : 'Possibile frode',
    spiegazione:
      (alto
        ? 'Shopify considera questo ordine ad ALTO rischio di frode.'
        : 'Shopify considera questo ordine a rischio medio di frode.') +
      cosaDice +
      ' Controlla in Shopify prima di far partire la consegna: un ordine fraudolento pagato con una carta rubata torna indietro come storno, e il prodotto è già stato consegnato.',
    grave: true,
  }
}

/** I segnali di un ordine, dal più urgente. Vuoto = niente da segnalare. */
export function segnaliOrdine(o: {
  statoPagamento?: string
  rischioLivello?: string
  rischioRaccomandazione?: string
}): Segnale[] {
  const s = [
    segnaleRischio(o.rischioLivello ?? '', o.rischioRaccomandazione ?? ''),
    segnalePagamento(o.statoPagamento ?? ''),
  ].filter((x): x is Segnale => x !== null)
  // I gravi davanti: se ce n'è uno solo visibile in una riga stretta, dev'essere
  // quello che ferma la mano.
  return s.sort((a, b) => Number(b.grave) - Number(a.grave))
}
