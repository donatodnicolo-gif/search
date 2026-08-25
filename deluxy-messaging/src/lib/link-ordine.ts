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

// ── IL LINK «PAGA FORNITORE» ──
//
// ⚠️⚠️ Portava solo il NUMERO, e il numero non è un'identità. Segnalato
// dall'utente il 25/08/2026 su
// `/pagamenti?ordine=%232792&cliente=Darya+Byelikova&importo=135`: il campo
// «Ordine» restava vuoto **pur essendo partiti da quell'ordine**. Il motivo è
// che la pagina, avendo in mano solo «2792», deve ricercarlo — e la ricerca fa
// `contains`, quindi torna **#2792 (FLowers, Darya Byelikova, 135 €)** e
// **#12792 (Deluxy, Sophia Moein, 64 €)**. Due risultati: il collegamento
// automatico si ferma di proposito (col numero solo, sceglierne uno vorrebbe
// dire calcolare il margine sull'ordine sbagliato) e chi arriva vede un campo
// vuoto che ha appena riempito col dito.
//
// Chi preme il bottone, però, l'ordine ce l'ha in mano: id e negozio. Il link
// li porta, e dall'altra parte non si «cerca» più — si RICONOSCE.
//
// ⚠️ Una funzione sola perché i due bottoni erano due copie diverse: quello
// dell'elenco portava anche fornitore e costo concordato, quello della scheda
// no. Stesso bottone, due comportamenti — e dalla scheda si ricopiava a mano il
// nome di chi prepara l'ordine (che l'app già sapeva).

/** Quel che serve per chiedere il pagamento di un ordine. */
export type OrdineDaPagare = {
  id: string
  numero: string
  clienteNome: string
  negozioNome: string
  totale: number
  fornitoreNome?: string | null
  fornitoreCosto?: number | null
}

export function linkPagamentoOrdine(o: OrdineDaPagare): string {
  const p = new URLSearchParams({
    ordine: numeroConCancelletto(o.numero),
    cliente: o.clienteNome ?? '',
    importo: String(o.totale || ''),
  })
  // ⚠️ L'identità dell'ordine: l'id è nostro ed è esatto, il negozio serve
  // quando l'id non c'è (un ordine d'archivio) e resta comunque più preciso del
  // numero da solo.
  if (o.id) p.set('ordineId', o.id)
  if (o.negozioNome) p.set('negozio', o.negozioNome)
  // ⚠️ CHI VA PAGATO È IL FORNITORE, non il cliente: se l'ordine sa già chi lo
  // prepara e a quanto, quei due valori partono col link.
  if (o.fornitoreNome) {
    p.set('fornitore', o.fornitoreNome)
    if (typeof o.fornitoreCosto === 'number') p.set('costo', String(o.fornitoreCosto))
  }
  return `/pagamenti?${p.toString()}`
}

// ── RICONOSCERE L'ORDINE FRA I RISULTATI ──
//
// ⚠️⚠️ La regola sta qui, e non dentro il componente, perché è la parte che si
// può sbagliare in silenzio: collegare l'ordine sbagliato non dà nessun errore,
// dà un margine calcolato sul valore di un altro e un bonifico intestato a chi
// ha preparato un'altra consegna. Qui si prova con i dati veri.

/** Le due forme in cui lo stesso numero si scrive: «2792» e «#2792». */
function formeDelNumero(cifre: string): Set<string> {
  return new Set([cifre, `#${cifre}`])
}

/**
 * Quale dei risultati è l'ordine di cui si sta parlando — o nessuno.
 *
 * Tre prove, in quest'ordine:
 *   1. **l'id**: è QUELL'ordine, non uno che gli somiglia;
 *   2. **numero esatto + negozio**: identifica anche senza id (l'archivio);
 *   3. **un solo risultato**: allora non c'è niente da confondere.
 *
 * ⚠️ Se restano due candidati e non sappiamo quale, torna `undefined` **apposta**:
 * sceglie una persona. Il numero da solo non è un'identità — «2792» combacia con
 * «#12792», che è di un altro negozio e di un altro cliente.
 */
export function riconosciOrdine<T extends { id: string; numero: string; negozioNome: string }>(
  trovati: T[],
  cifre: string,
  idCercato?: string,
  negozioCercato?: string
): T | undefined {
  const esatte = formeDelNumero(cifre)
  const perId = idCercato ? trovati.find((x) => x.id === idCercato) : undefined
  if (perId) return perId
  const perNegozio = negozioCercato
    ? trovati.find((x) => esatte.has(x.numero) && x.negozioNome === negozioCercato)
    : undefined
  if (perNegozio) return perNegozio
  return trovati.length === 1 ? trovati[0] : undefined
}
