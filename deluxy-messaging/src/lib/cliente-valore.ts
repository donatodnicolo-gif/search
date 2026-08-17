// Che cliente è quello che ho davanti: nuovo, di ritorno, affezionato.
//
// Serve a chi risponde. A un cliente al primo ordine si spiegano cose che al
// nono sono offensive; a chi ha comprato nove volte e stavolta ha un problema
// si risponde con un'altra faccia. Il dato c'è già, mancava solo scriverlo
// accanto al nome.
//
// ⚠️ IL CONTO LO FA ORDERS, NON NOI. La copia locale degli ordini copre due
// mesi (927 righe su ~14.000 nel registro): contando qui, un cliente che compra
// ogni Natale risulterebbe nuovo ogni Natale. `clienteNumeroOrdine` arriva da
// Orders, che ha la storia intera, e il sync lo ricopia (src/lib/orders.ts).

/**
 * Da quanti ordini in su un cliente è «affezionato».
 *
 * Tre, e non cinque, perché è una soglia misurata e non un numero tondo:
 * sui 795 clienti distinti degli ultimi due mesi, il 91,7% ha un ordine solo,
 * il 6,2% ne ha due e solo il 2,1% arriva a tre. A cinque ordini ci arrivavano
 * tre clienti su 795 — un'etichetta che non compare mai non aiuta nessuno.
 * Sulla storia completa la quota sale, ed è quello che vogliamo: rara abbastanza
 * da voler dire qualcosa, frequente abbastanza da vederla.
 */
export const SOGLIA_AFFEZIONATO = 3

export type ProfiloCliente = {
  /** L'etichetta corta da mostrare, o null se non c'è niente da dire. */
  etichetta: string | null
  /** 'oro' per gli affezionati, 'neutro' per gli altri. */
  tono: 'oro' | 'neutro' | null
  /** Il perché, sempre: un bollino senza motivo è un bollino di cui non ci si fida. */
  spiega: string
}

/**
 * Come presentare il cliente di un ordine.
 *
 * `numeroOrdine` è il numero di QUESTO ordine per quel cliente (1 = il primo),
 * contato da Orders sulla storia completa. `null` = non lo sappiamo.
 *
 * ⚠️ Quando non lo sappiamo NON si scrive «cliente nuovo». È lo stesso errore
 * del punteggio dato a chi non ha dati: sembra un'informazione e invece è
 * un'assenza, e chi legge ci costruisce sopra il tono della risposta.
 */
export function profiloCliente(numeroOrdine: number | null | undefined): ProfiloCliente {
  if (numeroOrdine === null || numeroOrdine === undefined || numeroOrdine < 1) {
    return { etichetta: null, tono: null, spiega: 'Non sappiamo se ha già comprato.' }
  }
  if (numeroOrdine === 1) {
    return {
      etichetta: 'Nuovo cliente',
      tono: 'neutro',
      spiega: 'È il suo primo ordine con noi.',
    }
  }
  if (numeroOrdine >= SOGLIA_AFFEZIONATO + 1) {
    return {
      etichetta: `Cliente VIP · ${numeroOrdine}° ordine`,
      tono: 'oro',
      spiega: `Ha già comprato ${numeroOrdine - 1} volte: è tra i clienti che tornano di più.`,
    }
  }
  return {
    etichetta: `${numeroOrdine}° ordine`,
    tono: 'neutro',
    spiega: `Ha già comprato ${numeroOrdine - 1} ${numeroOrdine === 2 ? 'volta' : 'volte'}.`,
  }
}

/** Vero se l'ordine è di un cliente affezionato: serve per filtrare e ordinare. */
export function eVip(numeroOrdine: number | null | undefined): boolean {
  return typeof numeroOrdine === 'number' && numeroOrdine >= SOGLIA_AFFEZIONATO + 1
}

// ── «NUOVO»: arrivato mentre eri qui ────────────────────────────────────────
//
// Un ordine che compare durante il turno si perde facilmente: la lista è
// ordinata per urgenza, non per arrivo, e uno nuovo può spuntare a metà pagina
// senza che nessuno se ne accorga.
//
// ⚠️ Il confronto è su `creatoIl` — QUANDO L'ORDINE È COMPARSO DA NOI — e non
// sulla data dell'ordine. Sono due cose diverse: al primo scarico entrano
// insieme ordini di due mesi, e con la data dell'ordine sarebbero «nuovi» tutti
// quelli di oggi anche se li stai guardando da stamattina.

/** Chiave in sessionStorage: per SCHEDA, non per browser. */
export const CHIAVE_SESSIONE = 'msg-sessione-aperta'

/**
 * Il momento in cui è stata aperta questa scheda. Si fissa alla prima chiamata
 * e resta uguale per tutta la sessione, ricariche comprese.
 *
 * `sessionStorage` e non `localStorage`: «da quando sono qui» finisce quando
 * chiudi la scheda. Con localStorage, riaprendo domani l'app ti direbbe che
 * sono nuovi tutti gli ordini di ieri sera.
 */
export function inizioSessione(): number {
  if (typeof window === 'undefined') return Date.now()
  try {
    const gia = window.sessionStorage.getItem(CHIAVE_SESSIONE)
    if (gia) {
      const n = Number(gia)
      if (Number.isFinite(n) && n > 0) return n
    }
    const ora = Date.now()
    window.sessionStorage.setItem(CHIAVE_SESSIONE, String(ora))
    return ora
  } catch {
    // sessionStorage negato (navigazione privata rigida): niente etichette
    // NUOVO, che è meglio di etichette sbagliate su tutto.
    return Date.now()
  }
}

/**
 * L'ordine è comparso dopo che hai aperto l'app?
 *
 * ⚠️ `inizio` a 0 vuol dire «non lo so ancora» (primo disegno, prima che
 * l'effetto legga sessionStorage) e deve dare FALSO. Senza questa riga, `t > 0`
 * è vero per qualunque data e per un istante l'intera lista si accende di
 * NUOVO — che è il modo più veloce per rendere l'etichetta ignorabile.
 */
export function arrivatoAdesso(creatoIl: string | Date | null | undefined, inizio: number): boolean {
  if (!creatoIl || !inizio) return false
  const t = new Date(creatoIl).getTime()
  return Number.isFinite(t) && t > inizio
}

/**
 * Da quante ore un ordine conta ancora come «appena arrivato».
 *
 * Dodici e non ventiquattro: la giornata del servizio clienti è quella, e un
 * ordine entrato ieri sera alle nove non è una novità per chi si siede alla
 * scrivania stamattina — è lavoro di ieri che nessuno ha ancora preso. Il sync
 * gira ogni 15 minuti, quindi la finestra è larghissima rispetto al ritmo con
 * cui gli ordini entrano davvero.
 */
export const ORE_APPENA_ARRIVATO = 12

/**
 * L'ordine è entrato da noi da poco?
 *
 * ⚠️⚠️ QUESTA È LA DOMANDA GIUSTA, `arrivatoAdesso` rispondeva a un'altra.
 * Quella confronta con l'istante in cui hai aperto la scheda: perfetta per far
 * lampeggiare ciò che compare **mentre guardi**, inutile per chi apre la
 * bacheca la mattina — a scheda appena aperta nessun ordine è più recente
 * dell'apertura, quindi l'etichetta NUOVO non si vedeva **mai**. Le due
 * convivono: questa dice «è roba di stamattina», quella «è appena comparso
 * sotto i tuoi occhi».
 *
 * ⚠️ `adesso` si passa da fuori e non si legge qui con `Date.now()`: durante il
 * primo disegno server e browser darebbero due risposte diverse e React
 * segnalerebbe una discordanza di idratazione. Chi chiama lo tiene in uno stato
 * riempito in un effetto; con `0` questa torna sempre falso, che è il
 * comportamento giusto prima di sapere che ore sono.
 *
 * ⚠️ Si guarda `creatoIl` (quando l'ordine è comparso DA NOI), non la data
 * dell'ordine: al primo scarico di un negozio nuovo entrano insieme due mesi di
 * ordini vecchi, e sono tutti «appena arrivati» per noi — il che è vero, ed è
 * il motivo per cui questa etichetta non va usata come «ordine recente».
 */
export function appenaArrivato(
  creatoIl: string | Date | null | undefined,
  adesso: number
): boolean {
  if (!creatoIl || !adesso) return false
  const t = new Date(creatoIl).getTime()
  if (!Number.isFinite(t)) return false
  const eta = adesso - t
  // Un `creatoIl` nel futuro (orologi storti fra macchine) non deve accendere
  // un'etichetta che poi non si spegne: si accetta solo il passato recente.
  return eta >= 0 && eta <= ORE_APPENA_ARRIVATO * 3600 * 1000
}
