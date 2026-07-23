// Riconoscimento della LINGUA di un testo, senza AI.
//
// Perché non basta `Messaggio.lingua`: quel campo lo riempie la traduzione
// automatica, che gira solo se l'utente ha `traduzioneAuto` attiva. Chi legge
// l'inglese la tiene spenta → il campo resta null → Renè non sapeva in che
// lingua rispondere e, vedendo nel thread le nostre risposte in italiano,
// scriveva in italiano anche a chi aveva scritto in inglese.
//
// Qui si decide in CODICE (lezione già imparata in questo progetto: una cosa
// che deve essere vera non si affida al prompt). Nessuna chiamata, nessun
// costo: punteggio sulle parole più comuni di ogni lingua.

const PAROLE: Record<string, string[]> = {
  italiano: ['il','lo','la','le','gli','di','che','non','per','con','sono','una','un','del','della','come','anche','più','questo','grazie','cordiali','saluti','buongiorno','vorrei','abbiamo','nostro','essere','alla','dei','ci','se','ma','suo','sua'],
  inglese: ['the','and','you','for','are','with','this','that','have','from','your','our','will','would','can','not','but','was','is','it','we','they','please','thank','thanks','regards','dear','best','kind','about','there','their','been','could','should'],
  francese: ['le','la','les','des','une','vous','nous','pour','avec','est','sont','dans','que','qui','pas','plus','votre','notre','bonjour','merci','cordialement','être','avoir','mais','comme','tout','bien','très','cette'],
  spagnolo: ['el','la','los','las','una','usted','nosotros','para','con','es','son','en','que','no','más','su','nuestro','hola','gracias','saludos','estimado','pero','como','todo','muy','este','esta','hay','porque'],
  tedesco: ['der','die','das','und','ist','sind','mit','für','nicht','ein','eine','wir','sie','ich','haben','sehr','geehrte','freundliche','grüße','danke','aber','auch','oder','auf','von','zu','bei','wird','kann'],
  portoghese: ['de','que','não','uma','para','com','são','em','os','as','mais','seu','nosso','olá','obrigado','cumprimentos','mas','como','tudo','muito','este','esta','há','porque','você'],
  olandese: ['de','het','een','en','van','is','zijn','met','voor','niet','wij','ik','hebben','zeer','geachte','vriendelijke','groeten','bedankt','maar','ook','of','op','naar','bij','wordt','kan'],
}

/** Toglie la parte citata (le righe con ">") e le firme: la lingua va decisa
 *  sul testo NUOVO, non su quello che si porta dietro la citazione. */
function soloTestoNuovo(testo: string): string {
  const righe = testo.split(/\r?\n/)
  const utili: string[] = []
  for (const r of righe) {
    const pulita = r.trim()
    if (pulita.startsWith('>')) continue
    // Da qui in giù è la mail citata: non serve più.
    if (/^-{2,}\s*(messaggio inoltrato|original message|forwarded message)/i.test(pulita)) break
    if (/^(da|from|inviato|sent|a|to|oggetto|subject):\s/i.test(pulita)) continue
    utili.push(pulita)
  }
  return utili.join(' ')
}

/**
 * La lingua del testo, col nome usato dal resto dell'app ("italiano",
 * "inglese", …). null se il testo è troppo corto o non riconoscibile: in quel
 * caso chi chiama decide (di norma: non forzare nulla).
 */
export function rilevaLingua(testo: string | null | undefined): string | null {
  const pulito = soloTestoNuovo(testo ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\s']/gu, ' ')
  const parole = pulito.split(/\s+/).filter((p) => p.length > 1)
  if (parole.length < 8) return null // troppo poco per decidere

  const punti: Record<string, number> = {}
  for (const [lingua, comuni] of Object.entries(PAROLE)) {
    const set = new Set(comuni)
    punti[lingua] = parole.filter((p) => set.has(p)).length
  }

  const ordinate = Object.entries(punti).sort((a, b) => b[1] - a[1])
  const [primaLingua, primoPunteggio] = ordinate[0]
  const secondoPunteggio = ordinate[1]?.[1] ?? 0

  // Serve un minimo di evidenza e un margine sul secondo: se due lingue sono
  // appaiate (capita con testi corti o misti) è meglio non decidere.
  if (primoPunteggio < 3) return null
  if (primoPunteggio === secondoPunteggio) return null
  return primaLingua
}
