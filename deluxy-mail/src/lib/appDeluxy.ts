// APP DELUXY — il catalogo delle funzioni delle altre app che AI Mail può
// richiamare a partire da una mail. Ogni azione dichiara: lo schema dei dati
// che l'AI deve estrarre dalla mail, e come eseguire la chiamata HTTP.
//
// Regola di prodotto: l'AI PREPARA i dati e di norma l'utente li vede e
// CONFERMA. L'unica strada che parte da sola è l'azione agganciata a una
// sezione in modo «automatico» (vedi azioneSezione.ts), e per questo ogni
// azione può avere `normalizza` e `verifica`: lì non c'è nessuno a guardare.

import type { RegolaApp } from '@prisma/client'
import type { ChiaviApp, NomeChiaveApp } from './chiaviApp'
import { condizioneSoddisfatta } from './condizioni'

// ---------- Configurazione (env su Vercel; i default sono gli URL pubblici) ----------
// Solo gli URL vengono dall'ambiente: non sono segreti. Le CHIAVI arrivano dal
// resolver (chiaviApp.ts: DB cifrato → env) e sono passate a ogni azione via ctx.

const ANAGRAFICHE_URL = (process.env.ANAGRAFICHE_URL || 'https://deluxy-anagrafiche.vercel.app').replace(/\/$/, '')
const FINANCE_URL = (process.env.FINANCE_URL || 'https://deluxy-partner.vercel.app').replace(/\/$/, '')
const FORNITORI_URL = (process.env.FORNITORI_URL || 'https://search-deluxy.vercel.app').replace(/\/$/, '')
const COMMERCIALE_URL = (process.env.COMMERCIALE_URL || 'https://fdsziebgkljfsugqqbqd.supabase.co/functions/v1').replace(/\/$/, '')

/** Qual è la chiave (fra quelle di ChiaviApp) che serve a ciascuna app. */
export const CHIAVE_DI_APP: Record<string, NomeChiaveApp> = {
  Anagrafiche: 'anagrafiche',
  Finance: 'finance',
  Fornitori: 'fornitori',
  Commerciale: 'commerciale',
}

// ---------- Tipi ----------

/**
 * L'esito di un'azione verso un'app Deluxy.
 *
 * `scelte`: quando l'app non riesce a decidere DA SOLA fra più record (due
 * negozi che si chiamano quasi uguale), invece di fermarsi con una frase
 * restituisce i candidati e qui si fanno vedere. ⚠️ Prima li buttavamo via:
 * l'app rispondeva `{ error, candidati: [...] }` e AI Mail teneva solo il testo,
 * lasciando l'utente a indovinare il nome esatto o ad andare a mano nell'altra
 * app (segnalato il 24/08/2026 con «Più negozi corrispondono a HAVI»).
 */
export type SceltaAzione = {
  /** Il valore da rimettere nel campo (per l'app: il nome ESATTO). */
  valore: string
  /** Come si legge nel bottone: «HAVI Milano — Brera». */
  etichetta: string
}

export type EsitoAzione = {
  ok: boolean
  messaggio: string
  link?: string
  /** Quale campo dei dati va corretto con la scelta (es. `negozio`). */
  campoScelta?: string
  scelte?: SceltaAzione[]
}

/** Contesto passato a un'azione: chi la esegue (header/log), la sua chiave, i
 *  domini delle NOSTRE caselle (per non registrare noi stessi come azienda) e
 *  l'indirizzo della controparte, già risolto dal codice. */
export type ContestoAzione = {
  utenteEmail?: string
  chiave: string
  nostriDomini?: string[]
  controparte?: string | null
  /** Il mittente della mail da cui si prepara l'azione, grezzo («Nome
   *  <a@b.it>»). ⚠️ Serve a distinguere una mail ARRIVATA da una NOSTRA:
   *  «chi manda il prezzo lo dice l'indirizzo» vale solo se la mail è
   *  arrivata — su una che abbiamo scritto noi, quell'indirizzo siamo noi. */
  mittente?: string
  /** L'id INTERNO di questo messaggio, quello che apre `/messaggio/<id>`.
   *  Serve alle azioni che scrivono un dato in un'altra app e vogliono
   *  lasciarci il rimando alla mail da cui viene: un numero che compare in
   *  un'app senza dire da dove arriva è un numero di cui non ci si fida. */
  messaggioId?: string
}

/**
 * I NEGOZI di cui l'app Fornitori sa gli ordini.
 * ⚠️ Copia di servizio: il padrone è `BRANDS` in
 * `deluxy-search-supplier/api/order.js` più i negozi in cassaforte
 * (`config:v1.stores`). Serve a due cose: dire al modello fra quali valori
 * scegliere (enum nello schema) e SCARTARE nel codice quello che si inventa —
 * un negozio inesistente produce solo un «ordine non trovato» che non spiega
 * niente. Aggiungendo un negozio là, aggiungerlo anche qui.
 *
 * ⚠️⚠️ Il 26/08/2026 il quarto: `business.deluxy.it` (il negozio B2B). Finché
 * la lista ne aveva tre, una notifica di quel negozio veniva comunque
 * classificata come **uno dei tre** — al modello si chiedeva di scegliere fra
 * valori in cui la risposta giusta non c'era, e un enum non risponde «non è
 * nessuno di questi»: risponde il più somigliante.
 */
export const NEGOZI_FORNITORI = [
  'deluxy.it',
  'deluxyflowers.com',
  'cakedesign.me',
  'business.deluxy.it',
] as const

/** Il dominio di un indirizzo, minuscolo ('Mario <m@Chanel.com>' → 'chanel.com'). */
export function dominioDi(indirizzo: string | null | undefined): string {
  const m = String(indirizzo ?? '').match(/@([^\s>,;]+)/)
  return m ? m[1].toLowerCase().replace(/[.>,;]+$/, '') : ''
}

// ---------- I cataloghi di Anagrafiche (copia di servizio) ----------
//
// ⚠️ Il padrone di queste liste NON è qui: gli stati stanno in
// `deluxy-anagrafiche/src/lib/stati.ts`, le linee di interesse hanno come
// master Deluxy Scout. Qui servono per due cose sole: dire al modello fra
// quali valori scegliere, e SCARTARE nel codice quello che si inventa. Un
// valore fuori catalogo non si manda: Anagrafiche rifiuterebbe l'intera
// richiesta con «Stato non valido» (gli interessi invece li accetta tutti, e
// creeremmo linee fantasma).

export const STATI_COMMERCIALI = [
  'prospect',
  'in_contatto',
  'in_attesa',
  'in_trattativa',
  'da_ricontattare',
  'attivo',
  'non_interessato',
  'dismesso',
] as const

const ETICHETTE_STATO: Record<string, string> = {
  prospect: 'Prospect',
  in_contatto: 'In contatto',
  in_attesa: 'In attesa',
  in_trattativa: 'In trattativa',
  da_ricontattare: 'Da ricontattare',
  attivo: 'Attivo',
  non_interessato: 'Non interessato',
  dismesso: 'Dismesso',
}

export const INTERESSI_LINEE = [
  'Affiliazioni',
  'Clientelling',
  'Concierge',
  'Consegne',
  'Eventi & Catering',
  'Food Supplier',
  'Gifting',
  'Magazzino',
  'Re-seller',
] as const

const semplifica = (v: string) =>
  v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'e')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Lo stato commerciale in forma canonica ('In trattativa' → 'in_trattativa'),
 *  o null se non è uno degli otto: meglio non dirlo che dirlo sbagliato. */
export function statoCanonico(v: unknown): string | null {
  const s = semplifica(String(v ?? ''))
  if (!s) return null
  for (const stato of STATI_COMMERCIALI) {
    if (semplifica(stato) === s || semplifica(ETICHETTE_STATO[stato]) === s) return stato
  }
  return null
}

/** Le linee di interesse riconosciute, ripulite e senza doppioni. Quello che
 *  non è in catalogo si butta: una linea inventata sporcherebbe il registro. */
export function interessiCanonici(v: unknown): string[] {
  const grezzi = Array.isArray(v)
    ? v.map(String)
    : String(v ?? '')
        .split(/[,;\n]/)
        .map((x) => x.trim())
  const fuori: string[] = []
  for (const g of grezzi) {
    if (!g) continue
    const trovato = INTERESSI_LINEE.find((i) => semplifica(i) === semplifica(g))
    if (trovato) fuori.push(trovato)
  }
  return [...new Set(fuori)]
}

/**
 * Stato e interessi ricondotti ai valori di catalogo — vale sia per quello che
 * scrive il modello sia per quello che scrive l'utente nel modulo (dove sono
 * campi di testo, e «In trattativa» o «gifting, eventi» sono scritture
 * legittime). Quello che non si riconosce si toglie: uno stato inventato fa
 * rifiutare l'intera richiesta da Anagrafiche.
 */
function normalizzaCurati(d: Record<string, unknown>): Record<string, unknown> {
  const out = { ...d }
  if ('stato' in out) out.stato = statoCanonico(out.stato)
  if ('interessi' in out) {
    const linee = interessiCanonici(out.interessi)
    out.interessi = linee.length ? linee : null
  }
  return out
}

/** L'etichetta di un dominio: 'mail.deluxy.it' → 'deluxy' (via il penultimo
 *  pezzo, così i domini di secondo livello tipo '.co.uk' non ingannano). */
export function etichettaDominio(dominio: string): string {
  const p = dominio.split('.').filter(Boolean)
  if (p.length < 2) return dominio
  const penultimo = p[p.length - 2]
  // 'azienda.co.uk' → 'azienda' e non 'co'
  if (['co', 'com', 'net', 'org', 'gov', 'edu'].includes(penultimo) && p.length >= 3)
    return p[p.length - 3]
  return penultimo
}

/** Il nome commerciale ricavato dal dominio: 'zimmermann.com' → 'Zimmermann'.
 *  È un fatto (sta nell'indirizzo), non un'invenzione: si usa solo quando il
 *  nome manca o è il nostro. */
export function nomeDaDominio(dominio: string): string {
  const e = etichettaDominio(dominio)
  if (!e) return ''
  return e
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

/** Un campo della TABELLA con cui l'utente controlla i dati prima dell'invio.
 *
 *  ⚠️ `campi` decide solo **come si mostra** una chiave (etichetta, tipo del
 *  campo, elenco dei valori ammessi): NON decide quali chiavi si vedono. La
 *  tabella mostra sempre tutto quello che c'è nel JSON, anche le chiavi non
 *  dichiarate — una tabella che nasconde un dato lo farebbe partire senza che
 *  nessuno l'abbia guardato. */
export type CampoAzione = {
  /** La chiave dentro il JSON dei dati. */
  nome: string
  etichetta: string
  /** `numero` resta un campo di TESTO (in italiano un importo si scrive
   *  «1.250,50»): la conversione si fa in un punto solo, al confine, con
   *  `numeroDaTesto` dentro `esegui`. Qui cambia solo la tastiera e
   *  l'allineamento. */
  tipo?: 'testo' | 'email' | 'telefono' | 'lungo' | 'numero' | 'data' | 'scelta' | 'elenco'
  aiuto?: string
  obbligatorio?: boolean
  /** Solo per `tipo: 'scelta'`: i valori ammessi, in un menù a tendina. */
  opzioni?: { valore: string; etichetta: string }[]
}

/**
 * Un importo scritto da una persona → numero.
 *
 * ⚠️ I campi della tabella sono di testo, e in italiano un prezzo si scrive
 * «1.250,50 €»: `Number()` su quella stringa dà `NaN`. La conversione sta qui,
 * in un posto solo, e si fa **al confine** (dentro `esegui`), non mentre si
 * digita — o «1.2», scritto a metà di «1.250», diventerebbe 12 sotto le dita.
 *
 * ⚠️⚠️ Il caso che questa funzione chiude non è un errore visibile ma un
 * **silenzio**: `commerciale.trattativa` faceva `typeof x === 'number'` e, sul
 * valore battuto a mano (che è una stringa), lo lasciava semplicemente cadere.
 * La trattativa si apriva senza importo e nessuno lo veniva a sapere.
 */
export function numeroDaTesto(
  grezzo: unknown
): { ok: true; valore: number | null } | { ok: false; testo: string } {
  if (typeof grezzo === 'number' && Number.isFinite(grezzo)) return { ok: true, valore: grezzo }
  if (typeof grezzo !== 'string' || !grezzo.trim()) return { ok: true, valore: null }
  const n = Number(grezzo.replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(n)) return { ok: false, testo: grezzo }
  return { ok: true, valore: n }
}

export type AzioneApp = {
  id: string
  app: string // nome dell'app di destinazione (come nel portale)
  nome: string // cosa fa, in due parole
  descrizione: string
  colore: string // colore del badge (classi del design system)
  /** JSON Schema strict dei dati che l'AI estrae dalla mail. */
  schema: Record<string, unknown>
  /** I campi del form di conferma. Assente = si mostra il JSON. */
  campi?: CampoAzione[]
  /** true se l'azione permette di agganciare i dati a un'azienda già presente
   *  in Anagrafiche (il dialogo mostra la ricerca dell'azienda). */
  cercaAzienda?: boolean
  /**
   * ⚠️ true se l'azione SCRIVE in un'app aziendale (crea anagrafiche,
   * proforma, trattative…). Queste NON si eseguono mai in automatico su dati
   * che l'AI ha estratto dal corpo di una mail (dato non fidato: una mail
   * confezionata potrebbe pilotare i campi): anche con la sezione in modo
   * «automatico», si chiede sempre conferma mostrando i dati. Le azioni di sola
   * lettura (verifica/trova) restano automatiche. (Revisione 14/08/2026.)
   */
  scrive?: boolean
  /**
   * QUANDO il riassunto di una conversazione deve proporre questa azione
   * (es. «un fornitore ha comunicato un prezzo» → Registra il preventivo).
   * Assente = il riassunto non la propone mai. La regola sta QUI, accanto
   * all'azione, non nel prompt del riassunto: una casa sola.
   */
  dalRiassunto?: string
  /**
   * L'azione da PROPORRE dopo che questa è riuscita (es. aperta la trattativa,
   * «registra anche il contatto in Anagrafiche»). È un invito, non un
   * automatismo: apre lo stesso dialogo, con la sua conferma.
   */
  dopo?: { azioneId: string; invito: string }
  /** Guida per l'AI su come compilare i dati. */
  guida: string
  /**
   * Correzione dei dati PRIMA della verifica: quello che il codice sa con
   * certezza vince su quello che ha scritto il modello (es. l'indirizzo della
   * controparte, che è calcolato, non dedotto).
   */
  normalizza?: (dati: Record<string, unknown>, ctx: ContestoAzione) => Record<string, unknown>
  /**
   * Correzione fatta SUBITO DOPO l'estrazione, leggendo la mail.
   *
   * ⚠️ Sta qui e non in `normalizza` perché `normalizza` gira **all'invio**,
   * quando nei dati c'è anche ciò che l'utente ha corretto a mano nel dialogo:
   * lì una correzione automatica cancellerebbe la sua. Questa invece agisce
   * prima che il dialogo si apra, quindi l'utente vede — e può cambiare — il
   * valore già corretto.
   */
  daMail?: (
    dati: Record<string, unknown>,
    mail: { mittente: string; destinatari?: string; oggetto: string; corpoTesto: string }
  ) => Record<string, unknown>
  /**
   * Controllo PRIMA di partire: torna il motivo per cui NON si deve mandare,
   * oppure null se si può. Esiste perché certe cose non si possono affidare al
   * prompt: «non creare anagrafiche del nostro dominio» dev'essere vera sempre,
   * e un'azione automatica non ha nessuno che la guardi.
   */
  verifica?: (dati: Record<string, unknown>, ctx: ContestoAzione) => string | null
  esegui: (dati: Record<string, unknown>, ctx: ContestoAzione) => Promise<EsitoAzione>
}

/** La chiave che serve a un'azione, o stringa vuota se l'app non ne mappa una. */
export function chiaveDiAzione(azione: AzioneApp, chiavi: ChiaviApp): string {
  const nome = CHIAVE_DI_APP[azione.app]
  return nome ? chiavi[nome] : ''
}

// ---------- Helpers HTTP ----------

async function chiama(
  url: string,
  init: RequestInit,
  leggiEsito: (status: number, body: unknown) => EsitoAzione
): Promise<EsitoAzione> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) })
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      /* risposta senza JSON */
    }
    return leggiEsito(res.status, body)
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    if (/abort|timeout/i.test(m)) return { ok: false, messaggio: 'L’app non risponde (timeout).' }
    return { ok: false, messaggio: `Chiamata non riuscita: ${m.slice(0, 100)}` }
  }
}

const testoErrore = (body: unknown, fallback: string) => {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    const m = b.errore ?? b.error ?? b.message ?? b.messaggio
    if (typeof m === 'string' && m) return m.slice(0, 160)
  }
  return fallback
}

// ---------- Le azioni ----------

const AZIONI: AzioneApp[] = [
  {
    id: 'anagrafiche.partner',
    app: 'Anagrafiche',
    nome: 'Registra contatto',
    dalRiassunto:
      'nella conversazione compare un’azienda NUOVA con cui si sta iniziando a lavorare, con dati anagrafici (nome, recapiti) da registrare',
    scrive: true,
    descrizione: 'Crea o aggiorna il partner/prospect nel registro centralizzato.',
    colore: 'blue',
    guida:
      'Estrai i dati anagrafici dell’AZIENDA CONTROPARTE: quella con cui parliamo, MAI Deluxy. Se ti è data la CONTROPARTE, l’azienda è la sua — non quella del mittente, che su una mail partita da noi siamo noi. nome = ragione sociale o nome commerciale (in mancanza, il nome dal dominio della controparte). email = l’indirizzo della controparte. Compila anche STATO commerciale e INTERESSI leggendo cosa dice la mail, scegliendo SOLO fra i valori ammessi e SOLO quando la mail lo dice davvero: sugli interessi, se non nomina una linea, null. Se un dato non è nella mail, null: MAI inventare.',
    // Il form di conferma (al posto del JSON grezzo) e la ricerca dell'azienda
    // già presente in Anagrafiche a cui agganciare il contatto.
    cercaAzienda: true,
    campi: [
      { nome: 'nome', etichetta: 'Azienda', obbligatorio: true },
      { nome: 'categoria', etichetta: 'Categoria', aiuto: 'Es. hotel, ristorante, fioraio' },
      { nome: 'pIva', etichetta: 'Partita IVA' },
      { nome: 'email', etichetta: 'Email', tipo: 'email' },
      { nome: 'telefono', etichetta: 'Telefono', tipo: 'telefono' },
      { nome: 'indirizzo', etichetta: 'Indirizzo' },
      { nome: 'citta', etichetta: 'Città' },
      { nome: 'provincia', etichetta: 'Provincia', aiuto: 'Sigla, es. MI' },
      { nome: 'referenteNome', etichetta: 'Referente' },
      { nome: 'referenteRuolo', etichetta: 'Ruolo del referente' },
      {
        // ⚠️ Valori CHIUSI anche a schermo: Anagrafiche rifiuta l'intera
        // richiesta per uno stato fuori catalogo, e scriverlo a mano era il
        // modo più facile per sbagliarlo. A tendina non si può.
        nome: 'stato',
        etichetta: 'Stato commerciale',
        tipo: 'scelta',
        opzioni: STATI_COMMERCIALI.map((s) => ({ valore: s, etichetta: s.replace(/_/g, ' ') })),
      },
      {
        nome: 'interessi',
        etichetta: 'Interessi (linee)',
        tipo: 'elenco',
        aiuto: 'Gifting, Eventi & Catering, Consegne, Concierge, Clientelling, Affiliazioni, Food Supplier, Magazzino, Re-seller',
      },
      { nome: 'note', etichetta: 'Note', tipo: 'lungo' },
    ],
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['nome', 'categoria', 'citta', 'provincia', 'indirizzo', 'email', 'telefono', 'pIva', 'referenteNome', 'referenteRuolo', 'stato', 'interessi', 'note'],
      properties: {
        // Stato e interessi: valori CHIUSI. Uno stato fuori catalogo farebbe
        // rifiutare l'intera richiesta da Anagrafiche («Stato non valido»), e
        // una linea inventata sporcherebbe il registro — quindi enum qui, e
        // ricontrollo nel codice (`normalizza`).
        stato: {
          type: ['string', 'null'],
          enum: [...STATI_COMMERCIALI, null],
          description:
            'Stato commerciale dedotto dalla mail. Chiede prezzi/preventivo o sta trattando = in_trattativa; primo contatto o risposta interlocutoria = in_contatto; dice di no = non_interessato; chiede di risentirsi più avanti = da_ricontattare; è già cliente che ordina = attivo. Se la mail non dice abbastanza: null.',
        },
        interessi: {
          type: ['array', 'null'],
          items: { type: 'string', enum: [...INTERESSI_LINEE] },
          // ⚠️ Ogni linea con la sua definizione VERA (il catalogo è di Deluxy
          // Scout, `supabase/migrations/0003_seed.sql`). Senza, il modello
          // sceglieva quasi sempre «Gifting»: era l'unica con una spiegazione
          // accanto, e Deluxy consegna regali.
          description:
            "Le linee di business di cui parla la mail. Definizioni: " +
            '«Affiliazioni» = il partner entra nel network Deluxy (programma di affiliazione, quota di attivazione, «collaborazione», «circuito»); ' +
            '«Re-seller» = rivende Deluxy sul proprio canale; ' +
            '«Consegne» = consegne guanti bianchi, assicurate, multi-città; ' +
            '«Eventi & Catering» = catering per eventi e allestimenti; ' +
            '«Gifting» = REGALI AZIENDALI (gifting stagionale, macarons B2B, kit per ricorrenze) — non ogni mail che nomina un regalo; ' +
            '«Food Supplier» = fornitura B2B di torte e pasticceria; ' +
            '«Clientelling», «Concierge», «Magazzino» = linee ferme, solo cross-sell dichiarato. ' +
            'Scegli SOLO le linee che la mail dice chiaramente, al massimo due. Se la mail non le nomina, null: null è la risposta giusta più spesso di quanto sembri.',
        },
        nome: { type: 'string', description: 'Nome dell’azienda/attività.' },
        categoria: { type: ['string', 'null'], description: 'Es. hotel, ristorante, fioraio, pasticceria.' },
        citta: { type: ['string', 'null'] },
        provincia: { type: ['string', 'null'], description: 'Sigla, es. MI.' },
        indirizzo: { type: ['string', 'null'] },
        email: { type: ['string', 'null'], description: 'Email di contatto (di norma il mittente).' },
        telefono: { type: ['string', 'null'] },
        pIva: { type: ['string', 'null'] },
        referenteNome: { type: ['string', 'null'], description: 'Nome della persona che scrive.' },
        referenteRuolo: { type: ['string', 'null'] },
        note: { type: ['string', 'null'], description: 'Cosa chiede / contesto utile, in una frase.' },
      },
    },
    // ⚠️ Caso reale del 29 luglio: mail di presentazione di Martina (@deluxy.it)
    // a un contatto @zimmermann.com. Il modello ha estratto «Deluxy» con
    // l'indirizzo di Martina e ha aggiornato la nostra stessa scheda: la
    // controparte non era nel prompt, e la guida diceva «di norma il mittente».
    // Ora l'indirizzo della controparte è CALCOLATO, e qui vince su quello che
    // ha scritto il modello: quel che si sa non lo si fa dedurre.
    normalizza(dati, ctx) {
      const controparte = ctx.controparte ?? null
      const nostri = (ctx.nostriDomini ?? []).filter(Boolean)
      const d = { ...dati }
      // Senza controparte non c'è niente da correggere sull'identità, ma stato
      // e interessi vanno ripuliti lo stesso (li può aver scritti l'utente).
      if (!controparte) return normalizzaCurati(d)

      const emailScritta = typeof d.email === 'string' ? d.email.trim() : ''
      const dominioScritto = dominioDi(emailScritta)
      // Nessuna email, o l'email siamo noi → si mette quella della controparte.
      if (!emailScritta || nostri.includes(dominioScritto)) d.email = controparte

      // Stesso discorso per il NOME: se manca, o se è il nome di una nostra
      // azienda (dedotto dal dominio: «deluxy.it» → «Deluxy»), si ricava dal
      // dominio della controparte — che è un fatto, non un'invenzione.
      const nomeScritto = String(d.nome ?? '').trim()
      const nostreEtichette = nostri.map(etichettaDominio)
      if (!nomeScritto || nostreEtichette.includes(nomeScritto.toLowerCase())) {
        d.nome = nomeDaDominio(dominioDi(controparte)) || nomeScritto
      }
      return normalizzaCurati(d)
    },
    // ⚠️ Il registro delle aziende non deve riempirsi di NOI. L'istruzione
    // «i contatti del nostro dominio non vanno creati» scritta nel prompt non
    // basta: qui si crea una scheda vera, e in automatico non c'è nessuno che
    // controlli. Quindi è una regola di codice.
    verifica(dati, ctx) {
      const nostri = (ctx.nostriDomini ?? []).filter(Boolean)
      const dominio = dominioDi(typeof dati.email === 'string' ? dati.email : '')
      if (dominio && nostri.includes(dominio)) {
        return `Non registro «${String(dati.nome ?? '')}»: l’indirizzo ${dati.email} è del nostro dominio (${dominio}), non di un’azienda esterna.`
      }
      if (!String(dati.nome ?? '').trim()) return 'Non registro: dalla mail non è uscito il nome dell’azienda.'
      return null
    },
    async esegui(dati, ctx) {
      const referente =
        typeof dati.referenteNome === 'string' && dati.referenteNome
          ? [{ nome: dati.referenteNome, ruolo: (dati.referenteRuolo as string) || '', telefono: '', email: (dati.email as string) || '' }]
          : undefined

      // AGGANCIO a un'azienda già in Anagrafiche (scelta dall'utente nel form):
      // non si crea un doppione, si aggiorna QUELLA scheda (PATCH). `partnerId`
      // non sta nello schema dell'AI: lo aggiunge solo l'utente dal dialogo.
      const partnerId = typeof dati.partnerId === 'string' ? dati.partnerId.trim() : ''
      if (partnerId) {
        const patch: Record<string, unknown> = {
          stato: statoCanonico(dati.stato) ?? undefined,
          interessi: interessiCanonici(dati.interessi).length
            ? interessiCanonici(dati.interessi)
            : undefined,
          contatti: referente ?? (dati.email ? [{ nome: '', ruolo: '', telefono: '', email: dati.email }] : undefined),
          // Sui dati dell'azienda si manda solo ciò che è valorizzato: il
          // registro fa merge per campo e non deve ricevere null a raffica.
          categoria: dati.categoria || undefined,
          citta: dati.citta || undefined,
          provincia: dati.provincia || undefined,
          indirizzo: dati.indirizzo || undefined,
          telefono: dati.telefono || undefined,
          pIva: dati.pIva || undefined,
          note: dati.note || undefined,
        }
        return chiama(
          `${ANAGRAFICHE_URL}/api/v1/partners/${encodeURIComponent(partnerId)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'x-api-key': ctx.chiave },
            body: JSON.stringify(patch),
          },
          (status, risposta) => {
            if (status >= 200 && status < 300) {
              const p = (risposta ?? {}) as { nome?: string }
              const chi = p.nome || String(dati.partnerNome ?? dati.nome ?? 'azienda scelta')
              return {
                ok: true,
                messaggio: `Contatto ${dati.email ? `«${dati.email}» ` : ''}agganciato a «${chi}», scheda già presente in Anagrafiche.`,
                link: `${ANAGRAFICHE_URL}/partner/${partnerId}`,
              }
            }
            if (status === 401 || status === 403)
              return { ok: false, messaggio: 'Chiave Anagrafiche non valida o di sola lettura (serve la chiave di scrittura).' }
            if (status === 404) return { ok: false, messaggio: 'L’azienda scelta non esiste più in Anagrafiche.' }
            return { ok: false, messaggio: testoErrore(risposta, `Anagrafiche ha risposto ${status}.`) }
          }
        )
      }

      // Stato commerciale e linee di interesse: si mandano sempre (già
      // ricondotti al catalogo). ⚠️ Anagrafiche li tiene «curati dal team» e li
      // scarta se la chiave non è di prima parte (`scritturaPartner`): sotto si
      // controlla cosa è stato davvero applicato e lo si dice.
      const stato = statoCanonico(dati.stato)
      const interessi = interessiCanonici(dati.interessi)

      const body: Record<string, unknown> = {
        nome: dati.nome,
        stato: stato ?? undefined,
        interessi: interessi.length ? interessi : undefined,
        categoria: dati.categoria || undefined,
        citta: dati.citta || undefined,
        provincia: dati.provincia || undefined,
        indirizzo: dati.indirizzo || undefined,
        email: dati.email || undefined,
        telefono: dati.telefono || undefined,
        pIva: dati.pIva || undefined,
        note: dati.note || undefined,
        contatti: referente,
        fonte: 'ai-mail',
        sistema: 'deluxy-mail',
        idEsterno: (dati.email as string) || undefined,
      }
      return chiama(
        `${ANAGRAFICHE_URL}/api/v1/partners`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': ctx.chiave },
          body: JSON.stringify(body),
        },
        (status, risposta) => {
          // Il registro risponde con la scheda: si dice QUALE, e ci si va
          // direttamente. «Contatto registrato» senza dire chi non permette di
          // controllare niente — men che meno quando parte da sola.
          const p = (risposta ?? {}) as {
            id?: string
            nome?: string
            esito?: string
            applicati?: string[]
            stato?: string
            interessi?: string[]
          }
          const chi = [p.nome, dati.email].filter(Boolean).join(' · ') || String(dati.nome ?? '')
          const link = p.id ? `${ANAGRAFICHE_URL}/partner/${p.id}` : ANAGRAFICHE_URL
          // Abbiamo chiesto stato/interessi e il registro non li ha presi? Lo
          // si DICE: sono i due campi che Anagrafiche tiene curati dal team, e
          // silenziosamente sembrerebbe che AI Mail non li mandi.
          const scartati: string[] = []
          if (stato && p.stato && p.stato !== stato) scartati.push(`stato «${stato}» (è rimasto «${p.stato}»)`)
          if (interessi.length && Array.isArray(p.interessi)) {
            const mancanti = interessi.filter((i) => !p.interessi!.includes(i))
            if (mancanti.length) scartati.push(`interessi ${mancanti.join(', ')}`)
          }
          const nota = scartati.length
            ? ` ⚠️ Anagrafiche non ha applicato: ${scartati.join(' · ')} — sono campi curati dal team, servirebbe una chiave di prima parte.`
            : ''
          if (status === 201)
            return { ok: true, messaggio: `Creata la scheda «${chi}» in Anagrafiche.${nota}`, link }
          if (status === 200) {
            const campi = p.applicati?.length ? ` Aggiornati: ${p.applicati.join(', ')}.` : ''
            return {
              ok: true,
              messaggio: `«${chi}» era già in Anagrafiche (${p.esito ?? 'aggancio'}): scheda aggiornata.${campi}${nota}`,
              link,
            }
          }
          if (status === 401 || status === 403)
            return { ok: false, messaggio: 'Chiave Anagrafiche non valida o di sola lettura (serve la chiave di scrittura).' }
          return { ok: false, messaggio: testoErrore(risposta, `Anagrafiche ha risposto ${status}.`) }
        }
      )
    },
  },
  {
    id: 'finance.proforma',
    app: 'Finance',
    nome: 'Crea proforma',
    scrive: true,
    dalRiassunto:
      'i servizi e gli importi sono stati CONCORDATI con un partner e si può passare a fatturare (non quando i prezzi sono ancora in discussione)',
    descrizione: 'Prepara una proforma per il partner in Deluxy Finance.',
    colore: 'gold',
    guida:
      'La mail riguarda servizi/importi da fatturare a un partner. partner = nome dell’azienda. Ogni riga: descrizione del servizio, quantità (1 se non detta), prezzo unitario SOLO se scritto nella mail (altrimenti null: lo completa l’utente).',
    // ⚠️ `righe` non è qui di proposito: è un elenco di oggetti, e la tabella
    // lo mostra da sé in sola lettura (leggibile, ma si corregge dal JSON).
    // Dichiararlo come campo di testo lo appiattirebbe in una stringa.
    campi: [
      { nome: 'partner', etichetta: 'Partner', obbligatorio: true },
      { nome: 'oggetto', etichetta: 'Oggetto' },
      { nome: 'note', etichetta: 'Note', tipo: 'lungo' },
    ],
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['partner', 'oggetto', 'righe', 'note'],
      properties: {
        partner: { type: 'string', description: 'Nome del partner a cui intestare la proforma.' },
        oggetto: { type: ['string', 'null'] },
        note: { type: ['string', 'null'] },
        righe: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['descrizione', 'quantita', 'prezzoUnitario'],
            properties: {
              descrizione: { type: 'string' },
              quantita: { type: 'number' },
              prezzoUnitario: { type: ['number', 'null'], description: 'Solo se scritto nella mail.' },
            },
          },
        },
      },
    },
    async esegui(dati, ctx) {
      const righe = Array.isArray(dati.righe) ? (dati.righe as Record<string, unknown>[]) : []
      if (righe.some((r) => r.prezzoUnitario == null))
        return { ok: false, messaggio: 'Manca il prezzo di una riga: completalo prima di inviare.' }
      return chiama(
        `${FINANCE_URL}/api/proforma`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': ctx.chiave, 'X-App': 'deluxy-mail' },
          body: JSON.stringify({
            partner: dati.partner,
            oggetto: dati.oggetto || undefined,
            note: dati.note || undefined,
            righe: righe.map((r) => ({
              descrizione: r.descrizione,
              quantita: typeof r.quantita === 'number' ? r.quantita : 1,
              prezzoUnitario: r.prezzoUnitario,
            })),
          }),
        },
        (status, risposta) => {
          if (status >= 200 && status < 300) {
            const r = (risposta ?? {}) as Record<string, unknown>
            const numero = r.numero ?? (r.proforma as Record<string, unknown> | undefined)?.numero
            return {
              ok: true,
              messaggio: numero ? `Proforma ${numero} creata in Finance.` : 'Proforma creata in Finance.',
              link: FINANCE_URL,
            }
          }
          if (status === 401 || status === 403) return { ok: false, messaggio: 'Chiave Finance non valida.' }
          return { ok: false, messaggio: testoErrore(risposta, `Finance ha risposto ${status}.`) }
        }
      )
    },
  },
  {
    id: 'finance.verifica',
    app: 'Finance',
    nome: 'Verifica partner',
    descrizione: 'Controlla la situazione finanziaria del partner (saldi, fatture).',
    colore: 'green',
    guida: 'Individua il nome dell’azienda partner di cui la mail parla (di norma chi scrive).',
    campi: [{ nome: 'partner', etichetta: 'Partner da verificare', obbligatorio: true }],
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['partner'],
      properties: {
        partner: { type: 'string', description: 'Nome del partner da verificare.' },
      },
    },
    async esegui(dati, ctx) {
      return chiama(
        `${FINANCE_URL}/api/verifiche?partner=${encodeURIComponent(String(dati.partner ?? ''))}`,
        { headers: { 'X-API-Key': ctx.chiave, 'X-App': 'deluxy-mail' } },
        (status, risposta) => {
          if (status >= 200 && status < 300 && risposta && typeof risposta === 'object') {
            // La risposta è un quadro sintetico: la mostriamo com'è, riga per riga.
            const righe = Object.entries(risposta as Record<string, unknown>)
              .filter(([, v]) => v !== null && typeof v !== 'object')
              .map(([k, v]) => `${k}: ${v}`)
              .slice(0, 12)
            return {
              ok: true,
              messaggio: righe.length ? righe.join(' · ') : 'Nessun dato per questo partner.',
              link: FINANCE_URL,
            }
          }
          if (status === 401 || status === 403) return { ok: false, messaggio: 'Chiave Finance non valida.' }
          if (status === 404) return { ok: false, messaggio: 'Partner non trovato in Finance.' }
          return { ok: false, messaggio: testoErrore(risposta, `Finance ha risposto ${status}.`) }
        }
      )
    },
  },
  {
    id: 'fornitori.trova',
    app: 'Fornitori',
    nome: 'Trova fornitore',
    descrizione: 'Trova i fioristi/pasticcerie più vicini alla consegna di un ordine.',
    colore: 'purple',
    guida:
      'La mail è una notifica d’ordine di un negozio Shopify. brand = QUALE NEGOZIO ha fatto l’ordine, e va scelto fra i valori ammessi: "deluxy.it", "deluxyflowers.com", "cakedesign.me", "business.deluxy.it" (il negozio B2B: le sue notifiche arrivano da business.deluxy.it). Si riconosce dall’indirizzo del NEGOZIO che ha mandato la notifica (es. "Deluxy Flowers <info@deluxyflowers.com>" → deluxyflowers.com), non dai link nel piè di pagina, che possono puntare a un altro sito. number = il numero d’ordine (solo le cifre, senza "#" o "Ordine"). Se uno dei due manca, lascialo vuoto: senza non si può cercare.',
    campi: [
      // ⚠️ A tendina, non testo libero: è la stessa ragione dell'enum nello
      // schema. Un negozio scritto a mano («deluxy.it» per un ordine di Deluxy
      // Flowers) fa rispondere «ordine non trovato» senza dire perché.
      {
        nome: 'brand',
        etichetta: 'Negozio',
        tipo: 'scelta',
        obbligatorio: true,
        opzioni: NEGOZI_FORNITORI.map((n) => ({ valore: n, etichetta: n })),
      },
      { nome: 'number', etichetta: 'Numero d’ordine', obbligatorio: true, aiuto: 'Solo le cifre, senza #' },
    ],
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['brand', 'number'],
      properties: {
        // ⚠️ ENUM, non testo libero: il modello non deve poter inventare un
        // negozio. Il 17/08/2026 aveva scritto «deluxy.it» per un ordine di
        // Deluxy Flowers e l'unica risposta possibile era «Ordine non trovato»,
        // senza dire perché. I tre valori sono quelli di `BRANDS` in
        // `deluxy-search-supplier/api/order.js`: se là si aggiunge un negozio,
        // va aggiunto anche qui.
        brand: { type: 'string', enum: [...NEGOZI_FORNITORI], description: 'Il negozio dell’ordine.' },
        number: { type: 'string', description: 'Numero dell’ordine, solo cifre.' },
      },
    },
    /**
     * IL NEGOZIO LO DECIDE LA MAIL, non il modello.
     *
     * ⚠️ Misurato il 17/08/2026 su un caso vero: la mail dell'ordine 2725
     * nomina **solo** `deluxyflowers.com` (mai `deluxy.it`), eppure la proposta
     * arrivata a schermo diceva `deluxy.it` — e Fornitori rispondeva «ordine non
     * trovato», perché i numeri d'ordine sono per negozio. Riprodotto il prompt
     * di produzione con 4 chiamate vere: il modello risponde `deluxyflowers.com`
     * 4 volte su 4, quindi il valore sbagliato **non** si spiega col modello e
     * non si può correggere nel prompt: quando la mail nomina UN SOLO negozio
     * dei tre, quello è il negozio, e lo si scrive nel codice.
     * ⚠️ Se la mail ne nomina zero o più di uno non si tocca niente: si
     * lascia la scelta del modello e, se sbaglia, l'errore ora dice cosa ha
     * provato e come correggerlo a mano.
     */
    daMail(dati, mail) {
      const testo = `${mail.mittente} ${mail.destinatari ?? ''} ${mail.oggetto} ${mail.corpoTesto}`.toLowerCase()
      // Il confronto è sul dominio INTERO: `deluxy.it` non deve «combaciare»
      // dentro `deluxyflowers.com` (è la stessa trappola del `includes` che il
      // 5/08 faceva passare per Shopify il dominio `shopifymail.it`).
      const citati = NEGOZI_FORNITORI.filter((n) =>
        new RegExp(`(^|[^a-z0-9.-])${n.replace(/\./g, '\\.')}([^a-z0-9.-]|$)`).test(testo)
      )
      if (citati.length !== 1 || dati.brand === citati[0]) return dati
      return { ...dati, brand: citati[0] }
    },
    // Il modello può sbagliare NEGOZIO fra i quattro: normalizzare almeno la forma
    // (maiuscole, https://, www., barra finale) evita di cercare «Deluxy.it/».
    normalizza(dati) {
      const grezzo = String(dati.brand ?? '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, '')
      return { ...dati, brand: grezzo }
    },
    async esegui(dati, ctx) {
      const brand = String(dati.brand ?? '').trim()
      const number = String(dati.number ?? '').replace(/[^\d]/g, '')
      if (!brand || !number) return { ok: false, messaggio: 'Servono il negozio e il numero d’ordine.' }
      if (!NEGOZI_FORNITORI.includes(brand as (typeof NEGOZI_FORNITORI)[number])) {
        return {
          ok: false,
          messaggio: `«${brand}» non è uno dei negozi di Fornitori. Sono: ${NEGOZI_FORNITORI.join(', ')}. Correggi il campo «brand» qui sopra e riprova.`,
        }
      }

      return chiama(
        `${FORNITORI_URL}/api/fornitori?brand=${encodeURIComponent(brand)}&number=${encodeURIComponent(number)}`,
        {
          headers: {
            'x-app-password': ctx.chiave,
            'x-app-user': ctx.utenteEmail || 'ai-mail',
          },
        },
        (status, risposta) => {
          if (status >= 200 && status < 300 && risposta && typeof risposta === 'object') {
            const r = risposta as {
              fornitori?: {
                nome?: string
                indirizzo?: string
                telefono?: string
                distanzaKm?: number
                minutiAuto?: number
                distanzaTipo?: string
                whatsapp?: string | null
                sito?: string | null
                apertoOra?: boolean | null
                valutazione?: number | null
              }[]
              consegna?: { indirizzo?: string }
              categoria?: string
            }
            const lista = r.fornitori ?? []
            if (lista.length === 0) {
              return { ok: true, messaggio: `Nessun ${r.categoria ?? 'fornitore'} trovato vicino alla consegna.`, link: FORNITORI_URL }
            }
            // Una riga per fornitore, con tutto quello che serve per chiamarlo.
            const righe = lista.map((f, i) => {
              const pezzi: string[] = [`${i + 1}. ${f.nome ?? '—'}`]
              if (f.distanzaKm != null) pezzi.push(`${f.distanzaKm} km${f.minutiAuto != null ? ` · ${f.minutiAuto} min` : ''}${f.distanzaTipo === "linea d'aria" ? " (in linea d'aria)" : ''}`)
              if (f.indirizzo) pezzi.push(f.indirizzo)
              if (f.telefono) pezzi.push(`Tel: ${f.telefono}`)
              if (f.whatsapp) pezzi.push(`WhatsApp: ${f.whatsapp}`)
              if (f.valutazione != null) pezzi.push(`★ ${f.valutazione}`)
              if (f.apertoOra === true) pezzi.push('aperto ora')
              return pezzi.join('\n   ')
            })
            const dove = r.consegna?.indirizzo ? `Consegna a ${r.consegna.indirizzo}\n\n` : ''
            return { ok: true, messaggio: `${dove}${righe.join('\n\n')}`, link: FORNITORI_URL }
          }
          if (status === 401 || status === 403)
            return {
              ok: false,
              messaggio:
                'Password Fornitori rifiutata. Deve essere la password AMMINISTRATORE dell’app Fornitori (search-deluxy) — non il tuo codice utente del sito. Reimpostala in Impostazioni App.',
            }
          if (status === 404) {
            // ⚠️ Un «non trovato» che non dice DOVE ha cercato non è
            // diagnosticabile: il caso normale è il negozio sbagliato fra i quattro
            // (i numeri d'ordine sono per negozio). Si dice il negozio, gli
            // altri possibili, e — se l'app li manda — gli ultimi ordini veri di
            // quel negozio, che smentiscono subito l'ipotesi.
            const r = (risposta ?? {}) as { recentOrderNames?: unknown }
            const recenti = Array.isArray(r.recentOrderNames) ? r.recentOrderNames.slice(0, 5).join(', ') : ''
            const altri = NEGOZI_FORNITORI.filter((n) => n !== brand).join(' o ')
            return {
              ok: false,
              messaggio:
                `Ordine ${number} non trovato su ${brand}.` +
                (recenti ? ` Gli ultimi ordini di quel negozio sono: ${recenti}.` : '') +
                ` Se l’ordine è di ${altri}, correggi «brand» qui sopra e riprova.`,
            }
          }
          if (status === 422) return { ok: false, messaggio: testoErrore(risposta, 'Ordine senza indirizzo o non geocodificabile.') }
          return { ok: false, messaggio: testoErrore(risposta, `Fornitori ha risposto ${status}.`) }
        }
      )
    },
  },
  {
    id: 'commerciale.trattativa',
    app: 'Commerciale',
    nome: 'Apri trattativa',
    scrive: true,
    // Chi ci chiede un preventivo di solito NON è ancora in Anagrafiche:
    // aperta la trattativa, si propone di registrarlo — stessa mail, stesso
    // dialogo, sua conferma.
    dopo: { azioneId: 'anagrafiche.partner', invito: 'Registra anche chi ce lo chiede in Anagrafiche' },
    dalRiassunto:
      'qualcuno CHIEDE un preventivo o un servizio a Deluxy, oppure è in corso con un negozio/attività una trattativa commerciale che non risulta già registrata in Commerciale — vale ANCHE se è già avanzata (preventivo mandato, condizioni discusse, date fissate): una trattativa avanti è più importante da registrare, non meno. Non vale quando siamo NOI a chiedere un prezzo a un fornitore.',
    descrizione: 'Apre una nuova trattativa nel CRM commerciale per il negozio.',
    colore: 'green',
    guida:
      'La mail riguarda un’opportunità commerciale con un NEGOZIO/attività. negozio = nome dell’attività (come per la proforma). linea = la linea commerciale (es. Affiliazioni, Consegne, Eventi) se citata, altrimenti null. valoreAtteso = il totale se è scritto (se ti è dato il RIASSUNTO della conversazione, le sue «Cifre e prezzi» sono importi copiati dalle mail: il «totale complessivo» che c’è lì è scritto a tutti gli effetti); se un totale non c’è ma nello scambio ci sono PREZZI e QUANTITÀ scritti, CALCOLA la stima (es. coffee break 18 €/persona × 45 persone = 810) usando SOLO numeri scritti — mai inventare i numeri di partenza; se non c’è niente da cui calcolare, null. oggetto = per cosa è la trattativa, in poche parole e senza la data (es. «Catering per la visita della proprietà»). dataEvento = il giorno del servizio/evento in formato AAAA-MM-GG, SOLO se la mail lo dice; se il giorno è scritto senza anno («3 settembre») prendi l’anno dalla data della mail; se non c’è una data, null — mai inventarla. fase = deducila dallo scambio scegliendo fra i valori ammessi: hanno appena chiesto = "primo contatto"; si discute di dettagli e condizioni = "in trattativa"; abbiamo GIÀ mandato il preventivo/proposta = "preventivo"; hanno accettato = "chiusa vinta"; hanno rifiutato = "chiusa persa"; se non è chiaro, null. scadenza = la data del follow-up (AAAA-MM-GG) SOLO se la mail la dice (un termine scritto: «ti risponderò entro venerdì», «serve conferma entro il 30»): se non è scritta lascia null, la propone il codice dalla data dell’evento. nextAction = la prossima azione da fare, in una frase. contattoEmail = l’email della PERSONA DI RIFERIMENTO del negozio, se è scritta da qualche parte nello scambio — anche dentro il testo di una mail interna («ho sentito la referente Roberta Sireno, roberta.sireno@havi.com»); MAI un indirizzo di un nostro dominio (quelli siamo noi), mai inventata; se non c’è, null e la mette il codice.',
    campi: [
      { nome: 'negozio', etichetta: 'Negozio', obbligatorio: true, aiuto: 'Commerciale lo cerca fra i suoi negozi.' },
      {
        nome: 'contattoEmail',
        etichetta: 'Contatto (email)',
        tipo: 'email',
        aiuto: 'Si aggancia al negozio in Scout (o si crea, se manca). Dopo l’invio si può registrare anche in Anagrafiche.',
      },
      { nome: 'linea', etichetta: 'Linea commerciale', aiuto: 'Es. Affiliazioni, Consegne, Eventi' },
      {
        nome: 'oggetto',
        etichetta: 'Oggetto',
        aiuto: 'Per cosa è la trattativa. In Scout diventa il titolo: senza, si ripiega sulla prossima azione.',
      },
      {
        // ⚠️ In Scout la tabella `deals` NON ha una colonna per la data del
        // servizio (ha `scadenza`, `riprendere_il`, `chiusa_il`): questa data
        // parte dentro l'OGGETTO, che è un campo vero e si vede nella
        // trattativa. Mostrarla qui e non mandarla da nessuna parte sarebbe un
        // valore che vive solo nel pop-up.
        nome: 'dataEvento',
        etichetta: 'Data dell’evento',
        tipo: 'data',
        aiuto: 'Il giorno del servizio, se la mail lo dice. Parte insieme all’oggetto: in Scout la trattativa non ha un campo suo per questa data.',
      },
      {
        nome: 'valoreAtteso',
        etichetta: 'Valore atteso (€)',
        tipo: 'numero',
        aiuto: 'Se non c’è un totale scritto, è la stima dai prezzi dello scambio: controllala.',
      },
      {
        // ⚠️ Gli STATI VERI di Scout, a tendina: sono gli alias che la Edge
        // `trattativa` traduce nell'enum `dealstage_t` (normalizzaFase). Un
        // testo libero qui arrivava comunque, ma finiva sempre nel default.
        nome: 'fase',
        etichetta: 'Fase',
        tipo: 'scelta',
        opzioni: [
          { valore: 'primo contatto', etichetta: 'Primo contatto' },
          { valore: 'in trattativa', etichetta: 'In trattativa' },
          { valore: 'preventivo', etichetta: 'Preventivo inviato' },
          { valore: 'chiusa vinta', etichetta: 'Chiusa vinta' },
          { valore: 'chiusa persa', etichetta: 'Chiusa persa' },
        ],
      },
      {
        nome: 'scadenza',
        etichetta: 'Follow-up',
        tipo: 'data',
        aiuto: 'Quando riprendere in mano la trattativa. Se la mail non lo dice, è proposto tre giorni prima dell’evento: controllalo.',
      },
      { nome: 'nextAction', etichetta: 'Prossima azione', tipo: 'lungo' },
    ],
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['negozio', 'contattoEmail', 'linea', 'oggetto', 'dataEvento', 'valoreAtteso', 'fase', 'scadenza', 'nextAction'],
      properties: {
        negozio: { type: 'string', description: 'Nome del negozio/attività della trattativa.' },
        contattoEmail: {
          type: ['string', 'null'],
          description: 'Email del referente del negozio se è scritta nello scambio; mai un nostro indirizzo. Altrimenti null: la mette il codice.',
        },
        linea: { type: ['string', 'null'], description: 'Linea commerciale (es. Affiliazioni).' },
        oggetto: { type: ['string', 'null'], description: 'Per cosa è la trattativa, in poche parole e senza la data.' },
        dataEvento: {
          type: ['string', 'null'],
          description: 'Giorno del servizio/evento AAAA-MM-GG, solo se scritto nello scambio (anno dalla data della mail se manca).',
        },
        valoreAtteso: {
          type: ['number', 'null'],
          description: 'Totale scritto, o stima calcolata SOLO da prezzi e quantità scritti nello scambio.',
        },
        fase: {
          type: ['string', 'null'],
          enum: ['primo contatto', 'in trattativa', 'preventivo', 'chiusa vinta', 'chiusa persa', null],
          description: 'La fase dedotta dallo scambio, fra i valori ammessi. null se non è chiara.',
        },
        scadenza: { type: ['string', 'null'], description: 'Data follow-up AAAA-MM-GG.' },
        nextAction: { type: ['string', 'null'], description: 'Prossima azione da fare.' },
      },
    },
    // L'email del contatto la sa il CODICE quando la controparte è certa — ma
    // non sempre lo è: l'azione nasce spesso da una mail INTERNA (la richiesta
    // girata da un collega), dove mittente e destinatari sono tutti nostri e
    // l'unico posto in cui l'indirizzo del cliente compare è il TESTO («ho
    // sentito la referente Roberta Sireno, roberta.sireno@havi.com»). Ordine:
    // (1) l'indirizzo letto nello scambio, se non è uno dei nostri; (2) la
    // controparte calcolata dal codice; (3) niente.
    // ⚠️ Il filtro sui nostri domini non è pignoleria: su una mail interna il
    // primo indirizzo che si incontra è quello di un COLLEGA, e registrarlo
    // come contatto del cliente sporcherebbe il CRM di Scout.
    normalizza(dati, ctx) {
      const scritta =
        typeof dati.contattoEmail === 'string' && dati.contattoEmail.includes('@')
          ? dati.contattoEmail.trim().toLowerCase()
          : null
      const nostra = scritta ? (ctx.nostriDomini ?? []).includes(scritta.split('@')[1] ?? '') : false
      const buona = (scritta && !nostra ? scritta : null) ?? ctx.controparte ?? null
      const d: Record<string, unknown> = dati.contattoEmail === buona ? { ...dati } : { ...dati, contattoEmail: buona }

      // Il FOLLOW-UP quando la mail non lo scrive: tre giorni prima
      // dell'evento. Non è un dato inventato ma **aritmetica su un fatto
      // scritto** (la data dell'evento), ed è la stessa concessione già fatta
      // al valore atteso: si può calcolare, purché i numeri di partenza siano
      // scritti e si veda che è una proposta (l'aiuto del campo lo dice).
      // ⚠️ Idempotente: interviene solo se la casella è vuota, quindi il
      // secondo giro (all'invio) non tocca quello che ha corretto l'utente.
      const ev =
        typeof d.dataEvento === 'string' && d.dataEvento.length === 10
          ? Date.parse(d.dataEvento + 'T00:00:00Z')
          : Number.NaN
      if (!d.scadenza && !Number.isNaN(ev)) {
        d.scadenza = new Date(ev - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      }
      return d
    },
    async esegui(dati, ctx) {
      const negozio = typeof dati.negozio === 'string' ? dati.negozio.trim() : ''
      if (!negozio) return { ok: false, messaggio: 'Manca il negozio della trattativa.' }
      // ⚠️ Il campo della tabella è testo («1.250,50»): prima qui c'era
      // `typeof === 'number'`, e un valore battuto a mano veniva lasciato
      // cadere **in silenzio** — la trattativa si apriva senza importo e
      // nessuno lo veniva a sapere. Ora o è un numero, o si dice che non lo è.
      const valore = numeroDaTesto(dati.valoreAtteso)
      if (!valore.ok)
        return { ok: false, messaggio: `«${valore.testo}» non è un importo: scrivi solo il numero, o lascia vuoto.` }
      // Il contatto parte SEMPRE (Scout lo aggancia al negozio, o lo crea con
      // lui): quello nella tabella se c'è, altrimenti la controparte nota al
      // codice. `crea` invece ci arriva SOLO dal bottone «Crea … e apri la
      // trattativa» (via campoScelta, come i candidati): mai di suo.
      const contattoEmail =
        (typeof dati.contattoEmail === 'string' && dati.contattoEmail.includes('@')
          ? dati.contattoEmail.trim()
          : null) ?? ctx.controparte ?? undefined
      // La data dell'evento viaggia DENTRO l'oggetto: `deals` in Scout non ha
      // una colonna per il giorno del servizio, e un campo mostrato che non
      // arriva da nessuna parte è peggio di un campo assente.
      const dataEvento =
        typeof dati.dataEvento === 'string' && dati.dataEvento.length === 10 && !Number.isNaN(Date.parse(dati.dataEvento))
          ? dati.dataEvento
          : ''
      const giorno = dataEvento ? dataEvento.split('-').reverse().join('/') : ''
      const oggetto =
        [typeof dati.oggetto === 'string' ? dati.oggetto.trim() : '', giorno ? `evento del ${giorno}` : '']
          .filter(Boolean)
          .join(' — ') || undefined
      // ⚠️ L'ID del negozio, quando l'utente l'ha scelto fra i candidati: il
      // NOME non è un'identità — «HAVI» in Scout sono due posti con lo stesso
      // nome e zona diversa, e rimandare il nome esatto faceva ripetere lo
      // stesso «più negozi corrispondono» all'infinito (26/08/2026).
      const negozioId = typeof dati.negozioId === 'string' && dati.negozioId.trim() ? dati.negozioId.trim() : undefined
      const body: Record<string, unknown> = {
        azione: 'apri',
        negozio,
        negozioId,
        oggetto,
        contattoEmail,
        ...(dati.crea === 'si' ? { crea: 'si' } : {}),
        linea: dati.linea || undefined,
        valoreAtteso: valore.valore ?? undefined,
        fase: dati.fase || undefined,
        scadenza: dati.scadenza || undefined,
        nextAction: dati.nextAction || undefined,
      }
      return chiama(
        `${COMMERCIALE_URL}/trattativa`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': ctx.chiave },
          body: JSON.stringify(body),
        },
        (status, risposta) => {
          const link =
            risposta && typeof risposta === 'object'
              ? ((risposta as Record<string, unknown>).link as string) ?? ((risposta as Record<string, unknown>).url as string) ?? undefined
              : undefined
          if (status === 200 || status === 201) return { ok: true, messaggio: `Trattativa aperta per «${negozio}».`, link }
          if (status === 401 || status === 403)
            return { ok: false, messaggio: 'Chiave Commerciale non valida: controllala in Impostazioni App.' }
          if (status === 404) {
            // ⚠️⚠️ Il 404 di «trattativa» porta con sé i CANDIDATI
            // (`{ error, candidati: [{ id, nome, zona }] }`): non si buttano, si
            // fanno scegliere. Si rimanda l'**id**, non il nome: la riga qui
            // sopra diceva «sul nome esatto smette di essere ambigua» ed era
            // FALSA — in Scout «HAVI» sono due posti con lo stesso `nome` e
            // zona diversa, quindi il match esatto ne trovava due e l'utente
            // si vedeva ripetere lo stesso errore ogni volta che sceglieva
            // (visto a schermo il 26/08/2026). Il nome non è un'identità.
            const c = risposta && typeof risposta === 'object' ? (risposta as Record<string, unknown>).candidati : null
            const grezzi = Array.isArray(c)
              ? c
                  .map((x) => {
                    const o = (x ?? {}) as Record<string, unknown>
                    const nome = typeof o.nome === 'string' ? o.nome : ''
                    const id = typeof o.id === 'string' ? o.id : ''
                    const zona = typeof o.zona === 'string' && o.zona ? ` — ${o.zona}` : ''
                    return nome ? { id, valore: id || nome, etichetta: `${nome}${zona}` } : null
                  })
                  .filter((x): x is { id: string; valore: string; etichetta: string } => x !== null)
              : []
            // Se anche UNO solo dei candidati non ha l'id (una versione vecchia
            // della funzione in Commerciale), si torna a scegliere per nome:
            // meglio il vecchio comportamento che una scelta che non arriva.
            const perId = grezzi.length > 0 && grezzi.every((x) => x.id !== '')
            const scelte = grezzi.map(({ valore, etichetta }) => ({ valore, etichetta }))
            // Con dei candidati si sceglie fra quelli. SENZA candidati non è
            // quasi mai un nome scritto male: è una PROSPECT NUOVA che nel CRM
            // non esiste ancora («Grazia Finoli» che chiede un preventivo da
            // virgilio.it, 26/08/2026) — e allora la strada giusta non è
            // «correggi il nome» ma «creala». Il bottone riusa il meccanismo
            // dei candidati: mette crea='si' nei dati e rimanda; il codice
            // allega l'email della controparte, così in Scout nasce anche il
            // contatto e la prossima sua mail si aggancia invece di duplicare.
            const puoiCreare =
              risposta && typeof risposta === 'object' && (risposta as Record<string, unknown>).puoiCreare === true
            return {
              ok: false,
              messaggio: scelte.length
                ? testoErrore(risposta, 'Negozio non trovato in Commerciale.')
                : `${testoErrore(risposta, 'Negozio non trovato in Commerciale.')}\n${
                    puoiCreare
                      ? 'Se è un contatto nuovo, crealo col bottone qui sotto; se invece in Commerciale ha un altro nome, correggi «Negozio» e riprova.'
                      : 'Se la mail non lo nomina, il nome qui sopra è ricavato dal dominio di chi scrive: correggi «Negozio» con il nome che ha in Commerciale e riprova.'
                  }`,
              ...(scelte.length
                ? { scelte, campoScelta: perId ? 'negozioId' : 'negozio' }
                : puoiCreare
                  ? {
                      scelte: [{ valore: 'si', etichetta: `＋ Crea «${negozio}» nel CRM e apri la trattativa` }],
                      campoScelta: 'crea',
                    }
                  : {}),
            }
          }
          return { ok: false, messaggio: testoErrore(risposta, `Commerciale ha risposto ${status}.`) }
        }
      )
    },
  },
  {
    id: 'commerciale.preventivo',
    app: 'Commerciale',
    nome: 'Registra il preventivo',
    scrive: true,
    dalRiassunto:
      'un FORNITORE ha comunicato un prezzo (o condizioni) per un lavoro che gli avevamo chiesto, e quel prezzo non risulta già registrato',
    descrizione: 'Segna in Scout il prezzo che un fornitore ha mandato per un lavoro aperto.',
    colore: 'green',
    guida:
      'La mail è la RISPOSTA DI UN FORNITORE a cui avevamo chiesto un prezzo. lavoro = per quale lavoro è il preventivo, come lo chiama la mail (es. «allestimento vetrine», «torte per l’inaugurazione»): Scout lo riconosce fra i suoi lavori aperti. ⚠️ ATTENZIONE, nello stesso scambio possono esserci DUE aziende diverse: il CLIENTE (chi chiede un servizio a Deluxy, e a cui NOI mandiamo un prezzo) e il FORNITORE (chi fa il servizio per noi, e che manda il prezzo A NOI). Qui conta solo il fornitore. fornitore = il nome dell’azienda che manda il prezzo A NOI — MAI il cliente, e mai Deluxy. importo = il prezzo che il FORNITORE ha scritto a noi, in euro, SOLO se scritto (numero, senza simboli e senza IVA se è indicata a parte): ⚠️ NON è il totale che noi abbiamo quotato al cliente — se nello scambio (o nel riassunto) compare un «totale complessivo» verso il cliente, quello NON è il prezzo del fornitore; se il fornitore non ha ancora dato un prezzo lascia null, non inventarlo e non metterlo a zero. tempi = i tempi di consegna come li scrive lui (es. «10 giorni»). note = condizioni che contano (validità dell’offerta, minimi, trasporto escluso), in una frase.',
    campi: [
      { nome: 'lavoro', etichetta: 'Per quale lavoro', obbligatorio: true, aiuto: 'Scout lo cerca fra i lavori aperti.' },
      { nome: 'fornitore', etichetta: 'Fornitore', obbligatorio: true, aiuto: 'Chi manda il prezzo A NOI, non il cliente che lo ha chiesto.' },
      {
        // ⚠️ Prima quest'indirizzo partiva verso Scout SENZA vedersi: era
        // `ctx.controparte`, cioè la prima azienda esterna dello scambio — che
        // in un thread dove ci sono sia il cliente sia il fornitore può
        // benissimo essere il CLIENTE. Ora si vede e si corregge, e lo riempie
        // il codice solo quando è CERTO (la mail è arrivata da là).
        nome: 'fornitoreEmail',
        etichetta: 'Email del fornitore',
        tipo: 'email',
        aiuto: 'La riempie il codice se il prezzo è arrivato da quell’indirizzo. Vuoto = non si manda.',
      },
      { nome: 'importo', etichetta: 'Importo (€)', tipo: 'numero', aiuto: 'Vuoto = prezzo non ancora arrivato.' },
      { nome: 'tempi', etichetta: 'Tempi' },
      { nome: 'note', etichetta: 'Condizioni', tipo: 'lungo' },
    ],
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['lavoro', 'fornitore', 'importo', 'tempi', 'note'],
      properties: {
        lavoro: { type: 'string', description: 'Il lavoro a cui si riferisce il prezzo.' },
        fornitore: { type: 'string', description: 'Nome dell’azienda che manda il preventivo A NOI: mai il cliente che ci ha chiesto un prezzo, mai Deluxy.' },
        importo: { type: ['number', 'null'], description: 'Prezzo che il FORNITORE ha scritto a noi, in euro, solo se scritto. Mai il totale quotato al cliente.' },
        tempi: { type: ['string', 'null'], description: 'Tempi di consegna, come li scrive il fornitore.' },
        note: { type: ['string', 'null'], description: 'Condizioni che contano, in una frase.' },
      },
    },
    // ⚠️⚠️ Qui NON si riempie piu' il fornitore col mittente della mail.
    // «Chi manda il prezzo lo dice l'indirizzo» vale solo se la mail e'
    // ARRIVATA, e questa azione si prepara spessissimo da una mail NOSTRA (il
    // riassunto punta alla mail che porta il dato, che puo' essere quella con
    // cui abbiamo mandato il prezzo al CLIENTE): li' dentro il mittente siamo
    // noi, e ci saremmo registrati come fornitori di noi stessi.
    // La decisione e' passata a `normalizza`, che ha il contesto: i nostri
    // domini e il mittente insieme.
    normalizza(dati, ctx) {
      const nostri = ctx.nostriDomini ?? []
      const dom = (e: string) => (e.includes('@') ? e.split('@')[1].toLowerCase() : '')
      // Il mittente grezzo puo' essere «Nome <a@b.it>»: si prende quel che sta
      // dentro le parentesi SENZA regex (una regex scritta da fuori perde i
      // backslash: e' gia' successo oggi).
      const grezzo = String(ctx.mittente ?? '')
      const dentro =
        grezzo.includes('<') && grezzo.includes('>')
          ? grezzo.slice(grezzo.indexOf('<') + 1, grezzo.indexOf('>'))
          : grezzo
      const indirizzo = dentro.trim().toLowerCase()
      const daFuori = Boolean(dom(indirizzo)) && !nostri.includes(dom(indirizzo))

      const d: Record<string, unknown> = { ...dati }
      // Il NOME: se il modello ha scritto un NOSTRO indirizzo (o niente) e la
      // mail e' arrivata da fuori, vale il mittente. Se ha scritto altro non si
      // tocca: il codice non sa distinguere il cliente dal fornitore, e la riga
      // e' li' da correggere prima di confermare.
      const scritto = typeof d.fornitore === 'string' ? d.fornitore.trim() : ''
      const scrittoSiamoNoi = Boolean(dom(scritto)) && nostri.includes(dom(scritto))
      if ((!scritto || scrittoSiamoNoi) && daFuori) d.fornitore = indirizzo
      else if (scrittoSiamoNoi) d.fornitore = ''

      // L'EMAIL: solo se e' certa, cioe' se il prezzo e' arrivato da li'.
      const emailScritta =
        typeof d.fornitoreEmail === 'string' && d.fornitoreEmail.includes('@')
          ? d.fornitoreEmail.trim().toLowerCase()
          : null
      if (emailScritta && !nostri.includes(dom(emailScritta))) d.fornitoreEmail = emailScritta
      else if (daFuori) d.fornitoreEmail = indirizzo
      else d.fornitoreEmail = null
      return d
    },
    async esegui(dati, ctx) {
      const lavoro = typeof dati.lavoro === 'string' ? dati.lavoro.trim() : ''
      const fornitore = typeof dati.fornitore === 'string' ? dati.fornitore.trim() : ''
      if (!lavoro) return { ok: false, messaggio: 'Manca il lavoro a cui si riferisce il preventivo.' }
      if (!fornitore) return { ok: false, messaggio: 'Manca il fornitore che ha fatto il prezzo.' }
      // Il campo del modulo è testo: «1.250,50» è come si scrive un prezzo qui,
      // e mandarlo così a Scout non darebbe un numero ma un errore.
      const letto = numeroDaTesto(dati.importo)
      if (!letto.ok)
        return { ok: false, messaggio: `«${letto.testo}» non è un importo: scrivi solo il numero, o lascia vuoto.` }
      const importo = letto.valore
      const body: Record<string, unknown> = {
        azione: 'registra',
        lavoro,
        fornitore,
        importo,
        tempi: dati.tempi || undefined,
        note: dati.note || undefined,
        // ⚠️ L'indirizzo che si VEDE nella tabella, non `ctx.controparte`: in
        // un thread con cliente E fornitore la controparte può essere il
        // CLIENTE, e finiva scritta in Scout come email del fornitore senza
        // che nessuno la vedesse mai.
        fornitoreEmail:
          typeof dati.fornitoreEmail === 'string' && dati.fornitoreEmail.includes('@')
            ? dati.fornitoreEmail.trim()
            : undefined,
        // Il rimando alla mail: senza, in Scout resta un numero senza storia.
        mailRef: ctx.messaggioId || undefined,
      }
      return chiama(
        `${COMMERCIALE_URL}/preventivi`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': ctx.chiave },
          body: JSON.stringify(body),
        },
        (status, risposta) => {
          if (status === 200 || status === 201) {
            return { ok: true, messaggio: testoErrore(risposta, `Preventivo di ${fornitore} registrato.`) }
          }
          if (status === 401 || status === 403)
            return { ok: false, messaggio: 'Chiave Commerciale non valida: controllala in Impostazioni App.' }
          // ⚠️ 404 e 409 non sono guasti: Scout non sa a quale lavoro attaccare
          // il prezzo e si rifiuta di indovinare. Nella risposta manda i lavori
          // aperti, e quelli vanno mostrati — «non trovato» senza dire cosa
          // c'era costringe a uscire e andare a guardare in Scout.
          if (status === 404 || status === 409) {
            const aperti = risposta && typeof risposta === 'object' ? (risposta as Record<string, unknown>).lavori : null
            const elenco = Array.isArray(aperti)
              ? aperti
                  .map((l) => (l && typeof l === 'object' ? String((l as Record<string, unknown>).titolo ?? '') : ''))
                  .filter(Boolean)
                  .slice(0, 6)
              : []
            const coda = elenco.length ? ` Lavori aperti: ${elenco.join(' · ')}.` : ''
            return { ok: false, messaggio: testoErrore(risposta, 'Lavoro non riconosciuto in Scout.') + coda }
          }
          return { ok: false, messaggio: testoErrore(risposta, `Commerciale ha risposto ${status}.`) }
        }
      )
    },
  },
]

export function tutteLeAzioni(): AzioneApp[] {
  return AZIONI
}

export function azioneDi(id: string): AzioneApp | undefined {
  return AZIONI.find((a) => a.id === id)
}

/** La versione serializzabile per i client component (senza funzioni). */
export type AzioneDescritta = {
  id: string
  app: string
  nome: string
  descrizione: string
  colore: string
  configurata: boolean
  /** I campi del form di conferma (assenti = si mostra il JSON). */
  campi?: CampoAzione[]
  /** Mostra la ricerca dell'azienda già presente in Anagrafiche. */
  cercaAzienda?: boolean
  /** L'azione da proporre a invio riuscito (una catena, non un automatismo). */
  dopo?: { azioneId: string; invito: string }
}

/** Descrive le azioni per i client component. `configurata` = la chiave della
 *  sua app è presente (inserita nell'app o via env). */
export function descriviAzioni(chiavi: ChiaviApp): AzioneDescritta[] {
  return AZIONI.map(({ id, app, nome, descrizione, colore, campi, cercaAzienda, dopo }) => ({
    id,
    app,
    nome,
    descrizione,
    colore,
    campi,
    cercaAzienda,
    dopo,
    configurata: chiaveDiAzione({ app } as AzioneApp, chiavi).length > 0,
  }))
}

/** Le azioni che il RIASSUNTO di una conversazione può proporre, ognuna con la
 *  regola di quando farlo (il campo `dalRiassunto` dell'azione). */
export function azioniDalRiassunto(): { id: string; app: string; nome: string; quando: string }[] {
  return AZIONI.filter((a) => a.dalRiassunto).map((a) => ({
    id: a.id,
    app: a.app,
    nome: a.nome,
    quando: a.dalRiassunto!,
  }))
}

/** Lo stato di collegamento di ogni app: quale chiave serve e se è a posto.
 *  Serve alla pagina Impostazioni App per guidare l'inserimento delle chiavi. */
export type StatoApp = {
  app: string
  nomeChiave: NomeChiaveApp
  colore: string
  configurata: boolean
  /** Nome della variabile d'ambiente equivalente (per chi preferisce Vercel). */
  variabileEnv: string
  /** Le funzioni che questa app offre. */
  azioni: { nome: string; descrizione: string }[]
  /** A cosa serve la chiave, in una frase. */
  comeSiOttiene: string
}

const META_APP: Record<string, { variabileEnv: string; comeSiOttiene: string }> = {
  Anagrafiche: {
    variabileEnv: 'ANAGRAFICHE_API_KEY',
    comeSiOttiene:
      'Chiave di SCRITTURA generata dall’app Anagrafiche (comando «npm run chiave -- deluxy-mail --scrittura»).',
  },
  Finance: {
    variabileEnv: 'FINANCE_API_KEY',
    comeSiOttiene: 'La chiave API di Deluxy Finance (impostazione «api.verificheKey» dell’app).',
  },
  Fornitori: {
    variabileEnv: 'FORNITORI_PASSWORD',
    comeSiOttiene:
      'La password AMMINISTRATORE dell’app Fornitori (search-deluxy) — quella che sblocca tutte le utenze, non il tuo codice utente personale. È la stessa che useresti nel comando curl «x-app-password».',
  },
  Commerciale: {
    variabileEnv: 'COMMERCIALE_API_KEY',
    comeSiOttiene:
      'La chiave x-api-key della Edge Function «trattativa» dell’app Commerciale (Supabase). Va nella cassaforte del Hub o come env COMMERCIALE_API_KEY.',
  },
}

export function statoApp(chiavi: ChiaviApp): StatoApp[] {
  // Raggruppa le azioni per app, mantenendo l'ordine del catalogo.
  const perApp = new Map<string, AzioneApp[]>()
  for (const a of AZIONI) {
    if (!perApp.has(a.app)) perApp.set(a.app, [])
    perApp.get(a.app)!.push(a)
  }

  return [...perApp.entries()].map(([app, azioni]) => {
    const nomeChiave = CHIAVE_DI_APP[app]
    return {
      app,
      nomeChiave,
      colore: azioni[0].colore,
      configurata: nomeChiave ? chiavi[nomeChiave].length > 0 : false,
      variabileEnv: META_APP[app]?.variabileEnv ?? '',
      comeSiOttiene: META_APP[app]?.comeSiOttiene ?? '',
      azioni: azioni.map((a) => ({ nome: a.nome, descrizione: a.descrizione })),
    }
  })
}

// ---------- Le regole APP DELUXY ----------

type MailPerRegole = { mittente: string; mittenteNome: string | null; oggetto: string; corpoTesto: string }

/**
 * La prima regola APP DELUXY che aggancia la mail (stessa semantica delle
 * regole della posta: tutte le condizioni valorizzate devono valere, e dentro
 * ognuna le alternative separate da virgola valgono in OR; vince la priorità
 * più alta). Una regola senza condizioni non scatta mai da sola.
 */
export function regolaAppPerMail(regole: RegolaApp[], msg: MailPerRegole): RegolaApp | null {
  const ordinate = [...regole].filter((r) => r.attiva).sort((a, b) => b.priorita - a.priorita)
  for (const r of ordinate) {
    if (!r.seMittente && !r.seOggetto && !r.seContiene) continue
    if (
      condizioneSoddisfatta(`${msg.mittenteNome ?? ''} ${msg.mittente}`, r.seMittente) &&
      condizioneSoddisfatta(msg.oggetto, r.seOggetto) &&
      condizioneSoddisfatta(msg.corpoTesto, r.seContiene)
    ) {
      return r
    }
  }
  return null
}
