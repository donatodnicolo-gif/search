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
/** Da quale nostro numero esce l'avviso: il `phone_number_id`, se scelto. */
const CHIAVE_MITTENTE = 'aiutoWaNumeroId'

/** «A7K2C»: corto, leggibile al telefono, e basta a ritrovare la domanda. */
export function codiceDa(id: string): string {
  return id.slice(-5).toUpperCase()
}

/** Il numero a cui mandare gli avvisi (solo cifre, come vuole Meta). */
export async function numeroAmministratore(): Promise<string> {
  const c = await leggiImpostazioni([CHIAVE_NUMERO])
  return (c[CHIAVE_NUMERO] || NUMERO_DEFAULT).replace(/\D/g, '')
}

/**
 * Da quale nostro numero esce l'avviso.
 *
 * ⚠️⚠️ **Non è indifferente.** Un avviso interno che esce dalla linea clienti di
 * un marchio finisce in mezzo al suo traffico, e le risposte dell'amministratore
 * arrivano su quella linea. La prima versione prendeva «il primo numero
 * registrato»: era una regola arbitraria, e per caso pescava il numero di
 * Flowers — la linea più battuta dai clienti dei fiori.
 *
 * L'ordine adesso è: **quello scelto in Impostazioni** (`aiutoWaNumeroId`),
 * altrimenti la linea del marchio **generale** (Deluxy), altrimenti la prima che
 * c'è. Non è un caso che il ripiego sia la generale: è quella che riceve meno
 * clienti, quindi quella dove un messaggio interno dà meno fastidio.
 */
async function nostroNumero(): Promise<{ phoneNumberId: string; token: string } | null> {
  const numeri = await db.numeroWhatsApp.findMany({
    where: { attivo: true, phoneNumberId: { not: '' } },
    orderBy: { creatoIl: 'asc' },
    include: { negozio: { select: { nome: true } } },
  })
  if (!numeri.length) return null

  const conf = await leggiImpostazioni([CHIAVE_MITTENTE])
  const scelto = (conf[CHIAVE_MITTENTE] ?? '').trim()

  const preferiti = [
    // 1. Quello scelto a mano.
    ...numeri.filter((n) => scelto && n.phoneNumberId === scelto),
    // 2. La linea del marchio generale: «Deluxy» e non «Deluxy Flowers» o
    //    «Cake», che sono i marchi coi clienti.
    ...numeri.filter((n) => (n.negozio?.nome ?? '').trim().toLowerCase() === 'deluxy'),
    // 3. Quello che c'è.
    ...numeri,
  ]
  for (const n of preferiti) {
    const token = await tokenPerNumero(n.phoneNumberId)
    if (token) return { phoneNumberId: n.phoneNumberId, token }
  }
  return null
}

/** Il numero da cui escono gli avvisi, in forma leggibile: per dirlo a schermo. */
export async function mittenteAvvisi(): Promise<string> {
  const scelto = await nostroNumero()
  if (!scelto) return ''
  const n = await db.numeroWhatsApp.findUnique({ where: { phoneNumberId: scelto.phoneNumberId } })
  return n?.numeroVisibile || n?.nome || scelto.phoneNumberId
}

/**
 * Manda su WhatsApp la domanda appena scritta.
 *
 * ⚠️ Non solleva mai: la domanda è già salvata, e un errore qui non deve
 * cancellare il lavoro di chi ha chiesto. L'esito torna scritto sulla riga.
 */
export async function avvisaAmministratore(domandaId: string, seguito?: string): Promise<void> {
  const d = await db.domandaAiuto.findUnique({ where: { id: domandaId } })
  if (!d) return

  const codice = d.codice || codiceDa(d.id)
  // ── CHI STA ASPETTANDO DALL'ALTRA PARTE ──
  //
  // ⚠️⚠️ Quando la domanda nasce per un cliente, quello che si risponde **va al
  // cliente**. Deve essere scritto nel messaggio, in chiaro e prima della
  // risposta: chi legge dal telefono, in piedi, non può ricordarsi che questa
  // richiesta si comporta diversamente dalle altre.
  //
  // ⚠️ E si dice IN CHE LINGUA ha scritto il cliente: la risposta si gira com'è,
  // non tradotta (riscriverla vorrebbe dire mandargli una frase che
  // l'amministratore non ha mai scritto), quindi la scelta della lingua è sua e
  // deve poterla fare.
  let perCliente: string[] = []
  if (d.perIlCliente && d.conversazioneId) {
    const c = await db.conversazione.findUnique({
      where: { id: d.conversazioneId },
      select: { nome: true, idEsterno: true, canale: true },
    })
    const ultimo = await db.messaggio.findFirst({
      where: { conversazioneId: d.conversazioneId, direzione: 'in' },
      orderBy: { creatoIl: 'desc' },
      select: { lingua: true },
    })
    if (c) {
      perCliente = [
        `⚠️ Quello che rispondi lo MANDO AL CLIENTE: ${c.nome || c.idEsterno} (${c.canale}${ultimo?.lingua ? `, scrive in ${ultimo.lingua}` : ''}).`,
        'Se invece è una nota per noi, comincia con "INTERNO".',
      ]
    }
  }

  // ⚠️ Un messaggio successivo si annuncia come tale: «AIUTO K37ZP (ancora)».
  // Senza, sul telefono sembrerebbe una richiesta nuova, e chi risponde
  // ricomincerebbe da capo una conversazione già a metà.
  const righe = [
    `AIUTO ${codice}${seguito ? ' (ancora)' : ''} — ${d.utenteNome || 'un operatore'}`,
    d.ordineNumero ? `Ordine ${d.ordineNumero}` : '',
    d.pagina ? `Da: ${d.pagina}` : '',
    '',
    seguito ?? d.testo,
    '',
    ...perCliente,
    ...(perCliente.length ? [''] : []),
    // ⚠️ Le due strade sono scritte nel messaggio: chi risponde dal telefono, in
    // piedi, non si ricorda una convenzione che non ha davanti.
    `Per rispondere: cita questo messaggio, oppure scrivi "${codice} " seguito dalla risposta.`,
  ]
    // ⚠️ Le righe vuote messe APPOSTA si tengono (separano i blocchi), i campi
    // assenti no: `filter(Boolean)` non sa distinguerli e attaccherebbe tutto
    // in un blocco unico — già successo, e visto sul telefono provando.
    .filter((r, i, a) => r !== '' || (i > 0 && a[i - 1] !== ''))
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
  | {
      trovata: true
      domandaId: string
      codice: string
      chiHaChiesto: string
      /** ⚠️ Vera = quello che ha scritto va girato al cliente che aspetta. */
      perIlCliente: boolean
      /** Il testo della sola risposta, senza il codice in testa. */
      risposta: string
    }
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
  // ⚠️ `avvisoWaId` è quello dell'ULTIMO avviso mandato per quella richiesta:
  // citando un avviso vecchio di uno scambio lungo non si trova più niente, e
  // allora vale il codice in testa. È il motivo per cui le due strade servono
  // tutte e due.
  let domanda = opz.citato
    ? await db.domandaAiuto.findFirst({ where: { avvisoWaId: opz.citato, stato: { not: 'chiusa' } } })
    : null
  let risposta = testo

  // 2. Il codice in testa.
  if (!domanda) {
    const m = /^([A-Za-z0-9]{5})\b[\s:,-]*([\s\S]*)$/.exec(testo)
    if (m) {
      const trovata = await db.domandaAiuto.findFirst({
        where: { codice: m[1].toUpperCase(), stato: { not: 'chiusa' } },
      })
      if (trovata && m[2].trim()) {
        domanda = trovata
        risposta = m[2].trim()
      }
    }
  }

  if (!domanda) return { trovata: false }

  // ⚠️ Entra nel FILO, non in un campo «risposta»: una richiesta d'aiuto è uno
  // scambio, e la prima risposta quasi mai è quella definitiva.
  // ⚠️ `viaWhatsApp` resta scritto: chi legge ha diritto di sapere che quella
  // riga è stata scritta dal telefono e non guardando la schermata.
  await db.messaggioAiuto.create({
    data: {
      domandaId: domanda.id,
      autore: 'admin',
      autoreNome: 'Amministratore',
      testo: risposta,
      viaWhatsApp: true,
    },
  })
  await db.domandaAiuto.updateMany({
    where: { id: domanda.id },
    // ⚠️ Resta APERTA: rispondere non vuol dire aver finito. Si chiude con un
    // gesto apposta, quando chi ha chiesto (o chi risponde) dice che basta.
    data: { stato: 'aperta', lettaIl: null },
  })
  return {
    trovata: true,
    domandaId: domanda.id,
    codice: domanda.codice,
    chiHaChiesto: domanda.utenteNome,
    perIlCliente: domanda.perIlCliente,
    // ⚠️ La risposta RIPULITA: col codice in testa («A7K2C la consegna si fa»)
    // il cliente si vedrebbe arrivare anche il codice, che per lui non vuol
    // dire niente e sembra un errore.
    risposta,
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
