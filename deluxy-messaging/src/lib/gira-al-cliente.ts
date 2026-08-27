import { db } from './db'
import { inviaSulCanale } from './invio'

// LA RISPOSTA DELL'AMMINISTRATORE, GIRATA AL CLIENTE.
//
// ⚠️⚠️ Chiesto dall'utente il 27/08/2026: «l'AI deve portare avanti la
// conversazione se ha le informazioni; se non le ha chiede a me tramite WhatsApp
// al +393498853209, le rispondo e lei gira la risposta al cliente».
//
// Il giro era costruito per tre quarti: l'AI chiede (`aiuto-whatsapp.ts`),
// l'amministratore risponde dal telefono, la risposta si registra nel filo. Ma
// **lì si fermava**: il cliente non riceveva niente, e nessuno se ne accorgeva
// perché sul telefono arrivava «Risposta registrata».
//
// ⚠️⚠️ QUESTO È UN AUTOMATISMO CHE PARLA AI CLIENTI, e come tutti quelli
// dell'app ha più di una serratura. Non una: sei.
//
//  1. **solo le domande nate per un cliente** (`perIlCliente`): quelle che apre
//     un operatore per conto suo restano interne, e girarle vorrebbe dire
//     spedire una nota di lavoro a chi ha comprato dei fiori;
//  2. **solo dal numero dell'amministratore** (lo controlla `rispostaDaWhatsApp`
//     prima ancora di arrivare qui);
//  3. **la parola d'ordine per NON mandare**: chi comincia la risposta con
//     «INTERNO» sta parlando con noi, non col cliente;
//  4. **il tetto per conversazione**: se si è già risposto in automatico tre
//     volte, il problema non è la velocità — serve una persona;
//  5. **la conversazione dev'essere ancora viva**: archiviata o cancellata vuol
//     dire che qualcuno l'ha chiusa, e riaprirla da un telefono non va bene;
//  6. **la conferma dice COSA è stato mandato e A CHI**, e se non è partito lo
//     dice col motivo — un invio fallito in silenzio fa credere di aver
//     risposto a un cliente che sta ancora aspettando.

/** Quante risposte automatiche al massimo su una conversazione, in tutto. */
const TETTO_PER_CONVERSAZIONE = 3

/**
 * La parola che tiene la risposta dentro.
 *
 * ⚠️ Si guarda solo l'INIZIO e si accetta anche minuscolo: chi scrive dal
 * telefono in piedi non centra le maiuscole. E la parola si toglie dal testo
 * salvato, perché non è parte della risposta.
 */
const RESTA_DENTRO = /^\s*(interno|non mandare|nota)\b[\s:,.-]*/i

export type EsitoGiro =
  | { mandato: true; a: string; canale: string; testo: string }
  | { mandato: false; motivo: string }

/**
 * Manda al cliente quello che l'amministratore ha risposto.
 *
 * ⚠️ Il testo si gira **com'è**, non tradotto e non riscritto. L'AI potrebbe
 * tradurlo — sa in che lingua ha scritto il cliente — ma quella è la risposta
 * di una persona che risponde di quello che ha detto, e riscriverla vorrebbe
 * dire mandare al cliente una frase che l'amministratore non ha mai scritto. La
 * lingua del cliente gliela diciamo NEL messaggio d'aiuto, così sceglie lui.
 */
export async function giraRispostaAlCliente(
  domandaId: string,
  testoGrezzo: string
): Promise<EsitoGiro> {
  const d = await db.domandaAiuto.findUnique({ where: { id: domandaId } })
  if (!d) return { mandato: false, motivo: 'domanda non trovata' }
  if (!d.perIlCliente) {
    return { mandato: false, motivo: 'non è una domanda nata per un cliente: resta interna' }
  }
  if (!d.conversazioneId) {
    return { mandato: false, motivo: 'questa domanda non è legata a nessuna conversazione' }
  }

  if (RESTA_DENTRO.test(testoGrezzo)) {
    return { mandato: false, motivo: 'l’hai marcata come interna: al cliente non è andato niente' }
  }
  const testo = testoGrezzo.trim()
  if (!testo) return { mandato: false, motivo: 'la risposta è vuota' }

  const c = await db.conversazione.findUnique({ where: { id: d.conversazioneId } })
  if (!c) return { mandato: false, motivo: 'la conversazione non c’è più' }
  if (c.archiviata || c.eliminataIl) {
    return { mandato: false, motivo: 'la conversazione è stata archiviata: non ho mandato niente' }
  }

  const gia = await db.messaggio.count({
    where: { conversazioneId: c.id, direzione: 'out', tipo: 'ai' },
  })
  if (gia >= TETTO_PER_CONVERSAZIONE) {
    return {
      mandato: false,
      motivo: `già ${gia} risposte automatiche su questa conversazione: qui serve una persona`,
    }
  }

  const inviata = await inviaSulCanale(c, testo)
  // ⚠️ Anche l'invio fallito si scrive in chat, col motivo: una risposta che non
  // è partita deve VEDERSI come un errore. Sparendo, l'operatore crederebbe che
  // il cliente sia stato servito.
  await db.messaggio.create({
    data: {
      conversazioneId: c.id,
      direzione: 'out',
      tipo: 'ai',
      // ⚠️ Il nome dice da dove viene questa frase: non l'ha scritta l'AI, l'ha
      // scritta l'amministratore dal telefono. Fra un mese, davanti a un
      // cliente che cita quella riga, la differenza conta.
      utenteNome: 'AI (risposta dell’amministratore)',
      testo,
      idEsterno: inviata.ok ? inviata.idEsterno : '',
      stato: inviata.ok ? 'inviato' : 'errore',
      errore: inviata.ok ? '' : inviata.errore,
    },
  })
  if (!inviata.ok) return { mandato: false, motivo: `non è partito: ${inviata.errore}` }

  await db.conversazione.update({
    where: { id: c.id },
    data: { ultimoTesto: testo, ultimoMessaggioIl: new Date() },
    // ⚠️⚠️ `nonLetti` NON si azzera: la conversazione deve restare da leggere
    // per la persona che arriva domattina. L'amministratore ha tamponato dal
    // telefono, non ha chiuso la pratica.
  })
  return {
    mandato: true,
    a: c.nome || c.idEsterno,
    canale: c.canale,
    testo,
  }
}
