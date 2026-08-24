// IL LINK A UN ORDINE, DAL SUO NUMERO.
//
// ⚠️⚠️ Perché esiste una funzione per una riga: quattro punti dell'app
// costruivano lo stesso link a mano — i Pagamenti, la Riconciliazione, il
// Diario e l'aiuto laterale — e tutti e quattro **toglievano il cancelletto**:
//
//     /ordini-globali?q=${numero.replace('#', '')}
//
// Sembra innocuo e non lo è. La ricerca degli ordini fa `contains`, quindi
// «2780» combacia anche con **#12780**, che è un ordine di un altro negozio e
// di un altro cliente. Misurato il 24/08 sui dati veri:
//
//     «2780»  → 2 risultati (#12780 Deluxy · #2780 FLowers)
//     «2786»  → 4 risultati
//     «#2785» → 1 risultato
//
// Col cancelletto il numero torna a essere un identificatore invece di un pezzo
// di testo: «#2785» non sta dentro «#12785». È anche la condizione perché la
// scheda si apra da sola arrivando dal link — con quattro risultati non si può.
//
// ⚠️ Questo file NON importa `db`: lo usano componenti client.

/** Il numero come si scrive: un cancelletto solo, davanti. */
export function numeroConCancelletto(numero: string): string {
  const n = (numero ?? '').trim().replace(/^#+/, '')
  return n ? `#${n}` : ''
}

/**
 * L'indirizzo della pagina Ordini globali che cerca QUESTO ordine.
 * Vuoto se non c'è un numero: un link che porta a una ricerca vuota è peggio di
 * nessun link, perché sembra rotto.
 */
export function linkOrdine(numero: string): string {
  const n = numeroConCancelletto(numero)
  return n ? `/ordini-globali?q=${encodeURIComponent(n)}` : ''
}
