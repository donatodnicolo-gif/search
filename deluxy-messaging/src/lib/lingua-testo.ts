// In che lingua è SCRITTO un messaggio, e se va tradotto.
//
// ⚠️ Da non confondere con `lingua.ts`, che è il problema opposto: là si
// indovina in che lingua SCRIVERE a un cliente partendo dal prefisso del suo
// telefono e dal paese: serve prima che il cliente abbia detto qualcosa. Qui il
// cliente ha già scritto, e la sua lingua è nel testo — che è una prova, non un
// indizio. Quando ci sono tutte e due, questa vince.
//
// Il riconoscimento è IN CODICE, non con l'AI: si contano le parole più comuni
// di ogni lingua. Nessuna chiamata, nessun costo, nessuna attesa — e soprattutto
// nessun webhook rallentato. La stessa lezione della rubrica Google: quello che
// sta nel percorso che RICEVE i messaggi non può dipendere da un servizio di
// fuori, o si perdono messaggi.
//
// L'impianto è quello già collaudato su AI Mail (`src/lib/rilevaLingua.ts`).

const PAROLE: Record<string, string[]> = {
  italiano: ['il','lo','la','le','gli','di','che','non','per','con','sono','una','un','del','della','come','anche','più','questo','grazie','cordiali','saluti','buongiorno','vorrei','abbiamo','nostro','essere','alla','dei','ci','se','ma','suo','sua','ordine','consegna'],
  inglese: ['the','and','you','for','are','with','this','that','have','from','your','our','will','would','can','not','but','was','is','it','we','they','please','thank','thanks','regards','dear','best','kind','about','there','their','been','could','should','order','delivery'],
  francese: ['le','la','les','des','une','vous','nous','pour','avec','est','sont','dans','que','qui','pas','plus','votre','notre','bonjour','merci','cordialement','être','avoir','mais','comme','tout','bien','très','cette','commande','livraison'],
  spagnolo: ['el','la','los','las','una','usted','nosotros','para','con','es','son','en','que','no','más','su','nuestro','hola','gracias','saludos','estimado','pero','como','todo','muy','este','esta','hay','porque','pedido','entrega'],
  tedesco: ['der','die','das','und','ist','sind','mit','für','nicht','ein','eine','wir','sie','ich','haben','sehr','geehrte','freundliche','grüße','danke','aber','auch','oder','auf','von','zu','bei','wird','kann','bestellung','lieferung'],
  portoghese: ['de','que','não','uma','para','com','são','em','os','as','mais','seu','nosso','olá','obrigado','cumprimentos','mas','como','tudo','muito','este','esta','há','porque','você','encomenda','entrega'],
  olandese: ['de','het','een','en','van','is','zijn','met','voor','niet','wij','ik','hebben','zeer','geachte','vriendelijke','groeten','bedankt','maar','ook','of','op','naar','bij','wordt','kan','bestelling','levering'],
}

/** Le lingue che sappiamo riconoscere e in cui sappiamo far rispondere l'AI. */
export const LINGUE_NOTE = Object.keys(PAROLE)

/**
 * Toglie il testo citato e le intestazioni delle mail inoltrate.
 *
 * ⚠️ Senza questo, una risposta inglese di due righe sopra la nostra mail
 * italiana citata risulterebbe «italiana» — la citazione è più lunga del
 * messaggio, e vincerebbe lei.
 */
/**
 * Via gli indirizzi web e le entità HTML PRIMA di contare le parole.
 *
 * ⚠️ Misurato: senza questo, 12 newsletter italiane e inglesi su 384 risultavano
 * **portoghesi**. Un indirizzo lungo (`…sendibm3.com/mk/mr/sh/7nVTPd…`) e una
 * riga di `&#8203;` non sono parole di nessuna lingua, ma spezzati in pezzi ne
 * somigliano tante — e in un testo dove il vero contenuto sono tre righe, il
 * rumore è la maggioranza e decide lui.
 */
function senzaRumore(testo: string): string {
  return (testo ?? '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/&#?\w+;/g, ' ')
    .replace(/\S+@\S+\.\S+/g, ' ')
}

function soloTestoNuovo(testo: string): string {
  const utili: string[] = []
  for (const riga of senzaRumore(testo).split(/\r?\n/)) {
    const pulita = riga.trim()
    if (pulita.startsWith('>')) continue
    if (/^-{2,}\s*(messaggio inoltrato|original message|forwarded message)/i.test(pulita)) break
    if (/^(da|from|inviato|sent|a|to|oggetto|subject):\s/i.test(pulita)) continue
    utili.push(pulita)
  }
  return utili.join(' ')
}

/**
 * La lingua di un testo, col nome esteso ("inglese", "francese"…).
 * Stringa vuota se il testo è troppo corto o incerto: **non decidere è una
 * risposta**, e vale più di una lingua sbagliata che poi fa tradurre a vuoto.
 */
export function linguaDelTesto(testo: string | null | undefined): string {
  const pulito = soloTestoNuovo(testo ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\s']/gu, ' ')
  const parole = pulito.split(/\s+/).filter((p) => p.length > 1)
  // Sotto le otto parole si riconosce il rumore, non la lingua: «ok grazie» e
  // «ok thanks» sono la stessa frase in due lingue.
  if (parole.length < 8) return ''

  const punti = Object.entries(PAROLE).map(([lingua, comuni]) => {
    const set = new Set(comuni)
    return [lingua, parole.filter((p) => set.has(p)).length] as const
  })
  punti.sort((a, b) => b[1] - a[1])

  const [prima, punteggio] = punti[0]
  const secondo = punti[1]?.[1] ?? 0
  if (punteggio < 3) return ''
  // ⚠️ Serve un MARGINE, non basta vincere di un punto.
  //
  // Misurato sui messaggi veri: con la sola regola «il primo diverso dal
  // secondo», 13 newsletter italiane su 384 risultavano portoghesi — le due
  // lingue condividono troppe paroline corte, e una vittoria per un punto è
  // rumore, non evidenza. Costo di quell'errore: una chiamata di traduzione
  // pagata per «tradurre» dell'italiano in italiano, e una bolla che dice
  // «Originale (portoghese)» su un testo che portoghese non è.
  if (punteggio - secondo < 2) return ''
  return prima
}

/** Le lingue che leggiamo senza bisogno di traduzione, dall'impostazione. */
export function lingueLette(campo: string | null | undefined): string[] {
  return (campo ?? 'italiano')
    .split(',')
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Vero se questo messaggio va tradotto per noi.
 *
 * L'italiano non si traduce mai, e nemmeno le lingue spuntate in Impostazioni:
 * tradurre una mail inglese a chi l'inglese lo legge è una chiamata pagata per
 * peggiorare il testo.
 */
export function daTradurre(lingua: string, lette: string[]): boolean {
  const l = (lingua ?? '').trim().toLowerCase()
  if (!l || l === 'italiano') return false
  return !lette.some((letta) => l.includes(letta) || letta.includes(l))
}
