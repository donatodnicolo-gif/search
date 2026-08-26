import { db } from '@/lib/db'

// ── COSA È SUCCESSO DA QUANDO GUARDAVO L'ULTIMA VOLTA ──
//
// ⚠️⚠️ Chiesto dall'utente il 26/08/2026: «genera un pop-up in basso a destra
// ogni volta che viene compiuta un'azione — nuovo messaggio in inbox, nuovo
// ordine, ordine pagato — in modo che l'utente si accorga di ciò che succede
// nell'app». Il problema vero: quasi tutto quello che succede qui **lo fa
// qualcun altro** — un cliente che scrive, Shopify che manda un ordine, un
// collega che paga un fornitore — e finché non si andava sulla pagina giusta non
// lo sapeva nessuno. Un'app che sa una cosa e non la dice è come se non la
// sapesse.
//
// ⚠️ Il nome: **`novita`, non `avvisi`**. `src/lib/avvisi.ts` esiste già ed è
// un'altra cosa — la regola di CHI avvisare quando arriva un messaggio in inbox
// (mia o libera sì, di un collega no). Due moduli con lo stesso nome e due tipi
// `Avviso` diversi sono un import sbagliato che aspetta solo il momento.
//
// ⚠️⚠️ NON ESISTE UNA TABELLA DEGLI EVENTI, ED È VOLUTO. Le novità si ricavano
// dai fatti che sono già scritti (un messaggio, un ordine, un pagamento
// segnato): una tabella-copia degli eventi sarebbe un secondo racconto della
// stessa cosa, che può divergere da quello vero — e che va scritta in ogni punto
// del codice dove succede qualcosa, cioè che prima o poi qualcuno si dimentica.
// Qui invece una novità non può esistere senza il fatto, e il fatto non può
// esistere senza la novità. (Standard Deluxy §7: ogni dato ha una casa sola.)
//
// ⚠️ Il prezzo di questa scelta, detto: si vedono solo gli eventi che **lasciano
// una data** su una riga. «Il cliente ha pagato l'ordine» non c'è, perché il
// passaggio di `statoPagamento` da non pagato a pagato non lascia un timestamp
// suo — quello che si vede è l'ordine che ARRIVA, che nella pratica è lo stesso
// momento (su Shopify si paga al checkout, e una bozza pagata dopo diventa un
// ordine nuovo). «Ordine pagato» qui vuol dire **pagato il fornitore**, e il
// riquadro lo scrive per esteso invece di lasciarlo capire.
//
// ⚠️ Sta in una libreria e non dentro la rotta perché è la parte che si può
// PROVARE: la rotta è dietro al login, e una prova che deve prima autenticarsi
// non la scrive nessuno — cioè queste query non le proverebbe mai nessuno sui
// dati veri. Da qui invece uno script ci arriva in tre righe
// (`scripts/prova-novita.mts`).

/** Quante per tipo, al massimo. Oltre, il client dice «più di N». */
const TETTO = 10

type Gravita = 'info' | 'attenzione'

export type Novita = {
  /** Stabile: `tipo:idRiga`. Serve al client per non mostrare due volte la stessa cosa. */
  id: string
  tipo: string
  /** Come si chiama questo tipo al plurale, per il riassunto: «5 messaggi». */
  gruppo: string
  titolo: string
  dettaglio: string
  quando: string
  link: string
  gravita: Gravita
}

const euro = (n: number, valuta = 'EUR') =>
  n.toLocaleString('it-IT', { style: 'currency', currency: valuta || 'EUR' })

const CANALI: Record<string, string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
  widget: 'chat del sito',
  email: 'email',
}

/**
 * Cosa è successo fra `da` e adesso.
 *
 * @param da     Il segnaposto dell'ultima volta. `null` = prima chiamata: si
 *               torna solo l'ora, senza novità.
 * @param ioNome Chi sta guardando: le cose fatte da lui non gli si ripetono.
 */
export async function novitaDa(
  da: Date | null,
  ioNome: string
): Promise<{ adesso: string; novita: Novita[]; troncato: boolean }> {
  // ── L'OROLOGIO È QUELLO DEL DATABASE ──
  //
  // ⚠️⚠️ Non quello del browser e nemmeno quello di questa funzione. Le date di
  // queste righe le scrive il database (`@default(now())`), e il segnaposto va
  // confrontato con loro: un computer avanti di un minuto salterebbe le novità
  // di quel minuto, uno indietro le ripeterebbe per sempre. Il client riceve
  // `adesso` e lo rimanda alla chiamata dopo: così il confronto è sempre fra due
  // letture dello stesso orologio.
  let adesso = new Date()
  try {
    const r = await db.$queryRaw<{ now: Date }[]>`select now()`
    if (r?.[0]?.now) adesso = new Date(r[0].now)
  } catch {
    // se il database non dice l'ora, quella di qui è meglio di niente
  }

  // ── LA PRIMA CHIAMATA NON MOSTRA NIENTE ──
  //
  // ⚠️⚠️ Senza `da` si torna solo il segnaposto. Un avviso serve a dire «è
  // APPENA successo»: sparare le novità delle ultime ore a ogni ricarica della
  // pagina insegna in due giorni che quei riquadri non vogliono dire niente, e
  // da quel momento non avvisano più nessuno. Il passato si guarda nelle pagine,
  // che esistono apposta.
  if (!da || Number.isNaN(da.getTime())) {
    return { adesso: adesso.toISOString(), novita: [], troncato: false }
  }

  // ⚠️ Finestra CHIUSA in cima (`lte: adesso`), con `adesso` letto PRIMA delle
  // query: una riga scritta mentre queste girano non si perde e non si ripete —
  // esce al giro dopo, perché il prossimo `da` è proprio questo `adesso`.
  const finestra = { gt: da, lte: adesso }

  // ⚠️ Un tetto anche al passato: se una scheda resta aperta e in pausa per un
  // giorno, `da` è vecchissimo e senza questo si leggerebbero migliaia di righe
  // per mostrarne dieci.
  const dalPiuRecente = { orderBy: { creatoIl: 'desc' as const }, take: TETTO + 1 }

  const [messaggi, ordini, pagati, reclami, rimborsi, dispute, preventivi, chiamate] =
    await Promise.all([
      // ⚠️ Solo quelli IN ARRIVO e solo quelli veri: `out` è quello che abbiamo
      // scritto noi, e `nota` è un appunto interno — avvisare qualcuno di ciò che
      // ha appena scritto lui è il modo più rapido di far spegnere gli avvisi. Le
      // conversazioni cestinate restano fuori.
      db.messaggio.findMany({
        where: {
          creatoIl: finestra,
          direzione: 'in',
          tipo: { not: 'nota' },
          conversazione: { eliminataIl: null },
        },
        select: {
          id: true,
          testo: true,
          creatoIl: true,
          conversazione: {
            select: { id: true, nome: true, nomeRubrica: true, canale: true },
          },
        },
        ...dalPiuRecente,
      }),
      db.ordine.findMany({
        where: { creatoIl: finestra, annullatoIl: null },
        select: {
          id: true,
          numero: true,
          clienteNome: true,
          negozioNome: true,
          totale: true,
          valuta: true,
          creatoIl: true,
        },
        ...dalPiuRecente,
      }),
      // ⚠️ Il pagamento al FORNITORE. Si guarda `pagataIl`, non `creatoIl`: la
      // novità è «i soldi sono usciti», non «qualcuno ha compilato un modulo».
      db.richiestaPagamento.findMany({
        where: { pagataIl: finestra },
        select: {
          id: true,
          intestatario: true,
          importo: true,
          valuta: true,
          ordineNumero: true,
          pagataIl: true,
          pagataDaNome: true,
        },
        orderBy: { pagataIl: 'desc' },
        take: TETTO + 1,
      }),
      db.reclamo.findMany({
        where: { creatoIl: finestra },
        select: {
          id: true,
          ordineNumero: true,
          clienteNome: true,
          casistica: true,
          gravita: true,
          creatoIl: true,
        },
        ...dalPiuRecente,
      }),
      db.rimborso.findMany({
        where: { creatoIl: finestra },
        select: {
          id: true,
          ordineNumero: true,
          clienteNome: true,
          importo: true,
          valuta: true,
          richiestoDa: true,
          creatoIl: true,
        },
        ...dalPiuRecente,
      }),
      db.chargeback.findMany({
        where: { creatoIl: finestra },
        select: {
          id: true,
          ordineNumero: true,
          importo: true,
          valuta: true,
          scadenzaProve: true,
          creatoIl: true,
        },
        ...dalPiuRecente,
      }),
      db.preventivo.findMany({
        where: { creatoIl: finestra },
        select: { id: true, clienteNome: true, citta: true, richiesta: true, creatoIl: true },
        ...dalPiuRecente,
      }),
      db.chiamata.findMany({
        where: { creatoIl: finestra },
        select: {
          id: true,
          chiamante: true,
          numero: true,
          clienteNome: true,
          ordineNumero: true,
          creatoIl: true,
        },
        ...dalPiuRecente,
      }),
    ])

  // ⚠️ Se anche uno solo dei gruppi ha sfondato il tetto, il client lo deve
  // sapere: dire «3 novità» quando sono trenta è peggio che non dire niente.
  const troncato =
    messaggi.length > TETTO ||
    ordini.length > TETTO ||
    pagati.length > TETTO ||
    reclami.length > TETTO ||
    rimborsi.length > TETTO ||
    dispute.length > TETTO ||
    preventivi.length > TETTO ||
    chiamate.length > TETTO

  const taglia = <T,>(v: T[]) => v.slice(0, TETTO)
  // ⚠️ Una riga sola, e corta: il riquadro è alto due righe e il resto lo
  // taglierebbe il CSS a metà parola.
  const breve = (t: string, n = 90) => {
    const pulito = (t || '').replace(/\s+/g, ' ').trim()
    return pulito.length > n ? pulito.slice(0, n - 1) + '…' : pulito
  }
  const miei = (nome: string) =>
    !!nome && nome.trim().toLowerCase() === (ioNome || '').trim().toLowerCase()

  const novita: Novita[] = [
    ...taglia(messaggi).map((m) => {
      const chi = m.conversazione?.nomeRubrica || m.conversazione?.nome || 'Sconosciuto'
      const canale = CANALI[m.conversazione?.canale ?? ''] ?? m.conversazione?.canale ?? ''
      return {
        id: `messaggio:${m.id}`,
        tipo: 'messaggio',
        gruppo: 'messaggi',
        titolo: `Messaggio da ${chi}`,
        dettaglio: breve(m.testo) || (canale ? `Su ${canale}` : 'Nuovo messaggio'),
        quando: m.creatoIl.toISOString(),
        link: m.conversazione?.id ? `/inbox?c=${encodeURIComponent(m.conversazione.id)}` : '/inbox',
        gravita: 'info' as Gravita,
      }
    }),
    ...taglia(ordini).map((o) => ({
      id: `ordine:${o.id}`,
      tipo: 'ordine',
      gruppo: 'ordini',
      titolo: `Nuovo ordine ${o.numero}`,
      dettaglio:
        [o.clienteNome, o.negozioNome].filter(Boolean).join(' · ') +
        (o.totale ? ` — ${euro(o.totale, o.valuta)}` : ''),
      quando: o.creatoIl.toISOString(),
      link: `/ordini?apri=${encodeURIComponent(o.id)}`,
      gravita: 'info' as Gravita,
    })),
    // ⚠️ Non a chi l'ha appena fatto: chi ha premuto «Pagata» sa benissimo di
    // aver pagato, e ricevere il riquadro di una cosa fatta da sé fa sembrare
    // gli avvisi rumore. Agli altri invece serve: è denaro uscito.
    ...taglia(pagati)
      .filter((r) => !miei(r.pagataDaNome))
      .map((r) => ({
        id: `pagamento:${r.id}`,
        tipo: 'pagamento',
        gruppo: 'pagamenti',
        titolo: `Pagato ${r.intestatario || 'un fornitore'}`,
        dettaglio:
          `${euro(r.importo, r.valuta)}` +
          (r.ordineNumero ? ` · ordine ${r.ordineNumero}` : '') +
          (r.pagataDaNome ? ` · ${r.pagataDaNome}` : ''),
        quando: (r.pagataIl ?? adesso).toISOString(),
        link: `/pagamenti?richiesta=${encodeURIComponent(r.id)}`,
        gravita: 'info' as Gravita,
      })),
    ...taglia(reclami).map((r) => ({
      id: `reclamo:${r.id}`,
      tipo: 'reclamo',
      gruppo: 'reclami',
      titolo: `Reclamo su ${r.ordineNumero || 'un ordine'}`,
      dettaglio: [r.clienteNome, r.casistica].filter(Boolean).join(' · ') || 'Da leggere',
      quando: r.creatoIl.toISOString(),
      link: `/reclami?apri=${encodeURIComponent(r.id)}`,
      // ⚠️ Rosso solo il grave: se sono rossi tutti, non è rosso nessuno.
      gravita: (r.gravita >= 3 ? 'attenzione' : 'info') as Gravita,
    })),
    ...taglia(rimborsi)
      .filter((r) => !miei(r.richiestoDa))
      .map((r) => ({
        id: `rimborso:${r.id}`,
        tipo: 'rimborso',
        gruppo: 'rimborsi',
        titolo: `Rimborso chiesto su ${r.ordineNumero || 'un ordine'}`,
        dettaglio:
          [r.clienteNome, r.importo ? euro(r.importo, r.valuta) : ''].filter(Boolean).join(' · ') ||
          'Aspetta una decisione',
        quando: r.creatoIl.toISOString(),
        link: '/rimborsi',
        gravita: 'attenzione' as Gravita,
      })),
    ...taglia(dispute).map((c) => ({
      id: `chargeback:${c.id}`,
      tipo: 'chargeback',
      gruppo: 'contestazioni',
      titolo: `Contestazione su ${c.ordineNumero || 'un ordine'}`,
      dettaglio:
        `${euro(c.importo, c.valuta)}` +
        (c.scadenzaProve ? ` · prove entro il ${c.scadenzaProve.toLocaleDateString('it-IT')}` : ''),
      quando: c.creatoIl.toISOString(),
      link: '/chargeback',
      // ⚠️ Sempre in attenzione: una contestazione ha una scadenza, e scaduta
      // vuol dire soldi persi. È l'unica novità che parla di un orologio.
      gravita: 'attenzione' as Gravita,
    })),
    ...taglia(preventivi).map((p) => ({
      id: `preventivo:${p.id}`,
      tipo: 'preventivo',
      gruppo: 'preventivi',
      titolo: `Preventivo chiesto${p.clienteNome ? ` da ${p.clienteNome}` : ''}`,
      dettaglio: breve(p.richiesta) || p.citta || 'Da preparare',
      quando: p.creatoIl.toISOString(),
      link: '/preventivi',
      gravita: 'info' as Gravita,
    })),
    ...taglia(chiamate).map((c) => ({
      id: `chiamata:${c.id}`,
      tipo: 'chiamata',
      gruppo: 'chiamate',
      titolo: `Chiamata da ${c.clienteNome || c.chiamante || c.numero || 'un numero'}`,
      dettaglio: c.ordineNumero ? `Ordine ${c.ordineNumero}` : c.numero || 'Da richiamare',
      quando: c.creatoIl.toISOString(),
      link: '/chiamate',
      gravita: 'info' as Gravita,
    })),
  ]

  // Dalla più recente: se il client ne mostra tre, mostra le tre più fresche.
  novita.sort((a, b) => b.quando.localeCompare(a.quando))

  return { adesso: adesso.toISOString(), novita, troncato }
}


// ── IL PALLINO GIALLO SULLE VOCI DEL MENU ──
//
// ⚠️⚠️ Chiesto dall'utente il 27/08/2026: «metti un pallino giallo se arriva
// qualcosa di nuovo: esempio in Inbox un messaggio nuovo o in ordini aperti un
// nuovo ordine». I riquadri in basso a destra dicono cosa è appena successo e
// poi spariscono; il pallino resta finché non sei andato a guardare. Sono due
// cose diverse: uno è un richiamo, l'altro è un segnalibro.
//
// ⚠️⚠️ QUI NON SI CONFRONTANO OROLOGI. Il server dice, per ogni sezione, **la
// data della cosa più recente che c'è**; il browser si ricorda **l'ultima che ha
// già visto** e accende il pallino se le due sono diverse. Nessuno chiede mai
// «che ore sono» a nessuno: se lo si facesse, il computer avanti di un minuto
// avrebbe il pallino sempre acceso e quello indietro mai
// (`trappola-periodi-fuso-server`).

/** Le sezioni che possono ricevere qualcosa di nuovo, e la voce di menu che le mostra. */
export const SEZIONI_CON_NOVITA = [
  '/inbox',
  '/ordini',
  '/chiamate',
  '/preventivi',
  '/diario',
  '/pagamenti',
  '/reclami',
  '/rimborsi',
  '/chargeback',
] as const

/**
 * Per ogni sezione, la data della cosa più recente. Stringa vuota = non c'è
 * niente.
 *
 * ⚠️ Una query per sezione, ma sono `findFirst` con `take 1` su tabelle piccole:
 * la più grande è `Messaggio` (3.700 righe). Il conto vero non si fa: al pallino
 * non serve sapere QUANTE sono, serve sapere se ce n'è una più nuova dell'ultima
 * vista — e un `count` costerebbe di più senza dire di più.
 */
export async function ultimoPerSezione(): Promise<Record<string, string>> {
  const quando = (d: { creatoIl: Date } | null) => (d ? d.creatoIl.toISOString() : '')
  const [messaggio, ordine, chiamata, preventivo, nota, pagamento, reclamo, rimborso, disputa] =
    await Promise.all([
      // ⚠️ Solo i messaggi IN ARRIVO: il pallino dice «è arrivato qualcosa», e
      // accenderlo per la risposta che hai appena mandato tu è il modo di
      // insegnare a ignorarlo.
      db.messaggio.findFirst({
        where: { direzione: 'in', tipo: { not: 'nota' }, conversazione: { eliminataIl: null } },
        orderBy: { creatoIl: 'desc' },
        select: { creatoIl: true },
      }),
      db.ordine.findFirst({
        where: { annullatoIl: null },
        orderBy: { creatoIl: 'desc' },
        select: { creatoIl: true },
      }),
      db.chiamata.findFirst({ orderBy: { creatoIl: 'desc' }, select: { creatoIl: true } }),
      db.preventivo.findFirst({ orderBy: { creatoIl: 'desc' }, select: { creatoIl: true } }),
      db.notaDiario.findFirst({ orderBy: { creatoIl: 'desc' }, select: { creatoIl: true } }),
      db.richiestaPagamento.findFirst({ orderBy: { creatoIl: 'desc' }, select: { creatoIl: true } }),
      db.reclamo.findFirst({ orderBy: { creatoIl: 'desc' }, select: { creatoIl: true } }),
      db.rimborso.findFirst({ orderBy: { creatoIl: 'desc' }, select: { creatoIl: true } }),
      db.chargeback.findFirst({ orderBy: { creatoIl: 'desc' }, select: { creatoIl: true } }),
    ])
  return {
    '/inbox': quando(messaggio),
    '/ordini': quando(ordine),
    '/chiamate': quando(chiamata),
    '/preventivi': quando(preventivo),
    '/diario': quando(nota),
    '/pagamenti': quando(pagamento),
    '/reclami': quando(reclamo),
    '/rimborsi': quando(rimborso),
    '/chargeback': quando(disputa),
  }
}
