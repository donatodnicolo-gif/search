// Il widget di chat, un sito per volta.
//
// I tre siti non si somigliano, e il widget non deve somigliare a sé stesso su
// tutti e tre: deluxy.it è il maggiordomo in nero e oro, deluxyflowers.com è un
// atelier che parla per sottrazione, cakedesign.me è il complice friendly. Le
// PROPOSTE qui sotto traducono le tre voci della guida customer service in tema,
// colore e testi — così chi apre la pagina non parte da un foglio bianco, ma da
// qualcosa che è già giusto e che può cambiare.
//
// ⚠️ La proposta NON si salva da sola. Finché nessuno conferma, quel sito resta
// «proposto»: la differenza fra «così l'abbiamo deciso» e «così te lo
// suggeriamo» è quella fra una configurazione e un'ipotesi, e in una schermata
// di impostazioni si devono distinguere.

import { db } from './db'

export type AspettoSito = {
  tema: string
  accento: string
  posizione: string
  etichetta: string
  titolo: string
  saluto: string
  /**
   * Il selettore CSS di un elemento CHE C'È GIÀ sul sito — la voce «Live Chat»
   * del menu contatti — che deve aprire la nostra chat. Vuoto = solo il bottone
   * flottante.
   */
  selettoreApri: string
  /** Il bottone flottante in basso: si toglie quando si apre dal menu. */
  mostraBottone: boolean
  /**
   * I link rapidi sotto il saluto: «Regali per oggi» → /collections/oggi.
   *
   * Sono la risposta alla domanda del saluto: chi apre la chat spesso vuole una
   * cosa che il sito ha già, e mandarcelo subito vale più di una risposta
   * scritta bene dieci minuti dopo.
   */
  linkRapidi: LinkRapido[]
}

export type LinkRapido = { testo: string; url: string }

/** Legge i link rapidi salvati come JSON, senza fidarsi di quello che trova. */
export function leggiLinkRapidi(grezzo: string): LinkRapido[] {
  try {
    const d = JSON.parse(grezzo || '[]')
    if (!Array.isArray(d)) return []
    return d
      .map((x) => ({ testo: String(x?.testo ?? '').trim().slice(0, 40), url: String(x?.url ?? '').trim().slice(0, 300) }))
      .filter((x) => x.testo && x.url)
      .slice(0, 6)
  } catch {
    return []
  }
}

export type SitoWidget = AspettoSito & {
  slug: string
  /** Il codice del link pubblico /chat/<codice>. Vuoto se il sito non è salvato. */
  codice: string
  nome: string
  dominio: string
  negozioId: string | null
  /** Il marchio a cui appartiene, per l'inbox a colonne. */
  brand: string
  /** true = non è ancora stato salvato: è la nostra proposta. */
  proposto: boolean
}

export const TEMI = ['chiaro', 'scuro', 'deluxy', 'caldo', 'minimale', 'automatico'] as const

/**
 * Le proposte per i nostri siti. La chiave è lo `slug`, che è anche quello che
 * finisce nello snippet e in `Conversazione.numeroId`.
 */
const PROPOSTE: Record<string, AspettoSito & { nome: string; dominio: string; negozio: string }> = {
  deluxy: {
    nome: 'Deluxy',
    dominio: 'deluxy.it',
    negozio: 'Deluxy',
    // Nero e oro, come il sito: il tema «deluxy» esiste per questo.
    tema: 'deluxy',
    accento: '#b8963e',
    posizione: 'destra',
    etichetta: 'Scriva a un esperto',
    titolo: 'Deluxy',
    saluto:
      'Buongiorno, sono il servizio clienti Deluxy. Mi dica pure che sorpresa ha in mente e la seguo io.',
    selettoreApri: '',
    mostraBottone: true,
    linkRapidi: [
      { testo: 'Regali per oggi', url: '/collections/oggi' },
      { testo: 'Fiori', url: '/collections/fiori' },
      { testo: 'Torte', url: '/collections/torte' },
    ],
  },
  flowers: {
    nome: 'Deluxy Flowers',
    dominio: 'deluxyflowers.com',
    negozio: 'FLowers',
    // Minimale: l'atelier parla per sottrazione, e le foto dei fiori non vanno
    // messe in concorrenza con un colore nostro.
    tema: 'minimale',
    accento: '',
    posizione: 'destra',
    etichetta: 'Parliamo di fiori',
    titolo: 'Deluxy Flowers',
    saluto:
      'Buongiorno, siamo l’atelier Deluxy Flowers. Ci racconti l’occasione e le proponiamo una creazione su misura.',
    selettoreApri: '',
    mostraBottone: true,
    linkRapidi: [
      { testo: 'Consegna oggi', url: '/collections/oggi' },
      { testo: 'Bouquet', url: '/collections/bouquet' },
      { testo: 'Maxi 100 rose', url: '/collections/maxi' },
    ],
  },
  cake: {
    nome: 'Cakedesign',
    dominio: 'cakedesign.me',
    negozio: 'Cake',
    // Caldo: avorio e terracotta stanno bene sulle foto di pasticceria, dove il
    // grigio sembra sporco.
    tema: 'caldo',
    accento: '#9c5b3f',
    posizione: 'destra',
    etichetta: 'Scrivici 🎂',
    titolo: 'Cakedesign',
    saluto:
      'Ciao! Raccontaci che torta hai in mente — anche solo un’idea — e ti aiutiamo a realizzarla 🎂',
    // Il menu contatti di cakedesign.me ha già la voce «Live Chat» che punta a
    // un servizio esterno: con questo selettore apre la nostra.
    selettoreApri: 'a.dialogify',
    mostraBottone: true,
    linkRapidi: [
      { testo: 'Torte per oggi', url: '/collections/oggi' },
      { testo: 'Torte nuziali', url: '/collections/torte-nuziali' },
      { testo: 'Crea con AI', url: '/pages/crea-con-ai' },
    ],
  },
}

/** L'aspetto di riserva per un sito che non conosciamo (partner, landing). */
export const ASPETTO_NEUTRO: AspettoSito = {
  tema: 'minimale',
  accento: '',
  posizione: 'destra',
  etichetta: '',
  titolo: 'Deluxy',
  saluto: 'Buongiorno, come possiamo aiutarla?',
  selettoreApri: '',
  mostraBottone: true,
  linkRapidi: [],
}

/**
 * Tutti i siti: quelli salvati e quelli soltanto proposti, insieme.
 *
 * Non si creano righe al volo per far comparire le proposte: una tabella che si
 * riempie perché qualcuno ha aperto una pagina è una tabella di cui non si sa
 * più cosa è stato deciso davvero.
 */
export async function sitiWidget(): Promise<SitoWidget[]> {
  const [salvati, negozi] = await Promise.all([
    db.widgetSito.findMany({
      include: { negozio: { select: { nome: true } } },
      orderBy: { slug: 'asc' },
    }),
    db.negozioShopify.findMany({ where: { attivo: true }, select: { id: true, nome: true } } ),
  ])

  const perSlug = new Map(salvati.map((s) => [s.slug, s]))
  const fuori: SitoWidget[] = []

  for (const [slug, p] of Object.entries(PROPOSTE)) {
    const s = perSlug.get(slug)
    const negozio = negozi.find((n) => n.nome === p.negozio)
    if (s) {
      fuori.push({
        slug: s.slug,
        codice: s.codice ?? '',
        nome: s.nome || p.nome,
        dominio: s.dominio || p.dominio,
        negozioId: s.negozioId,
        brand: s.negozio?.nome ?? '',
        tema: s.tema,
        accento: s.accento,
        posizione: s.posizione,
        etichetta: s.etichetta,
        titolo: s.titolo,
        saluto: s.saluto,
        selettoreApri: s.selettoreApri,
        mostraBottone: s.mostraBottone,
        linkRapidi: leggiLinkRapidi(s.linkRapidi),
        proposto: false,
      })
    } else {
      fuori.push({
        slug,
        codice: '',
        nome: p.nome,
        dominio: p.dominio,
        negozioId: negozio?.id ?? null,
        brand: negozio?.nome ?? '',
        tema: p.tema,
        accento: p.accento,
        posizione: p.posizione,
        etichetta: p.etichetta,
        titolo: p.titolo,
        saluto: p.saluto,
        selettoreApri: p.selettoreApri,
        mostraBottone: p.mostraBottone,
        linkRapidi: p.linkRapidi,
        proposto: true,
      })
    }
  }

  // I siti salvati che non sono fra le proposte (un partner, una landing).
  for (const s of salvati) {
    if (PROPOSTE[s.slug]) continue
    fuori.push({
      slug: s.slug,
      codice: s.codice ?? '',
      nome: s.nome || s.slug,
      dominio: s.dominio,
      negozioId: s.negozioId,
      brand: s.negozio?.nome ?? '',
      tema: s.tema,
      accento: s.accento,
      posizione: s.posizione,
      etichetta: s.etichetta,
      titolo: s.titolo,
      saluto: s.saluto,
      selettoreApri: s.selettoreApri,
      mostraBottone: s.mostraBottone,
      linkRapidi: leggiLinkRapidi(s.linkRapidi),
      proposto: false,
    })
  }

  return fuori
}

/** L'aspetto di un sito per il widget vero: `null` se quello slug non esiste. */
export async function aspettoDelSito(slug: string): Promise<AspettoSito | null> {
  const pulito = normalizzaSlug(slug)
  if (!pulito) return null
  const salvato = await db.widgetSito.findUnique({ where: { slug: pulito } })
  if (salvato && salvato.attivo) {
    return {
      tema: salvato.tema,
      accento: salvato.accento,
      posizione: salvato.posizione,
      etichetta: salvato.etichetta,
      titolo: salvato.titolo,
      saluto: salvato.saluto,
      selettoreApri: salvato.selettoreApri,
      mostraBottone: salvato.mostraBottone,
      linkRapidi: leggiLinkRapidi(salvato.linkRapidi),
    }
  }
  // Non salvato ma conosciuto: vale la proposta. Meglio il widget giusto di un
  // widget generico solo perché nessuno ha ancora premuto Salva.
  const p = PROPOSTE[pulito]
  return p ? { ...p } : null
}

// ── IL LINK PUBBLICO DELLA CHAT: /chat/<codice> ──────────────────────────────
//
// La stessa chat del widget, ma come pagina a sé: da mettere nella bio di
// Instagram, in firma alle mail, dietro un QR sul biglietto che va col mazzo.
//
// ⚠️ Non si usa lo `slug`. Quello è pubblico per costruzione — sta nello snippet
// di ogni sito, lo legge chiunque guardi il sorgente — e con `/chat/cake`
// bastava provare `/chat/deluxy` per aprire conversazioni a nome di un altro
// marchio. Il codice è casuale e lungo, come nei servizi di chat pubblica: non
// è un segreto (chi ce l'ha entra, ed è il punto), ma non si indovina.

/** Un codice da URL: 32 caratteri fra lettere minuscole e cifre. */
export function nuovoCodicePubblico(): string {
  const alfabeto = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const byte = new Uint8Array(32)
  crypto.getRandomValues(byte)
  // ⚠️ `crypto.getRandomValues`, non `Math.random()`: due siti creati nello
  // stesso istante con un generatore prevedibile possono uscire uguali, e qui
  // un codice uguale a un altro vuol dire scrivere al marchio sbagliato.
  return Array.from(byte, (b) => alfabeto[b % alfabeto.length]).join('')
}

/** Il sito dietro un codice pubblico: `null` se non esiste o è sospeso. */
export async function sitoDaCodice(codice: string): Promise<(SitoWidget & { codice: string }) | null> {
  const pulito = (codice ?? '').trim().toLowerCase()
  if (!/^[a-z0-9]{16,64}$/.test(pulito)) return null
  const s = await db.widgetSito.findUnique({
    where: { codice: pulito },
    include: { negozio: { select: { nome: true } } },
  })
  if (!s || !s.attivo) return null
  const p = PROPOSTE[s.slug]
  return {
    codice: pulito,
    slug: s.slug,
    nome: s.nome || p?.nome || s.slug,
    dominio: s.dominio || p?.dominio || '',
    negozioId: s.negozioId,
    brand: s.negozio?.nome ?? '',
    tema: s.tema,
    accento: s.accento,
    posizione: s.posizione,
    etichetta: s.etichetta,
    titolo: s.titolo,
    saluto: s.saluto,
    selettoreApri: s.selettoreApri,
    mostraBottone: s.mostraBottone,
    linkRapidi: leggiLinkRapidi(s.linkRapidi),
    proposto: false,
  }
}

/**
 * Il codice pubblico di un sito, creandolo se non ce l'ha ancora.
 *
 * Si crea a richiesta e non a tavolino: i siti solo «proposti» non hanno una
 * riga, e non avrebbe senso dare un link a una configurazione che nessuno ha
 * ancora confermato.
 */
export async function codiceDelSito(slug: string): Promise<string> {
  const pulito = normalizzaSlug(slug)
  if (!pulito) return ''
  const s = await db.widgetSito.findUnique({ where: { slug: pulito } })
  if (!s) return ''
  if (s.codice) return s.codice
  const codice = nuovoCodicePubblico()
  await db.widgetSito.update({ where: { slug: pulito }, data: { codice } })
  return codice
}

/** Solo minuscole, cifre e trattini: lo slug finisce in un URL e in uno snippet. */
export function normalizzaSlug(v: string): string {
  return (v ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export async function salvaSitoWidget(dati: {
  slug: string
  nome: string
  dominio: string
  negozioId: string | null
  tema: string
  accento: string
  posizione: string
  etichetta: string
  titolo: string
  saluto: string
  selettoreApri: string
  mostraBottone: boolean
  linkRapidi: { testo: string; url: string }[]
}): Promise<void> {
  const slug = normalizzaSlug(dati.slug)
  if (!slug) return
  const base = {
    nome: dati.nome.trim(),
    dominio: dati.dominio.trim().toLowerCase(),
    negozioId: dati.negozioId || null,
    tema: (TEMI as readonly string[]).includes(dati.tema) ? dati.tema : 'chiaro',
    // Un colore scritto a mano può essere un refuso: se non è #rrggbb non si
    // salva, altrimenti il widget resta senza accento senza dire perché.
    accento: /^#[0-9a-f]{6}$/i.test(dati.accento.trim()) ? dati.accento.trim().toLowerCase() : '',
    posizione: dati.posizione === 'sinistra' ? 'sinistra' : 'destra',
    etichetta: dati.etichetta.trim().slice(0, 40),
    titolo: dati.titolo.trim().slice(0, 60),
    saluto: dati.saluto.trim().slice(0, 400),
    // Il selettore finisce in un attributo HTML dello snippet: le virgolette
    // doppie lo spezzerebbero a metà.
    selettoreApri: dati.selettoreApri.trim().replace(/"/g, '').slice(0, 120),
    mostraBottone: dati.mostraBottone !== false,
    // Si salva quello che si e' capito, non quello che e' arrivato: cosi' un
    // JSON storto non finisce in tabella e da li' nel widget dei clienti.
    linkRapidi: JSON.stringify(leggiLinkRapidi(JSON.stringify(dati.linkRapidi ?? []))),
    attivo: true,
  }
  // Il codice del link pubblico nasce col sito e NON si tocca più: cambiarlo
  // romperebbe il QR già stampato e il link già messo nella bio di Instagram.
  await db.widgetSito.upsert({
    where: { slug },
    update: base,
    create: { slug, ...base, codice: nuovoCodicePubblico() },
  })
}

/** Mappa `slug → marchio`, per dare un brand alle conversazioni del widget. */
export async function brandPerSitoWidget(): Promise<Map<string, string>> {
  const righe = await db.widgetSito.findMany({
    include: { negozio: { select: { nome: true } } },
  })
  const mappa = new Map<string, string>()
  for (const r of righe) mappa.set(r.slug, r.negozio?.nome ?? '')
  // Anche i siti solo PROPOSTI hanno un marchio noto: senza, un messaggio dal
  // sito dei fiori finirebbe in «Senza marchio» solo perché nessuno ha ancora
  // premuto Salva. Ma una riga salvata SENZA marchio resta senza: là dentro il
  // vuoto è una scelta di chi ha salvato, e non si sovrascrive.
  for (const [slug, p] of Object.entries(PROPOSTE)) {
    if (!mappa.has(slug)) mappa.set(slug, p.negozio)
  }
  return mappa
}
