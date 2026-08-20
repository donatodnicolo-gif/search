// La risposta di PRIMO CONTATTO: quando un cliente scrive per la prima volta,
// riceve subito un messaggio che dice che l'abbiamo letto.
//
// Perché esiste: fra il messaggio del cliente e la prima risposta di una
// persona può passare un'ora — e chi scrive a un negozio non sa se il messaggio
// è arrivato, se il numero è quello giusto, se qualcuno leggerà. Il costo di
// quel silenzio lo paga chi aspetta.
//
// ⚠️⚠️ NON PORTA IL NOME DI UN OPERATORE, ed è il punto della funzione: firmare
// «Federica» un messaggio che Federica non ha scritto vuol dire che il cliente
// risponde a lei per nome, e che nella chat non si distingue più quello che ha
// detto una persona da quello che ha detto il sistema. Il messaggio si registra
// con `tipo: 'auto'` e `utenteNome` VUOTO, e l'inbox lo etichetta «risposta
// automatica».

import { db } from '@/lib/db'
import { leggiImpostazioni } from '@/lib/impostazioni'
import { inviaSulCanale } from '@/lib/invio'
import { linguaDelTesto } from '@/lib/lingua-testo'
import { linguaCliente, type ChiaveLingua } from '@/lib/lingua'

/**
 * Il testo di riserva, se in Impostazioni non ne è stato scritto uno.
 *
 * ⚠️ Non promette niente che non possiamo mantenere (niente «entro un'ora»,
 * niente orari che l'app non conosce): la stessa regola dei PALETTI dell'AI —
 * una promessa automatica la incassa il cliente e la paga una persona.
 */
export const TESTO_DI_RISERVA =
  'Ciao! Grazie per averci scritto: abbiamo ricevuto il tuo messaggio e ti rispondiamo ' +
  'appena possibile. Se riguarda un ordine, scrivici il numero (per esempio #1234): ' +
  'ci aiuta a risponderti più in fretta.'

/**
 * Lo stesso saluto nelle lingue che l'app sa leggere.
 *
 * ⚠️⚠️ NASCE DA UN CASO VERO: un cliente ha scritto in inglese («Hi, I want to
 * deliver a sympathy flower…») e si è visto rispondere in italiano. Un saluto
 * automatico nella lingua sbagliata è peggio del silenzio: dice al cliente che
 * dall'altra parte non lo hanno nemmeno letto.
 *
 * ⚠️ Sono TRADUZIONI SCRITTE A MANO, non una chiamata a un traduttore: questo
 * messaggio parte dentro il webhook, dove ogni attesa in più è un messaggio che
 * rischia di perdersi — e una traduzione automatica del testo scritto
 * dall'operatore non si può nemmeno rileggere prima che parta.
 */
const TESTI: Record<ChiaveLingua, string> = {
  it: TESTO_DI_RISERVA,
  en:
    'Hello! Thanks for writing: we have received your message and will get back to you ' +
    'as soon as possible. If it is about an order, send us the number (for example #1234): ' +
    'it helps us reply faster.',
  fr:
    'Bonjour ! Merci de nous avoir écrit : nous avons bien reçu votre message et nous vous ' +
    'répondrons dès que possible. S’il s’agit d’une commande, indiquez-nous le numéro ' +
    '(par exemple #1234) : cela nous aide à répondre plus vite.',
  es:
    '¡Hola! Gracias por escribirnos: hemos recibido tu mensaje y te responderemos lo antes ' +
    'posible. Si se trata de un pedido, escríbenos el número (por ejemplo #1234): nos ayuda ' +
    'a responderte más rápido.',
  de:
    'Guten Tag! Danke für Ihre Nachricht: Wir haben sie erhalten und melden uns so schnell ' +
    'wie möglich. Wenn es um eine Bestellung geht, schreiben Sie uns die Nummer ' +
    '(zum Beispiel #1234): So können wir schneller antworten.',
}

/**
 * In che lingua salutare chi ha appena scritto.
 *
 * Due segnali, in quest'ordine:
 * 1. **le sue parole** (`linguaDelTesto`, gratis e senza chiamate) — ma serve
 *    una frase di almeno otto parole: sotto, «ok grazie» e «ok thanks» sono
 *    indistinguibili, e infatti la funzione risponde «non so»;
 * 2. **il prefisso del suo numero** (+33, +49…), che è l'unico dato che dichiara
 *    davvero un paese. È lo stesso ragionamento che l'app fa già per le mail ai
 *    clienti (`linguaCliente`).
 *
 * ⚠️ Nel dubbio si resta in **italiano**: è la lingua della maggioranza dei
 * clienti, e sbagliare verso l'italiano è meno grave che rispondere in tedesco
 * a un milanese.
 */
/**
 * Parole che da sole dicono la lingua di un primo messaggio.
 *
 * ⚠️⚠️ SERVONO PERCHÉ `linguaDelTesto` QUI NON BASTA, ed è giusto così: quella
 * pretende tre parole comuni e due punti di margine perché decide se **pagare
 * una traduzione** — e su 384 newsletter, senza quel margine, 13 italiane
 * risultavano portoghesi. Misurato: «Hi I want deliver a sympathy flower in
 * Italy address is — Via Teocrito 56 20128 Milano» le fa rispondere «non so»,
 * perché metà delle parole sono nomi propri italiani.
 *
 * Qui la decisione è un'altra e costa molto meno: con quale saluto rispondere.
 * Sbagliare vuol dire un saluto nella lingua sbagliata (che poi corregge la
 * persona che risponde davvero); non decidere vuol dire rispondere in italiano
 * a chi ha scritto in inglese — che è **la stessa cosa, ma sempre**.
 */
const MARCATORI: Record<ChiaveLingua, string[]> = {
  it: ['buongiorno', 'buonasera', 'salve', 'vorrei', 'grazie', 'ordine', 'consegna', 'potete', 'avete', 'spedire'],
  en: ['hi', 'hello', 'hey', 'please', 'thanks', 'thank', 'would', 'want', 'need', 'delivery', 'deliver', 'flowers', 'order', 'address', 'my', 'is', 'i'],
  fr: ['bonjour', 'merci', 'voudrais', 'livraison', 'commande', 'pouvez', 'je', 'vous', 'svp'],
  es: ['hola', 'gracias', 'quiero', 'quisiera', 'entrega', 'pedido', 'pueden', 'por favor'],
  de: ['guten', 'hallo', 'danke', 'möchte', 'mochte', 'lieferung', 'bestellung', 'können', 'konnen', 'bitte'],
}

/** La lingua secondo i marcatori, o '' se nessuna vince da sola. */
function linguaDaiMarcatori(testo: string): ChiaveLingua | '' {
  const parole = new Set(
    (testo || '')
      .toLowerCase()
      .replace(/[^\p{L}\s']/gu, ' ')
      .split(/\s+/)
      .filter(Boolean)
  )
  const punti = (Object.entries(MARCATORI) as [ChiaveLingua, string[]][]).map(
    ([lingua, chiavi]) => [lingua, chiavi.filter((k) => parole.has(k)).length] as const
  )
  punti.sort((x, y) => y[1] - x[1])
  const [prima, punteggio] = punti[0]
  const secondo = punti[1]?.[1] ?? 0
  // Vincere, e vincere di almeno un punto: un pareggio non è un'indicazione.
  if (punteggio < 2 || punteggio === secondo) return ''
  return prima
}

export function linguaDelPrimoContatto(testo: string, idEsterno: string, canale: string): ChiaveLingua {
  const dalTesto = linguaDelTesto(testo)
  const perNome: Record<string, ChiaveLingua> = {
    italiano: 'it',
    inglese: 'en',
    francese: 'fr',
    spagnolo: 'es',
    tedesco: 'de',
  }
  if (dalTesto && perNome[dalTesto]) return perNome[dalTesto]

  // Poi i marcatori: bastano un «hello» e un «please» per non rispondere in
  // italiano a chi scrive in inglese.
  const daiMarcatori = linguaDaiMarcatori(testo)
  if (daiMarcatori) return daiMarcatori

  // Su WhatsApp `idEsterno` è il numero con il prefisso internazionale, senza
  // «+»: si rimette, altrimenti `linguaCliente` non lo riconosce come tale.
  if (canale === 'whatsapp' && /^\d{8,}$/.test(idEsterno)) {
    return linguaCliente('', '+' + idEsterno).lingua
  }
  return 'it'
}

/** Il saluto nella lingua giusta. Il testo delle Impostazioni vale per l'italiano. */
export function testoPrimoContatto(lingua: ChiaveLingua, testoConfigurato: string): string {
  if (lingua === 'it') return (testoConfigurato || TESTI.it).trim()
  return TESTI[lingua] ?? TESTI.en
}

/**
 * I canali su cui la risposta parte da sola.
 *
 * ⚠️⚠️ **LA POSTA È FUORI, di proposito.** Su una casella email arrivano
 * newsletter, notifiche di piattaforme, `noreply@…` e spam — il 17/08/2026 la
 * sola colonna Deluxy aveva 95 conversazioni quasi tutte spazzatura. Rispondere
 * in automatico lì vuol dire scrivere agli spammer (che così sanno che la
 * casella è viva) e, con un mittente che a sua volta risponde da solo, aprire
 * un ping-pong infinito fra due robot. Sulle chat il mittente è una persona che
 * ha appena scritto: il rischio non esiste.
 */
const CANALI = ['whatsapp', 'messenger', 'instagram', 'widget']

/**
 * Manda la risposta di primo contatto, se è il caso.
 *
 * Torna `true` solo se l'ha mandata davvero. **Non solleva mai**: la chiamano
 * il webhook di Meta e la rotta del widget, e un saluto automatico non può
 * essere il motivo per cui si perde il messaggio di un cliente.
 *
 * Le condizioni, tutte necessarie:
 * 1. la funzione è accesa in Impostazioni;
 * 2. il canale è una chat (vedi `CANALI`);
 * 3. **in quella conversazione c'è un solo messaggio in tutto**, ed è quello
 *    appena arrivato. È il controllo che rende la funzione «di PRIMO contatto»
 *    e insieme la protegge dal mandarla due volte: la risposta stessa diventa
 *    il secondo messaggio, quindi al prossimo giro il conto non torna più.
 *    Non serve nessun flag da tenere allineato.
 */
export async function rispostaDiPrimoContatto(conversazioneId: string): Promise<boolean> {
  try {
    const conf = await leggiImpostazioni(['primoContattoAttivo', 'primoContattoTesto'])
    if (conf.primoContattoAttivo !== 'si') return false

    const conversazione = await db.conversazione.findUnique({ where: { id: conversazioneId } })
    if (!conversazione || !CANALI.includes(conversazione.canale)) return false

    // ⚠️ Il conteggio si fa DOPO aver registrato il messaggio in arrivo: 1 = è
    // il primo in assoluto. Se fosse 0 vorrebbe dire che stiamo salutando
    // qualcuno che non ha ancora scritto.
    const quantiMessaggi = await db.messaggio.count({ where: { conversazioneId } })
    if (quantiMessaggi !== 1) return false

    // ── In che lingua ha scritto il cliente ──
    //
    // ⚠️ Il messaggio appena arrivato è l'ULTIMO (e qui l'unico): si legge da
    // lì, non dalla conversazione, che a questo punto ha solo quello.
    const primo = await db.messaggio.findFirst({
      where: { conversazioneId },
      orderBy: { creatoIl: 'asc' },
      select: { testo: true },
    })
    const lingua = linguaDelPrimoContatto(
      primo?.testo ?? '',
      conversazione.idEsterno,
      conversazione.canale
    )
    const testo = testoPrimoContatto(lingua, conf.primoContattoTesto ?? '')
    if (!testo) return false

    const esito = await inviaSulCanale(conversazione, testo)

    // Anche l'invio fallito si registra, con il motivo: un saluto che non è
    // partito deve vedersi nella chat come un errore, non sparire — altrimenti
    // l'operatore crede che il cliente sia già stato accolto.
    await db.messaggio.create({
      data: {
        conversazioneId,
        direzione: 'out',
        // ⚠️ Nessun `utenteId`/`utenteNome`: non l'ha scritto nessuno.
        tipo: 'auto',
        testo,
        idEsterno: esito.ok ? esito.idEsterno : '',
        stato: esito.ok ? 'inviato' : 'errore',
        errore: esito.ok ? '' : esito.errore,
      },
    })

    // ⚠️⚠️ LA CONVERSAZIONE NON SI TOCCA, ed è una scelta:
    // - `ultimoTesto` resta la frase del CLIENTE. Nell'elenco si legge
    //   l'anteprima dell'ultimo messaggio: se ci finisse il nostro saluto,
    //   ogni conversazione nuova mostrerebbe la stessa riga uguale a tutte le
    //   altre e la domanda del cliente sparirebbe dalla vista.
    // - `ultimoMessaggioIl` resta l'ora del cliente, così l'ordinamento e il
    //   «da quanto aspetta» continuano a misurare la sua attesa, non la nostra
    //   risposta finta.
    // - `nonLetti` NON si azzera e `presaDaId` resta vuoto: un robot non ha
    //   letto niente e non si sta occupando di nessuno.
    return esito.ok
  } catch (e) {
    console.error('Risposta di primo contatto non riuscita', e)
    return false
  }
}
