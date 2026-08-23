// L'aiuto passa da WhatsApp: l'amministratore riceve la domanda sul telefono e
// risponde da lì.
//
// ⚠️⚠️ **LA FINESTRA DI 24 ORE.** WhatsApp Cloud API lascia mandare un messaggio
// libero a un numero **solo se quel numero ci ha scritto nelle ultime 24 ore**.
// Fuori da quella finestra Meta rifiuta (errore 131047) e serve un **template
// approvato**, che si crea a mano nel Business Manager. Quindi:
//   · l'avviso **può non partire**, ed è la norma se l'amministratore non ha
//     scritto di recente al numero aziendale;
//   · l'esito si SCRIVE sulla domanda e si MOSTRA a chi ha chiesto. Se chi
//     scrive crede di aver avvisato qualcuno che invece non sa niente, è peggio
//     che non avere la notifica del tutto;
//   · la domanda resta comunque salvata e visibile nel pannello. La notifica è
//     un di più, non il canale.
//
// ⚠️ Per riaprire la finestra basta che l'amministratore scriva una parola al
// numero aziendale: da lì e per 24 ore gli avvisi passano.

import { db } from './db'
import { leggiImpostazioni } from './impostazioni'
import { inviaWhatsApp } from './meta'
import { tokenPerNumero } from './numeri-whatsapp'

/** Il numero dell'amministratore, se non è stato messo in Impostazioni. */
const NUMERO_DEFAULT = '393498853209'
/** La chiave da scrivere in Impostazioni per cambiarlo senza un deploy. */
const CHIAVE_NUMERO = 'aiutoWhatsApp'

/** «A7K2C»: corto, leggibile al telefono, e basta a ritrovare la domanda. */
export function codiceDa(id: string): string {
  return id.slice(-5).toUpperCase()
}

/** Il numero a cui mandare gli avvisi (solo cifre, come vuole Meta). */
export async function numeroAmministratore(): Promise<string> {
  const c = await leggiImpostazioni([CHIAVE_NUMERO])
  return (c[CHIAVE_NUMERO] || NUMERO_DEFAULT).replace(/\D/g, '')
}

/** Da quale nostro numero esce l'avviso: il primo attivo che ha un token. */
async function nostroNumero(): Promise<{ phoneNumberId: string; token: string } | null> {
  const numeri = await db.numeroWhatsApp.findMany({
    where: { attivo: true, phoneNumberId: { not: '' } },
    orderBy: { creatoIl: 'asc' },
  })
  for (const n of numeri) {
    const token = await tokenPerNumero(n.phoneNumberId)
    if (token) return { phoneNumberId: n.phoneNumberId, token }
  }
  return null
}

/**
 * Manda su WhatsApp la domanda appena scritta.
 *
 * ⚠️ Non solleva mai: la domanda è già salvata, e un errore qui non deve
 * cancellare il lavoro di chi ha chiesto. L'esito torna scritto sulla riga.
 */
export async function avvisaAmministratore(domandaId: string): Promise<void> {
  const d = await db.domandaAiuto.findUnique({ where: { id: domandaId } })
  if (!d) return

  const codice = d.codice || codiceDa(d.id)
  const righe = [
    `AIUTO ${codice} — ${d.utenteNome || 'un operatore'}`,
    d.ordineNumero ? `Ordine ${d.ordineNumero}` : '',
    d.pagina ? `Da: ${d.pagina}` : '',
    '',
    d.testo,
    '',
    // ⚠️ Le due strade sono scritte nel messaggio: chi risponde dal telefono, in
    // piedi, non si ricorda una convenzione che non ha davanti.
    `Per rispondere: cita questo messaggio, oppure scrivi "${codice} " seguito dalla risposta.`,
  ]
    .filter((r) => r !== '')
    .join('\n')

  try {
    const nostro = await nostroNumero()
    if (!nostro) {
      await segna(d.id, codice, '', 'Nessun numero WhatsApp attivo con un token: avviso non mandato.')
      return
    }
    const a = await numeroAmministratore()
    const esito = await inviaWhatsApp(nostro.token, nostro.phoneNumberId, a, righe)
    if (esito.ok) {
      await segna(d.id, codice, esito.idEsterno, 'inviato')
    } else {
      // ⚠️ L'errore di Meta si tiene com'è: «131047» dice a chi sa leggerlo che
      // è la finestra delle 24 ore, e riscriverlo a parole nostre farebbe
      // perdere l'unica cosa che permette di diagnosticarlo.
      await segna(d.id, codice, '', esito.errore)
    }
  } catch (e) {
    await segna(d.id, codice, '', (e as Error).message)
  }
}

async function segna(id: string, codice: string, waId: string, esito: string) {
  await db.domandaAiuto.updateMany({
    where: { id },
    data: { codice, avvisoWaId: waId, avvisoEsito: esito },
  })
}

export type EsitoRispostaWa =
  | { trovata: true; domandaId: string; codice: string; chiHaChiesto: string }
  | { trovata: false }

/**
 * Un messaggio arrivato su WhatsApp è la risposta a una domanda d'aiuto?
 *
 * Due modi di riconoscerlo, e nessuno dei due indovina:
 *  1. **la citazione** — chi risponde con «rispondi a questo messaggio» ci manda
 *     `context.id`, che è il wamid del nostro avviso: legame esatto;
 *  2. **il codice in testa** — «A7K2C la consegna si può fare».
 *
 * ⚠️⚠️ **Fuori da questi due casi non si indovina.** La tentazione sarebbe:
 * «c'è una sola domanda aperta, sarà quella». Ma allora un «ok» mandato per
 * altro diventerebbe la risposta ufficiale a una domanda di lavoro, e nessuno
 * capirebbe da dove è uscita.
 *
 * ⚠️ Vale solo per i messaggi che arrivano DAL numero dell'amministratore.
 */
export async function rispostaDaWhatsApp(opz: {
  da: string
  testo: string
  citato: string
}): Promise<EsitoRispostaWa> {
  const numero = await numeroAmministratore()
  if (!numero || opz.da.replace(/\D/g, '') !== numero) return { trovata: false }

  const testo = (opz.testo ?? '').trim()
  if (!testo) return { trovata: false }

  // 1. La citazione.
  let domanda = opz.citato
    ? await db.domandaAiuto.findFirst({ where: { avvisoWaId: opz.citato, stato: 'aperta' } })
    : null
  let risposta = testo

  // 2. Il codice in testa.
  if (!domanda) {
    const m = /^([A-Za-z0-9]{5})\b[\s:,-]*([\s\S]*)$/.exec(testo)
    if (m) {
      const trovata = await db.domandaAiuto.findFirst({
        where: { codice: m[1].toUpperCase(), stato: 'aperta' },
      })
      if (trovata && m[2].trim()) {
        domanda = trovata
        risposta = m[2].trim()
      }
    }
  }

  if (!domanda) return { trovata: false }

  await db.domandaAiuto.updateMany({
    where: { id: domanda.id },
    data: {
      risposta,
      stato: 'risposta',
      // ⚠️ Chi ha risposto resta scritto insieme al COME: una risposta arrivata
      // da WhatsApp non è stata scritta guardando la schermata, ed è una cosa
      // che chi la legge ha il diritto di sapere.
      rispostaDaNome: 'Amministratore (WhatsApp)',
      rispostaIl: new Date(),
      lettaIl: null,
    },
  })
  return {
    trovata: true,
    domandaId: domanda.id,
    codice: domanda.codice,
    chiHaChiesto: domanda.utenteNome,
  }
}

/** Conferma sul telefono che la risposta è stata registrata. */
export async function confermaSuWhatsApp(testo: string): Promise<void> {
  try {
    const nostro = await nostroNumero()
    if (!nostro) return
    await inviaWhatsApp(nostro.token, nostro.phoneNumberId, await numeroAmministratore(), testo)
  } catch {
    // La conferma è cortesia: se non parte, la risposta è comunque registrata.
  }
}
