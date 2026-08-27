/**
 * IL TESTO CITATO.
 *
 * In una conversazione ogni risposta si porta dietro tutta quella precedente:
 * leggere il quinto messaggio vuol dire scorrere i quattro di prima, ogni
 * volta. È la frizione più grossa dei thread — Gmail la risolve nascondendo la
 * citazione dietro i tre puntini, ed è la sola cosa che qui vale la pena
 * copiare pari pari.
 *
 * Qui si taglia al PRIMO segno di citazione riconosciuto, e si tiene il resto
 * da parte: non si butta niente, si mette dietro un «mostra».
 *
 * ⚠️ Se non si riconosce niente, non si taglia. Un taglio sbagliato nasconde
 * parte del messaggio VERO, che è molto peggio del disturbo che si voleva
 * togliere: nel dubbio si mostra tutto.
 */

/** Le righe che segnano l'inizio di una citazione. */
const SEGNI: RegExp[] = [
  // «Il giorno mar 29 lug 2026 alle 12:00 Mario Rossi <m@x.it> ha scritto:»
  /^\s*il\s+giorno\s+.{0,120}\bha\s+scritto\s*:\s*$/i,
  // «On Tue, Jul 29, 2026 at 12:00 PM Mario Rossi <m@x.it> wrote:»
  /^\s*on\s+.{0,120}\bwrote\s*:\s*$/i,
  // Outlook, italiano e inglese.
  /^\s*-{2,}\s*(messaggio originale|original message)\s*-{2,}\s*$/i,
  // La riga di separazione che Outlook mette prima del blocco Da:/Inviato:
  /^\s*_{10,}\s*$/,
  // Il blocco «Da: … Inviato: …» (prima riga di un inoltro Outlook).
  /^\s*(da|from)\s*:\s*.{2,200}$/i,
  // Il vecchio stile: righe che iniziano con «>».
  /^\s*>/,
]

/** Quanto deve essere lunga la parte citata perché valga la pena nasconderla. */
const MINIMO_CITATO = 200
/** Sotto questa soglia la parte «nuova» è troppo corta: sospetto di taglio sbagliato. */
const MINIMO_NUOVO = 2

export type TestoDiviso = {
  /** Quello che ha scritto DAVVERO chi manda questo messaggio. */
  testo: string
  /** La conversazione riportata sotto, o stringa vuota se non c'è. */
  citato: string
}

export function dividiCitato(testo: string): TestoDiviso {
  const righe = testo.split(/\r?\n/)
  for (let i = 0; i < righe.length; i++) {
    if (!SEGNI.some((r) => r.test(righe[i]))) continue

    const nuovo = righe.slice(0, i).join('\n').trimEnd()
    const citato = righe.slice(i).join('\n').trim()
    // Il segno è all'inizio (è un inoltro puro) o la coda è corta: non si tocca.
    if (nuovo.trim().split(/\s+/).filter(Boolean).length < MINIMO_NUOVO) return { testo, citato: '' }
    if (citato.length < MINIMO_CITATO) return { testo, citato: '' }
    return { testo: nuovo, citato }
  }
  return { testo, citato: '' }
}

/**
 * Toglie i SEGNAPOSTO delle immagini/allegati in linea, cioè i nomi di file fra
 * parentesi angolari — `<firma5.png>`, `<Screenshot 2026-07-18 alle 23.53.46.png>`
 * — che i client Apple mettono nel testo semplice al posto delle immagini
 * incorporate. Non è testo: è rumore che riempie il corpo (segnalato il
 * 17/08/2026). Le immagini vere restano nella «versione formattata» e fra gli
 * allegati.
 *
 * ⚠️ NON tocca gli indirizzi fra parentesi angolari — `<martina.calia@deluxy.it>`
 * — perché il segnaposto non ha la «@»: si accettano solo nomi di file che
 * finiscono con un'estensione nota, senza «@» né «/» dentro.
 */
export function senzaSegnapostoFile(testo: string): string {
  return testo
    .replace(
      /<[^<>@/\n]{1,120}\.(png|jpe?g|gif|heic|heif|webp|bmp|tiff?|svg|pdf|docx?|xlsx?|pptx?|zip)>/gi,
      ''
    )
    // Restano spesso spazi doppi o righe di soli spazi dove stavano in fila.
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]+$/gm, '')
}

/**
 * L'anteprima leggibile di una mail.
 *
 * ⚠️ Il testo di una mail HTML (newsletter, notifiche) non è testo: è la
 * conversione fatta dal server di posta, e viene fuori roba come
 * `[https://…/logo.png]https://click.…/f/a/YTRVAK…` — cioè l'indirizzo
 * dell'immagine e quello del link, uno attaccato all'altro. In elenco quella
 * riga occupa lo spazio dell'anteprima senza dire NIENTE.
 *
 * Qui si tolgono immagini, link e residui di formattazione e restano le
 * parole. Se di parole non ne resta nessuna si torna stringa vuota: meglio una
 * riga vuota che una riga di indirizzi — l'oggetto la mail la racconta già.
 */
/**
 * ⚠️ Entità HTML nell'anteprima. Alcune mail (specie promozionali) infilano il
 * testo pieno di entità numeriche — `Op til 40% p&#229; udvalgte buketter`
 * (å = &#229;) — e, fra una parola e l'altra, sequenze come `&#8199;&#847;`:
 * uno spazio-cifra (invisibile) più un giuntore di grafemi (invisibile), messi
 * apposta per spezzare le parole e ingannare i filtri antispam. Non decodificate
 * si leggevano come `&#8199;&#847;` a schermo (segnalato il 17/08/2026). Qui si
 * decodificano e poi si tolgono i caratteri invisibili, così resta la frase.
 */
function decodificaEntita(s: string): string {
  return (
    s
      // Entità numeriche: decimali (&#229;) ed esadecimali (&#xE5;).
      .replace(/&#(\d{1,7});/g, (_, n) => sicuroDaCodice(parseInt(n, 10)))
      .replace(/&#x([0-9a-f]{1,6});/gi, (_, n) => sicuroDaCodice(parseInt(n, 16)))
      // ⚠️⚠️ Le entità con nome dei caratteri INVISIBILI. Le newsletter riempiono
      // il «preheader» — la riga che i client mostrano in anteprima — con decine
      // di `&zwnj;` di seguito, per impedire che dopo il titolo si veda l’inizio
      // del corpo. Il ripulitore qui sotto toglie già quei caratteri, ma li
      // cercava come CARATTERI: `&zwnj;` non veniva mai decodificato, e nessuna
      // delle due regole lo prendeva. Risultato a schermo: un'anteprima fatta di
      // «&zwnj; &zwnj; &zwnj;…» al posto del testo (visto il 27/08/2026 su una
      // mail di Matrimonio.com). Si tolgono qui, prima che diventino testo.
      .replace(/&(zwnj|zwj|lrm|rlm|shy|nbsp);/gi, (_, nome) => (/nbsp/i.test(nome) ? ' ' : ''))
      .replace(/&(ensp|emsp|thinsp|hairsp|numsp|puncsp);/gi, ' ')
      // Le altre entità con nome più comuni (non si decodificano `&lt;`/`&gt;`:
      // un «<» riportato in vita potrebbe far ricomparire residui di tag).
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
  )
}
/** Un codice numerico → il carattere, senza far esplodere niente.
 *  ⚠️ `String.fromCodePoint` LANCIA per qualunque valore sopra 0x10FFFF, e
 *  un'entità malformata in una mail (`&#1114112;`) basta a fermare l'intero
 *  scarico di quella casella. Esportata perché serviva anche a `imap.ts`,
 *  dove la stessa decodifica era rimasta senza rete. */
export function sicuroDaCodice(n: number): string {
  if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff) return ' '
  try {
    return String.fromCodePoint(n)
  } catch {
    return ' '
  }
}

export function ripulisciAnteprima(testo: string): string {
  let t = senzaSegnapostoFile(decodificaEntita(testo))
    // Caratteri invisibili che i mittenti infilano per spezzare le parole:
    // soft-hyphen, giuntore di grafemi, zero-width, word-joiner, BOM. Via, o
    // restano fra le lettere. Gli spazi \u00ABlarghi\u00BB li collassa lo `\s+` pi\u00F9 sotto.
    .replace(/[\u00AD\u034F\u200B-\u200F\u2028\u2029\u2060\uFEFF]/g, '')
    // ⚠️ CSS finito nel testo: le mail di Outlook portano un blocco <style> e
    // certi client, convertendo in testo semplice, ne lasciano il CONTENUTO —
    // «P {margin-top:0;margin-bottom:0;} Gentile Nicolò…». Si toglie solo se
    // dentro le graffe c'è una proprietà con i due punti: una frase con una
    // parentesi graffa non deve sparire.
    .replace(/[^{}\n]{0,60}\{[^{}]{0,400}[a-z-]+\s*:[^{}]{0,400}\}/gi, ' ')
    // Commenti condizionali e residui di <style> aperti a metà.
    .replace(/<!--[\s\S]{0,400}?-->/g, ' ')
    // Immagine in stile markdown/testo: [https://…] oppure [cid:…] o [logo].
    .replace(/\[(?:https?:\/\/|cid:)[^\]]*\]/gi, ' ')
    // Link markdown [testo](url): resta il testo, che è quello che si legge.
    .replace(/\[([^\]]{1,80})\]\((?:https?:\/\/|mailto:)[^)]*\)/gi, '$1')
    // Indirizzi nudi (compresi quelli lunghissimi di tracciamento).
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, ' ')
    .replace(/\bcid:\S+/gi, ' ')
    // Righe di separazione e simboli avanzati dalla conversione.
    .replace(/[-=_*~|]{3,}/g, ' ')
    // ⚠️ L'anteprima SALVATA è tagliata a una lunghezza fissa, quindi l'ultima
    // cosa che contiene è spesso monca: mezza entità («&zwn») o mezzo indirizzo
    // («htt»). Le regole qui sopra cercano la forma intera e non le prendono, e
    // il moncone resta a schermo in coda al testo. Si tolgono solo IN FONDO, dove
    // un troncone è per forza un troncone: in mezzo alla frase «&ne» o «http»
    // potrebbero essere testo vero.
    .replace(/&[a-z]{1,10}$/i, ' ')
    .replace(/\b(?:h|ht|htt|http|https|www)$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // Un residuo di sole parentesi/punteggiatura non è testo.
  if (!/[\p{L}\p{N}]/u.test(t)) t = ''
  return t
}

/**
 * L'oggetto senza la scala di «Re: R: R: R:…».
 *
 * Ogni client rimanda la palla aggiungendo il SUO prefisso (Re:, R:, I:, Fwd:,
 * AW:, SV:…) davanti a quelli già accumulati: all'ottavo giro l'oggetto vero
 * sta in fondo a una fila di sigle che non dice niente. Qui, SOLO a schermo,
 * la fila si accorcia a un «Re:» — il dato salvato non si tocca.
 *
 * ⚠️ Si interviene solo quando i prefissi sono ALMENO DUE: un «R: qualcosa»
 * singolo può essere un oggetto vero (una sigla, un codice), e riscriverlo
 * in «Re:» sarebbe dedurre — nel dubbio si lascia com'è.
 */
export function oggettoLeggibile(oggetto: string): string {
  const prefissi = /^((re|r|fw|fwd|i|tr|aw|sv|vs|rif|res)\s*:\s*){2,}/i
  const m = oggetto.match(prefissi)
  if (!m) return oggetto
  const resto = oggetto.slice(m[0].length).trim()
  return resto ? `Re: ${resto}` : oggetto
}

/** L'anteprima di una riga: la prima parte di quello che è stato scritto
 *  davvero, senza la citazione, senza link e senza a-capo. */
export function anteprimaPulita(testo: string, max = 140): string {
  const { testo: nuovo } = dividiCitato(testo)
  const piatto = ripulisciAnteprima(nuovo)
  return piatto.length > max ? `${piatto.slice(0, max - 1).trimEnd()}…` : piatto
}
