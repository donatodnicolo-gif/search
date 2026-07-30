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
}

export type SitoWidget = AspettoSito & {
  slug: string
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
        proposto: false,
      })
    } else {
      fuori.push({
        slug,
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
        proposto: true,
      })
    }
  }

  // I siti salvati che non sono fra le proposte (un partner, una landing).
  for (const s of salvati) {
    if (PROPOSTE[s.slug]) continue
    fuori.push({
      slug: s.slug,
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
    }
  }
  // Non salvato ma conosciuto: vale la proposta. Meglio il widget giusto di un
  // widget generico solo perché nessuno ha ancora premuto Salva.
  const p = PROPOSTE[pulito]
  return p ? { ...p } : null
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
    attivo: true,
  }
  await db.widgetSito.upsert({ where: { slug }, update: base, create: { slug, ...base } })
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
