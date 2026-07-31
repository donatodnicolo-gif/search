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
export function ripulisciAnteprima(testo: string): string {
  let t = testo
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
    .replace(/\s+/g, ' ')
    .trim()
  // Un residuo di sole parentesi/punteggiatura non è testo.
  if (!/[\p{L}\p{N}]/u.test(t)) t = ''
  return t
}

/** L'anteprima di una riga: la prima parte di quello che è stato scritto
 *  davvero, senza la citazione, senza link e senza a-capo. */
export function anteprimaPulita(testo: string, max = 140): string {
  const { testo: nuovo } = dividiCitato(testo)
  const piatto = ripulisciAnteprima(nuovo)
  return piatto.length > max ? `${piatto.slice(0, max - 1).trimEnd()}…` : piatto
}
