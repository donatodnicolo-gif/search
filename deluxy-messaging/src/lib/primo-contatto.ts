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

    const testo = (conf.primoContattoTesto || TESTO_DI_RISERVA).trim()
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
