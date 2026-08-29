import { db } from './db'
import { inviaWhatsApp } from './meta'
import { tokenPerNumero } from './numeri-whatsapp'
import { leggiImpostazioni } from './impostazioni'

// L'AVVISO INTERNO: «è arrivato un pagamento da fare».
//
// ⚠️ Chiesto dall'utente il 25/08/2026. Non è un messaggio a un fornitore né a
// un cliente: è un avviso a NOI, sul telefono di chi i bonifici li fa davvero.
// Per questo non vale la regola «il messaggio si prepara e lo manda una
// persona» — qui la persona è il destinatario.
//
// ⚠️⚠️ FUNZIONA SOLO DENTRO LA FINESTRA DI 24 ORE. WhatsApp lascia scrivere in
// testo libero solo a chi ci ha scritto nelle ultime 24 ore (Meta, errore
// 131047); per scrivere per primi servirebbe un modello approvato, che questa
// app non ha. Misurato il 25/08 su questo numero: aveva scritto **39 ore prima**,
// quindi in quel momento l'avviso NON sarebbe partito.
//
// ⚠️ Quindi l'esito si SCRIVE sulla richiesta e si mostra. Un avviso che fallisce
// in silenzio è peggio di nessun avviso: si smette di guardare la pagina
// credendo che il telefono squilli, e i pagamenti restano fermi.

/**
 * Il numero a cui avvisare, dalle Impostazioni.
 *
 * ⚠️ **Non è scritto nel codice**, ed è una scelta: un numero di telefono nel
 * sorgente resta in git per sempre, e cambiarlo richiederebbe un rilascio. Sta
 * in Impostazioni, dove si cambia in dieci secondi — e dove si può anche
 * svuotare per spegnere l'avviso senza toccare niente.
 */
export async function numeroAvviso(): Promise<string> {
  const c = await leggiImpostazioni(['avvisoPagamentiNumero'])
  return (c.avvisoPagamentiNumero ?? '').replace(/\D/g, '')
}

export type EsitoAvvisoInterno = { mandato: boolean; messaggio: string }

/**
 * La causale ripete l ordine, si o no.
 * ⚠️ «Ordine #2785» contro «#2785»: stringhe diverse, stessa informazione. Si
 * confrontano le sole cifre, che e l unica cosa che identifica l ordine.
 */
export function causaleRidondante(causale: string, ordine: string): boolean {
  const cifreOrdine = (ordine || '').replace(/[^0-9]/g, '')
  if (!cifreOrdine) return false
  // Via la parola «ordine», il cancelletto e gli spazi: se quello che resta è
  // il numero e basta, la riga non aggiunge niente.
  const restante = (causale || '')
    .replace(/ordine/gi, '')
    .replace(/[#\s]/g, '')
  return restante === cifreOrdine
}

/** Il testo: quello che serve per decidere se alzarsi e pagare, e basta. */
export function testoAvviso(d: {
  chi: string
  importo: number
  valuta: string
  ordine: string
  causale: string
  da: string
  /** Come si paga: l'IBAN, o il link/PayPal/accordo per gli altri metodi. */
  metodo?: string
  iban?: string
  riferimento?: string
  /** L'indirizzo che apre QUESTA riga nella pagina Pagamenti. */
  link?: string
}): string {
  const soldi = d.importo
    ? d.importo.toLocaleString('it-IT', { style: 'currency', currency: d.valuta || 'EUR' })
    : ''
  // ⚠️⚠️ Le righe vuote si tengono, i campi assenti no — e sono due cose che
  // `filter(Boolean)` non sa distinguere: buttava via anche le righe vuote
  // messe apposta, e il messaggio arrivava tutto attaccato in un blocco unico
  // (visto sul telefono, provando). Si filtrano i CAMPI, poi si montano le
  // righe vuote intorno.
  const campi = [
    `A: ${d.chi}`,
    soldi ? `Importo: ${soldi}` : '',
    d.ordine ? `Ordine: ${d.ordine}` : '',
    // ⚠️ La causale NON si ripete quando dice la stessa cosa dell ordine: la
    // pagina la costruisce come «Ordine #2785», che come stringa e diverso da
    // «#2785» ma per chi legge e la stessa riga due volte. Confrontarle secche
    // non basta — misurato sul messaggio vero arrivato sul telefono.
    d.causale && !causaleRidondante(d.causale, d.ordine) ? `Causale: ${d.causale}` : '',
    d.da ? `Chiesto da: ${d.da}` : '',
  ].filter(Boolean)

  // ── COME SI PAGA ──
  //
  // ⚠️⚠️ L'IBAN si scrive PER INTERO, non accorciato. Negli elenchi a schermo si
  // mostrano le ultime quattro cifre apposta — un elenco di IBAN completi è una
  // cosa che si finisce per fotografare — ma qui il senso del messaggio è
  // esattamente **poter pagare dal telefono senza aprire l'app**: un IBAN a metà
  // costringe ad aprirla lo stesso, e allora tanto vale non metterlo.
  //
  // ⚠️ Sugli altri metodi l'IBAN non c'è e non deve comparire vuoto: si scrive
  // quello che serve davvero a pagare — il link, l'indirizzo PayPal, o la frase
  // di come ci si è accordati.
  const comePagare =
    d.metodo === 'iban'
      ? d.iban
        ? [`IBAN: ${d.iban}`]
        : []
      : d.riferimento
        ? [
            d.metodo === 'link'
              ? `Link di pagamento: ${d.riferimento}`
              : d.metodo === 'paypal'
                ? `PayPal: ${d.riferimento}`
                : // ⚠️ La carta da remoto si nomina per quello che è: chi legge
                  // deve capire che non c'è un bonifico da fare, ma che la
                  // spesa esiste ed è di questo importo. Quello che c'è scritto
                  // nel riferimento sono DOVE e le ultime quattro cifre — il
                  // numero intero non ci arriva (`numeroDiCartaNelTesto`).
                  d.metodo === 'carta'
                  ? `Carta da remoto: ${d.riferimento}`
                  : `Come pagare: ${d.riferimento}`,
          ]
        : []
  return [
    'Nuovo pagamento da fare.',
    '',
    ...campi,
    // Una riga vuota solo se c'è qualcosa da separare.
    ...(comePagare.length ? ['', ...comePagare] : []),
    '',
    // ⚠️⚠️ Il link porta su QUELLA riga, non sulla pagina: con duecento
    // richieste, «lo trovi in Pagamenti» vuol dire cercarla, e cercare su un
    // telefono è la cosa che si rimanda. Se l'indirizzo pubblico dell'app non è
    // configurato si scrive comunque dove andare — meglio un'indicazione che
    // niente.
    d.link ? `Aprilo qui: ${d.link}` : 'Lo trovi in Customer Service → Pagamenti.',
  ].join('\n')
}

/**
 * L'INVIO vero e proprio: manda un testo al numero degli avvisi, scegliendo il
 * mittente giusto e traducendo gli errori di Meta. Estratto (28/08) perché lo
 * usano DUE strade: le richieste nate qui dentro, e — dal collettore unico —
 * gli avvisi che Transactions manda per le richieste arrivate dalle ALTRE app
 * (Scout, Finance, Piattaforma). Una strada sola, mai due copie.
 */
export async function inviaAvvisoInterno(a: string, testo: string): Promise<EsitoAvvisoInterno> {
  try {
    // ⚠️⚠️ Si sceglie il numero NOSTRO da cui quella persona ha scritto più di
    // recente: è l'unico che può avere la finestra aperta. Prendendone uno a
    // caso, con tre numeri collegati, si sbaglierebbe due volte su tre — e
    // l'errore che tornerebbe (131047) sembrerebbe un problema del destinatario
    // invece che della scelta del mittente.
    const ultima = await db.conversazione.findFirst({
      where: { canale: 'whatsapp', idEsterno: a },
      orderBy: { ultimoMessaggioIl: 'desc' },
      select: { numeroId: true },
    })
    const n = ultima?.numeroId
      ? await db.numeroWhatsApp.findFirst({
          where: { phoneNumberId: ultima.numeroId },
          select: { phoneNumberId: true },
        })
      : null
    const ripiego = n
      ? null
      : await db.numeroWhatsApp.findFirst({
          where: { attivo: true },
          orderBy: { creatoIl: 'asc' },
          select: { phoneNumberId: true },
        })
    const phoneNumberId = n?.phoneNumberId || ripiego?.phoneNumberId || ''
    // ⚠️ Il token si chiede PER QUEL numero: con tre numeri collegati e tre
    // token diversi, uno preso a caso fa fallire l'invio con un errore che
    // parla di permessi e manda a cercare il guasto dalla parte sbagliata.
    const token = await tokenPerNumero(phoneNumberId)
    if (!token || !phoneNumberId) {
      return { mandato: false, messaggio: 'WhatsApp non è collegato: avviso non mandato.' }
    }
    const esito = await inviaWhatsApp(token, phoneNumberId, a, testo)
    if (esito.ok) return { mandato: true, messaggio: 'Avviso mandato su WhatsApp.' }
    // ⚠️ L'errore di Meta si riporta com'è e si SPIEGA: 131047 non è un guasto,
    // è la finestra di 24 ore — e chi legge deve sapere che basta scrivere un
    // messaggio qualsiasi al numero dell'azienda per riaprirla.
    const finestra =
      esito.errore.includes('131047') || esito.errore.toLowerCase().includes('24 hour')
    return {
      mandato: false,
      messaggio:
        'Avviso NON mandato: ' +
        esito.errore +
        (finestra
          ? ' — è la finestra di 24 ore di WhatsApp. Scrivi un messaggio qualsiasi al numero dell’azienda e si riapre.'
          : ''),
    }
  } catch (e) {
    return { mandato: false, messaggio: `Avviso non mandato: ${(e as Error).message}` }
  }
}

/**
 * Manda l'avviso. Non lancia mai: chi la chiama sta salvando una richiesta di
 * pagamento, e quella non deve fallire perché un avviso non è partito.
 */
export async function avvisaPagamentoDaFare(richiestaId: string): Promise<EsitoAvvisoInterno> {
  const a = await numeroAvviso()
  if (!a) {
    // ⚠️ Nessun numero non è un errore: è l'avviso spento. Si dice com'è.
    return { mandato: false, messaggio: '' }
  }
  const r = await db.richiestaPagamento.findUnique({
    where: { id: richiestaId },
    select: {
      intestatario: true,
      importo: true,
      valuta: true,
      ordineNumero: true,
      causale: true,
      pagataDaNome: true,
      metodo: true,
      iban: true,
      riferimentoPagamento: true,
    },
  })
  if (!r) return { mandato: false, messaggio: 'Richiesta non trovata.' }

  // ⚠️ L'indirizzo pubblico viene da `APP_URL` (su Vercel c'è). Senza, il link
  // resta vuoto e il messaggio dice dove andare a parole: costruirne uno con
  // `localhost` dentro sarebbe peggio che non metterlo.
  const base = (process.env.APP_URL ?? '').replace(/\/+$/, '')
  const testo = testoAvviso({
    chi: r.intestatario,
    importo: r.importo,
    valuta: r.valuta,
    ordine: r.ordineNumero,
    causale: r.causale,
    da: r.pagataDaNome,
    metodo: r.metodo,
    iban: r.iban,
    riferimento: r.riferimentoPagamento,
    link: base ? `${base}/pagamenti?richiesta=${richiestaId}` : '',
  })

  return inviaAvvisoInterno(a, testo)
}
