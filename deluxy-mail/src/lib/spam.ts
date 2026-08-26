// Valutazione spam "a punteggio", come i client veri ma in piccolo: nessun
// segnale da solo decide, si sommano indizi. Restituisce un livello:
//   - 'basso'  → non è spam, resta in posta
//   - 'medio'  → dubbio: lo decide l'AI (giudicaSpam)
//   - 'alto'   → spam evidente: in SPAM subito, senza spendere in AI
//
// Prudenza voluta: è una casella aziendale. Chi ti ha già scritto, chi è del
// tuo dominio o è un contatto AI NON viene mai marcato spam.

export type LivelloSpam = 'basso' | 'medio' | 'alto'
export type EsitoSpam = {
  livello: LivelloSpam
  punteggio: number
  motivi: string[]
  /**
   * La CASISTICA riconosciuta, quando la mail si finge un marchio noto
   * (es. `marchio:shopify:gratuito`). Non sposta niente da sola: la prima volta
   * si chiede l'approvazione, e una volta approvata **quella casistica** le
   * successive uguali vanno in SPAM da sole. Vedi `lib/spamCasi.ts`.
   */
  caso?: { id: string; descrizione: string }
}

// Frasi tipiche di spam/phishing (IT + EN). Ognuna pesa; più ne trovi, più sale.
const FRASI: { re: RegExp; peso: number; nota: string }[] = [
  { re: /\b(hai vinto|you (have )?won|congratulazioni.*vinto|winner)\b/i, peso: 3, nota: 'annuncio di vincita' },
  { re: /\b(loteria|lotteria|lottery|jackpot|premio in denaro)\b/i, peso: 3, nota: 'lotteria/premio' },
  { re: /\b(eredit[àa]|inheritance|unclaimed funds|fondi non reclamati|prince)\b/i, peso: 3, nota: 'truffa eredità' },
  { re: /\b(verif(ica|y).{0,20}(account|conto|password)|conferma.{0,15}password|update your (details|account|password)|aggiorna i tuoi dati)\b/i, peso: 3, nota: 'phishing credenziali' },
  { re: /\b(account (sospeso|bloccato|suspended|locked|disabled)|attivit[àa] (insolita|sospetta)|unusual activity)\b/i, peso: 3, nota: 'account sospeso/attività insolita' },
  { re: /\b(bonifico urgente|wire transfer|western union|money ?gram|trasferimento fondi)\b/i, peso: 2, nota: 'richiesta di trasferimento denaro' },
  { re: /\b(viagra|cialis|farmacia online|online pharmacy|enlargement|ingrandimento)\b/i, peso: 3, nota: 'farmaci/adulti' },
  { re: /\b(bitcoin|crypto|criptovalut|investi.{0,15}(garantit|rendiment)|guadagn(a|are).{0,15}(casa|subito|facil))\b/i, peso: 2, nota: 'investimenti/guadagni facili' },
  { re: /\b(prestito|loan|credito (facile|immediato)|rimborso fiscale|tax refund)\b/i, peso: 2, nota: 'prestiti/rimborsi' },
  { re: /\b(clicca (qui|subito)|click here|act now|agisci (ora|subito)|offerta.{0,10}(scade|limited|last))\b/i, peso: 1, nota: 'invito urgente al click' },
  { re: /\b(free|gratis|100% (free|gratis|risk)|risk[- ]?free|nessun rischio)\b/i, peso: 1, nota: 'gratis/senza rischio' },
]

function contaLink(testo: string): number {
  return (testo.match(/https?:\/\//gi) || []).length
}

function dominioDa(email: string): string {
  const i = email.lastIndexOf('@')
  return i >= 0 ? email.slice(i + 1).toLowerCase() : ''
}

/** La parte prima della @ (dove le truffe nascondono il marchio). */
function localeDa(email: string): string {
  const i = email.lastIndexOf('@')
  return (i >= 0 ? email.slice(0, i) : email).toLowerCase()
}

/**
 * Caselle gratuite: un'azienda non scrive MAI ai clienti da qui. Il marchio nel
 * nome + una di queste = truffa, senza altri indizi.
 */
const PROVIDER_GRATUITI = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.it', 'hotmail.com', 'hotmail.it',
  'live.com', 'live.it', 'yahoo.com', 'yahoo.it', 'icloud.com', 'me.com', 'aol.com',
  'libero.it', 'virgilio.it', 'alice.it', 'tiscali.it', 'tin.it', 'fastwebnet.it',
  'inwind.it', 'email.it', 'mail.com', 'gmx.com', 'gmx.net', 'proton.me', 'protonmail.com',
  'yandex.com', 'zoho.com',
])

/**
 * I marchi per cui vale la regola, coi loro domini VERI.
 *
 * ⚠️ Il confronto è sul dominio intero (o su un suo sottodominio), mai
 * «il dominio contiene il marchio»: `shopifymail.it` contiene «shopify» ma non
 * è di Shopify, ed era il buco del controllo precedente. Aggiungendo un marchio
 * qui, elencare TUTTI i domini da cui scrive davvero: uno dimenticato manda in
 * SPAM la posta vera.
 */
const MARCHI: { nome: string; re: RegExp; domini: string[] }[] = [
  { nome: 'Shopify', re: /\bshopify\b/i, domini: ['shopify.com', 'shopifyemail.com', 'shopify.io'] },
  { nome: 'PayPal', re: /\bpaypal\b/i, domini: ['paypal.com', 'paypal.it', 'mail.paypal.it'] },
  { nome: 'Amazon', re: /\bamazon\b/i, domini: ['amazon.com', 'amazon.it', 'amazon.co.uk', 'marketplace.amazon.it'] },
  { nome: 'Apple', re: /\bapple\b/i, domini: ['apple.com', 'icloud.com', 'email.apple.com'] },
  { nome: 'Microsoft', re: /\bmicrosoft\b/i, domini: ['microsoft.com', 'accountprotection.microsoft.com'] },
  { nome: 'Google', re: /\bgoogle\b/i, domini: ['google.com', 'accounts.google.com', 'youtube.com'] },
  { nome: 'Meta', re: /\b(facebook|instagram|meta business)\b/i, domini: ['facebookmail.com', 'meta.com', 'instagram.com', 'mail.instagram.com'] },
  { nome: 'Poste Italiane', re: /\bposte( italiane)?\b/i, domini: ['poste.it', 'postepay.it'] },
  { nome: 'Intesa Sanpaolo', re: /\bintesa( sanpaolo)?\b/i, domini: ['intesasanpaolo.com', 'intesasanpaolo.it'] },
  { nome: 'UniCredit', re: /\bunicredit\b/i, domini: ['unicredit.eu', 'unicredit.it'] },
  { nome: 'Netflix', re: /\bnetflix\b/i, domini: ['netflix.com', 'mailer.netflix.com'] },
  { nome: 'INPS', re: /\binps\b/i, domini: ['inps.it', 'postacert.inps.gov.it'] },
  { nome: 'Agenzia delle Entrate', re: /\bagenzia (delle )?entrate\b/i, domini: ['agenziaentrate.it', 'agenziaentrate.gov.it'] },
  { nome: 'DHL', re: /\bdhl\b/i, domini: ['dhl.com', 'dhl.it'] },
  { nome: 'Stripe', re: /\bstripe\b/i, domini: ['stripe.com', 'e.stripe.com'] },
  { nome: 'Qonto', re: /\bqonto\b/i, domini: ['qonto.com', 'qonto.eu'] },
]

/**
 * SI FINGE UN MARCHIO NOTO? Il controllo che ha chiesto l'utente: «se in una
 * mail ci si presenta come Shopify ma poi l'indirizzo è un altro o gmail,
 * allora è sicuramente spam».
 *
 * È una funzione **pura** e senza database apposta: la usa il sync all'arrivo,
 * ma anche la pagina del messaggio, per riconoscere le mail arrivate PRIMA che
 * questo controllo esistesse (se no la regola varrebbe solo per il futuro e la
 * mail che hai sotto gli occhi resterebbe senza avviso).
 */
export function casoMarchio(
  mittente: string,
  mittenteNome: string | null
): { id: string; descrizione: string } | undefined {
  const nome = (mittenteNome || '').toLowerCase()
  const dominio = dominioDa(mittente)
  const locale = localeDa(mittente)

  for (const marca of MARCHI) {
    // Il marchio si cerca nel nome mostrato E nella parte prima della @: le
    // truffe ce lo mettono proprio lì («info.shopifymail.it@gmail.com») perché
    // a colpo d'occhio si legge quello e non il dominio.
    if (!marca.re.test(nome) && !marca.re.test(locale)) continue
    const slug = marca.nome.toLowerCase().replace(/\s+/g, '-')

    if (PROVIDER_GRATUITI.has(dominio)) {
      return {
        id: `marchio:${slug}:gratuito`,
        descrizione: `si presenta come "${marca.nome}" ma scrive da una casella gratuita (${dominio})`,
      }
    }
    // ⚠️ Il dominio si confronta per INTERO (o come sottodominio), non
    // «contiene il marchio»: `shopifymail.it` contiene «shopify» e non è di
    // Shopify — è esattamente il trucco su cui il vecchio controllo passava.
    if (!marca.domini.some((d) => dominio === d || dominio.endsWith(`.${d}`))) {
      return {
        id: `marchio:${slug}:dominio`,
        descrizione: `si presenta come "${marca.nome}" ma il dominio non è suo (${dominio || 'sconosciuto'})`,
      }
    }
    return undefined // è davvero quel marchio
  }
  return undefined
}

/**
 * SI FINGE UNO DI NOI? Il nome mostrato è **esattamente** un indirizzo di un
 * nostro dominio, ma la mail arriva da fuori: è la frode del capo (CEO
 * fraud), e in casella è arrivata davvero — «nicolo.donato@deluxy.it» da
 * `kei@kenic.co.jp`, oggetto «Commissioni» (4/08/2026).
 *
 * ⚠️⚠️ **La regola è STRETTA apposta, e la larghezza me l'hanno decisa i dati.**
 * Cercando «il nome cita un nostro dominio» in produzione si trovano 14 mail:
 *   - 2 sono questa truffa (nome = un indirizzo @deluxy.it, mittente giapponese);
 *   - 11 sono il NOSTRO form («landing.deluxy.it» da info@commercialedeluxy.com);
 *   - 1 è Asana che scrive PER CONTO di una collega («gaia.pati@deluxy.it
 *     tramite Asana» da no-reply@asana.com).
 * Le ultime dodici sono posta buona. Quindi: il nome dev'essere un indirizzo
 * **e nient'altro** — niente spazi. «landing.deluxy.it» non ha la chiocciola,
 * «… tramite Asana» ha degli spazi, e restano fuori tutte e due.
 * ⚠️ Il prezzo di questa prudenza: «Nicolò Donato <indirizzo esterno>», cioè il
 * solo NOME di una persona senza l'indirizzo, non viene riconosciuto. Per
 * quello servirebbe l'elenco delle persone (Deluxy Personale), e un omonimo
 * vero finirebbe in spam: meglio lasciarlo all'AI.
 */
export function casoFintoInterno(
  mittente: string,
  mittenteNome: string | null,
  nostriDomini: string[]
): { id: string; descrizione: string } | undefined {
  const nome = (mittenteNome || '').trim()
  if (!nome || nostriDomini.length === 0) return undefined
  // Uno spazio = non è «solo un indirizzo»: è un nome che ne cita uno.
  if (nome.includes(' ') || nome.includes('\t')) return undefined
  const finto = nome.toLowerCase().split('"').join('').split("'").join('')
  if (!finto.includes('@')) return undefined
  const dominioFinto = finto.slice(finto.lastIndexOf('@') + 1)
  const dominioVero = dominioDa(mittente)
  const nostro = (d: string) => Boolean(d) && nostriDomini.some((x) => d === x || d.endsWith('.' + x))
  if (!nostro(dominioFinto)) return undefined
  // È davvero uno di noi: nessun trucco.
  if (nostro(dominioVero)) return undefined
  return {
    id: `finto-interno:${dominioFinto}`,
    descrizione: `si presenta come «${finto}», che è un indirizzo NOSTRO, ma scrive da ${dominioVero || 'un dominio sconosciuto'}`,
  }
}

/**
 * L'unico punto da chiamare da fuori: le due casistiche del mittente, in
 * ordine di gravità. ⚠️ Chi ne aggiunge una la metta QUI, o le tre schermate
 * che la usano (sync, mail aperta, decisione) andranno fuori sincrono.
 */
export function casoMittente(
  mittente: string,
  mittenteNome: string | null,
  nostriDomini: string[] = []
): { id: string; descrizione: string } | undefined {
  return casoFintoInterno(mittente, mittenteNome, nostriDomini) ?? casoMarchio(mittente, mittenteNome)
}

export function valutaSpam(
  m: { oggetto: string; corpoTesto: string; mittente: string; mittenteNome: string | null },
  ctx: { contattoNoto: boolean; dominioProprio: boolean; contattoAI: boolean; nostriDomini?: string[] }
): EsitoSpam {
  // ⚠️ Si calcola PRIMA della lista bianca, ed è l'unica cosa che la scavalca:
  // fingersi uno di NOI non è mai legittimo, nemmeno da un indirizzo che ci ha
  // già scritto — anzi, chi prepara una frode del capo spesso scrive prima una
  // mail innocua, proprio per diventare «contatto noto».
  const fintoInterno = casoFintoInterno(m.mittente, m.mittenteNome, ctx.nostriDomini ?? [])

  // Whitelist: chi conosci non è mai spam. Chiude subito il discorso.
  if (ctx.contattoNoto || ctx.dominioProprio || ctx.contattoAI) {
    return { livello: 'basso', punteggio: 0, motivi: [], caso: fintoInterno }
  }

  const testo = `${m.oggetto}\n${m.corpoTesto}`
  const motivi: string[] = []
  let punti = 0

  for (const f of FRASI) {
    if (f.re.test(testo)) {
      punti += f.peso
      motivi.push(f.nota)
    }
  }

  // Oggetto tutto maiuscolo (con qualche lettera) o pieno di "!!!"
  const lettere = m.oggetto.replace(/[^A-Za-zÀ-ÿ]/g, '')
  if (lettere.length >= 6 && lettere === lettere.toUpperCase()) {
    punti += 1
    motivi.push('oggetto tutto maiuscolo')
  }
  if (/!{3,}/.test(m.oggetto + m.corpoTesto)) {
    punti += 1
    motivi.push('punteggiatura eccessiva')
  }

  // Link a indirizzi IP nudi o accorciatori: tipici del phishing.
  if (/https?:\/\/\d{1,3}(\.\d{1,3}){3}/.test(testo)) {
    punti += 2
    motivi.push('link verso un indirizzo IP')
  }
  if (/https?:\/\/(bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|ow\.ly)/i.test(testo)) {
    punti += 1
    motivi.push('link accorciato')
  }
  if (contaLink(testo) >= 8) {
    punti += 1
    motivi.push('molti link')
  }

  // Si presenta come un marchio noto ma la mail non è del marchio → spoofing.
  // ⚠️ La casistica NON dà punti: la si approva la prima volta e poi si applica
  // da sola. Sommarla al punteggio vorrebbe dire spostare la mail comunque, e
  // l'approvazione diventerebbe una domanda a cose fatte.
  const caso = fintoInterno ?? casoMarchio(m.mittente, m.mittenteNome)

  // Mittente sconosciuto: segnale debole, da solo non basta.
  punti += 1
  motivi.push('mittente mai visto prima')

  const livello: LivelloSpam = punti >= 5 ? 'alto' : punti >= 3 ? 'medio' : 'basso'
  return { livello, punteggio: punti, motivi, caso }
}
