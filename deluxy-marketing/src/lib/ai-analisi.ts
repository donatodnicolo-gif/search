import { chiediAllAi, statoAi } from "@/lib/ai";
import { mer, numeriBrand, quotaPagato, roasPiattaforma, scostamentoAttribuzione } from "@/lib/brand-dati";
import { prisma } from "@/lib/db";
import { breakEvenRoas } from "@/lib/guardrail";
import { risolviPeriodo, type PeriodoRisolto } from "@/lib/periodo";

// Lettura AI delle performance. Due principi, entrambi non negoziabili:
//
// 1. L'AI riceve SOLO numeri già calcolati dall'app, mai il compito di
//    calcolarli. Un modello che somma spese sbaglia in silenzio; qui somma il
//    database e il modello interpreta. Se un numero non c'è, glielo si dice.
//
// 2. L'AI NON ESEGUE NULLA. Propone letture e azioni; le azioni passano dalla
//    coda di /operazioni con approvazione manuale e guardrail, come qualsiasi
//    altra modifica (regola AGENDA PIANI dei Definitivi).
//
// QUALE AI la scrive è una scelta, non un dato del codice: Claude o OpenAI si
// impostano da Impostazioni → Intelligenza artificiale. Qui si sa solo che
// esiste un'AI a cui chiedere; il fornitore vive in lib/ai.ts.

// La forma della risposta. Claude la riceve come vincolo (non può uscirne);
// OpenAI la usa come descrizione. In tutti i casi si valida quello che torna.
const SCHEMA_LETTURA = {
  type: "object",
  additionalProperties: false,
  required: ["sintesi", "osservazioni", "azioni", "domandeAperte"],
  properties: {
    sintesi: { type: "string" },
    osservazioni: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["titolo", "tipo", "spiegazione", "numeri"],
        properties: {
          titolo: { type: "string" },
          tipo: { type: "string", enum: ["cosa_va", "cosa_non_va", "da_capire", "rischio"] },
          spiegazione: { type: "string" },
          numeri: { type: "string" },
        },
      },
    },
    azioni: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["titolo", "perche", "livello", "campagna", "priorita"],
        properties: {
          titolo: { type: "string" },
          perche: { type: "string" },
          livello: { type: "string", enum: ["L0", "L1", "L2", "L3"] },
          campagna: { type: ["string", "null"] },
          priorita: { type: "string", enum: ["P0", "P1", "P2"] },
        },
      },
    },
    domandeAperte: { type: "array", items: { type: "string" } },
  },
};

export async function aiConfigurata(): Promise<boolean> {
  return (await statoAi()).configurata;
}

export type Osservazione = {
  titolo: string;
  // cosa_va | cosa_non_va | da_capire | rischio
  tipo: string;
  spiegazione: string;
  numeri: string;
};

export type AzioneProposta = {
  titolo: string;
  perche: string;
  // L0 neutra · L1 leggera · L2 impattante · L3 strutturale (doc 11)
  livello: string;
  campagna: string | null;
  priorita: string; // P0 | P1 | P2
};

export type LetturaAI = {
  sintesi: string;
  osservazioni: Osservazione[];
  azioni: AzioneProposta[];
  domandeAperte: string[];
};

export type EsitoLettura =
  | { ok: true; lettura: LetturaAI; modello: string; dati: DatiPerAI }
  | { ok: false; errore: string; configurata: boolean; dati?: DatiPerAI };

export type DatiPerAI = {
  periodo: { etichetta: string; dal: string; al: string };
  brand: string | null;
  breakEven: number | null;
  ultimoGiornoConDati: string | null;
  giorniSenzaDati: number;
  totali: {
    spesa: number;
    ricaviDichiarati: number;
    conversioni: number;
    venditeShopify: number;
    ordini: number;
    mer: number | null;
    roasDichiarato: number | null;
    quotaTracciata: number | null;
    scostamentoAttribuzione: number | null;
  };
  campagne: {
    nome: string;
    canale: string;
    stato: string;
    classe: string;
    tipoConversione: string | null;
    strategiaOfferta: string | null;
    spesa: number;
    conversioni: number;
    ricaviDichiarati: number;
    roas: number | null;
    cpa: number | null;
    ctr: number | null;
    spesaPeriodoPrecedente: number;
  }[];
  alertAperti: { tipo: string; livello: string; campagna: string; messaggio: string }[];
  incidentiAperti: { codice: string; titolo: string }[];
  confronti: {
    spesaPrecedente: number;
    venditePrecedenti: number;
    spesaAnnoPrima: number;
    venditeAnnoPrima: number;
  };
};

// Raccoglie i numeri veri. Questa funzione è la fonte: l'AI non vede altro.
export async function raccogliDati(
  brand: string | null,
  periodo: PeriodoRisolto
): Promise<DatiPerAI> {
  const filtro = brand ? { brand } : {};

  const [metriche, metrichePrec, campagne, alert, incidenti, ultimo] = await Promise.all([
    prisma.metricaCampagna.findMany({
      where: { data: { gte: periodo.corrente.da, lt: periodo.corrente.a }, campagna: filtro },
      include: {
        campagna: {
          select: { id: true, nome: true, canale: true, stato: true, classe: true, tipoConversione: true, strategiaOfferta: true },
        },
      },
    }),
    prisma.metricaCampagna.findMany({
      where: { data: { gte: periodo.precedente.da, lt: periodo.precedente.a }, campagna: filtro },
      select: { spesa: true, campagna: { select: { id: true } } },
    }),
    prisma.campagna.count({ where: filtro }),
    prisma.alert.findMany({
      where: { stato: "aperto", campagna: filtro },
      include: { campagna: { select: { nome: true } } },
      orderBy: { giorno: "desc" },
      take: 12,
    }),
    prisma.incidente.findMany({ where: { stato: "aperto" }, select: { codice: true, titolo: true }, take: 8 }),
    prisma.metricaCampagna.aggregate({ where: { campagna: filtro }, _max: { data: true } }),
  ]);
  void campagne;

  // Aggregazione per campagna
  const per = new Map<string, DatiPerAI["campagne"][number] & { impression: number; click: number }>();
  let spesa = 0, ricavi = 0, conv = 0;
  for (const m of metriche) {
    spesa += m.spesa ?? 0;
    ricavi += m.ricavi ?? 0;
    conv += m.conversioni ?? 0;
    const c = m.campagna;
    const r = per.get(c.id) ?? {
      nome: c.nome, canale: c.canale, stato: c.stato, classe: c.classe,
      tipoConversione: c.tipoConversione, strategiaOfferta: c.strategiaOfferta,
      spesa: 0, conversioni: 0, ricaviDichiarati: 0, roas: null, cpa: null, ctr: null,
      spesaPeriodoPrecedente: 0, impression: 0, click: 0,
    };
    r.spesa += m.spesa ?? 0;
    r.conversioni += m.conversioni ?? 0;
    r.ricaviDichiarati += m.ricavi ?? 0;
    r.impression += m.impression ?? 0;
    r.click += m.click ?? 0;
    per.set(c.id, r);
  }
  for (const m of metrichePrec) {
    const r = per.get(m.campagna.id);
    if (r) r.spesaPeriodoPrecedente += m.spesa ?? 0;
  }

  const arr = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
  const campagneOut = [...per.values()]
    .map((r) => ({
      nome: r.nome, canale: r.canale, stato: r.stato, classe: r.classe,
      tipoConversione: r.tipoConversione, strategiaOfferta: r.strategiaOfferta,
      spesa: arr(r.spesa), conversioni: arr(r.conversioni), ricaviDichiarati: arr(r.ricaviDichiarati),
      roas: r.spesa > 0 ? arr(r.ricaviDichiarati / r.spesa) : null,
      cpa: r.conversioni > 0 ? arr(r.spesa / r.conversioni) : null,
      ctr: r.impression > 0 ? arr((r.click / r.impression) * 100) : null,
      spesaPeriodoPrecedente: arr(r.spesaPeriodoPrecedente),
    }))
    .sort((a, b) => b.spesa - a.spesa);

  // Vendite vere: solo se il brand è uno (i totali cross non sommano bene)
  const nb = brand ? await numeriBrand(brand, periodo.corrente) : null;
  const nbPrec = brand ? await numeriBrand(brand, periodo.precedente) : null;
  const nbAnno = brand ? await numeriBrand(brand, periodo.annoPrima) : null;

  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const giorniSenzaDati = ultimo._max.data
    ? Math.max(0, Math.round((oggi.getTime() - ultimo._max.data.getTime()) / 86_400_000))
    : 0;

  return {
    periodo: {
      etichetta: periodo.corrente.etichetta,
      dal: periodo.corrente.da.toISOString().slice(0, 10),
      al: new Date(periodo.corrente.a.getTime() - 86_400_000).toISOString().slice(0, 10),
    },
    brand,
    breakEven: brand ? arr(breakEvenRoas(brand)) : null,
    ultimoGiornoConDati: ultimo._max.data ? ultimo._max.data.toISOString().slice(0, 10) : null,
    giorniSenzaDati,
    totali: {
      spesa: arr(spesa),
      ricaviDichiarati: arr(ricavi),
      conversioni: arr(conv),
      venditeShopify: nb ? arr(nb.venditeTotali) : 0,
      ordini: nb?.ordini ?? 0,
      mer: nb ? (mer(nb) != null ? arr(mer(nb)!) : null) : null,
      roasDichiarato: spesa > 0 ? arr(ricavi / spesa) : null,
      quotaTracciata: nb && quotaPagato(nb) != null ? arr(quotaPagato(nb)! * 100, 1) : null,
      scostamentoAttribuzione: nb && scostamentoAttribuzione(nb) != null ? arr(scostamentoAttribuzione(nb)!) : null,
    },
    campagne: campagneOut,
    alertAperti: alert.map((a) => ({
      tipo: a.tipo, livello: a.livello, campagna: a.campagna.nome, messaggio: a.messaggio,
    })),
    incidentiAperti: incidenti.map((i) => ({ codice: i.codice, titolo: i.titolo })),
    confronti: {
      spesaPrecedente: nbPrec ? arr(nbPrec.spesa) : 0,
      venditePrecedenti: nbPrec ? arr(nbPrec.venditeTotali) : 0,
      spesaAnnoPrima: nbAnno ? arr(nbAnno.spesa) : 0,
      venditeAnnoPrima: nbAnno ? arr(nbAnno.venditeTotali) : 0,
    },
  };
}

const ISTRUZIONI = `Sei un analista di digital advertising che lavora per Deluxy, gruppo italiano di regali di lusso (fiori, torte, colazioni) con consegna in guanti bianchi. Leggi i numeri che ti vengono dati e dici cosa significano.

REGOLE DI LETTURA, non negoziabili:
- Usa SOLO i numeri forniti. Non inventare metriche, nomi di campagna o importi. Se un dato manca, dillo e spiega cosa servirebbe.
- Il ROAS dichiarato dalle piattaforme SOVRASTIMA: il reale è circa il 60-75%. Il numero che dice se l'azienda sta in piedi è il MER (tutte le vendite / tutta la spesa), non il ROAS.
- Ogni brand ha il suo break-even ROAS: sopra quella soglia guadagna, sotto perde. Non usare mai soglie assolute.
- Le campagne con tipoConversione "lead" (B2B, corporate) hanno valore conversione simbolico: NON giudicarle col ROAS, guarda il costo per contatto.
- Le campagne di classe "traino" non si toccano con leggerezza: portano gran parte del valore. Per loro proponi solo L0/L1, oppure L2 con rollback dichiarato.
- Con pochi eventi non dichiarare vincitori: differenze piccole su volumi piccoli sono rumore.
- Se ci sono incidenti aperti, le campagne coinvolte sono in freeze: non proporre modifiche su quelle.
- Se i dati si fermano a giorni fa, dillo subito: i totali del periodo sono più bassi del vero.

TONO: diretto e concreto, in italiano. Niente frasi di riempimento, niente "è importante notare che". Ogni osservazione porta i numeri che la sostengono.

Rispondi SOLO con JSON valido:
{
  "sintesi": "3-5 frasi: come va davvero il periodo e la cosa più importante da sapere",
  "osservazioni": [{"titolo":"...","tipo":"cosa_va|cosa_non_va|da_capire|rischio","spiegazione":"...","numeri":"i numeri esatti che la sostengono"}],
  "azioni": [{"titolo":"...","perche":"...","livello":"L0|L1|L2|L3","campagna":"nome esatto o null","priorita":"P0|P1|P2"}],
  "domandeAperte": ["cosa non si può dedurre da questi dati"]
}`;

export async function leggiPerformance(
  brand: string | null,
  preset?: string,
  dal?: string,
  al?: string
): Promise<EsitoLettura> {
  const periodo = risolviPeriodo(preset ?? "30g", dal, al);
  const dati = await raccogliDati(brand, periodo);

  const stato = await statoAi();
  if (!stato.configurata) {
    return {
      ok: false,
      configurata: false,
      errore: `Manca la chiave di ${stato.nome}: si mette in Impostazioni → Intelligenza artificiale, dove si sceglie anche quale AI usare.`,
      dati,
    };
  }
  if (dati.totali.spesa === 0 && dati.campagne.length === 0) {
    return {
      ok: false,
      configurata: true,
      errore: `Nessun dato nel periodo ${dati.periodo.etichetta}: non c'è niente da analizzare. Controlla che i connettori stiano consegnando (pagina Dati in arrivo).`,
      dati,
    };
  }

  const risposta = await chiediAllAi({
    istruzioni: ISTRUZIONI,
    dati,
    schema: SCHEMA_LETTURA as unknown as Record<string, unknown>,
  });
  if (!risposta.ok) {
    return { ok: false, configurata: risposta.configurata, errore: risposta.errore, dati };
  }

  try {
    const grezzo = JSON.parse(risposta.testo) as Partial<LetturaAI>;
    const lettura: LetturaAI = {
      sintesi: String(grezzo.sintesi ?? "").trim(),
      osservazioni: Array.isArray(grezzo.osservazioni)
        ? grezzo.osservazioni.slice(0, 12).map((o) => ({
            titolo: String(o?.titolo ?? "").trim(),
            tipo: String(o?.tipo ?? "da_capire"),
            spiegazione: String(o?.spiegazione ?? "").trim(),
            numeri: String(o?.numeri ?? "").trim(),
          }))
        : [],
      azioni: Array.isArray(grezzo.azioni)
        ? grezzo.azioni.slice(0, 10).map((a) => ({
            titolo: String(a?.titolo ?? "").trim(),
            perche: String(a?.perche ?? "").trim(),
            livello: ["L0", "L1", "L2", "L3"].includes(String(a?.livello)) ? String(a?.livello) : "L1",
            campagna: a?.campagna ? String(a.campagna) : null,
            priorita: ["P0", "P1", "P2"].includes(String(a?.priorita)) ? String(a?.priorita) : "P2",
          }))
        : [],
      domandeAperte: Array.isArray(grezzo.domandeAperte)
        ? grezzo.domandeAperte.slice(0, 8).map((d) => String(d).trim())
        : [],
    };
    if (!lettura.sintesi) {
      return { ok: false, configurata: true, errore: "Il modello non ha prodotto una sintesi leggibile", dati };
    }
    // Il modello si dichiara: leggendo una lettura vecchia si deve poter
    // sapere chi l'ha scritta, visto che il fornitore si cambia a piacere.
    return { ok: true, lettura, modello: `${risposta.fornitore === "anthropic" ? "Claude" : "OpenAI"} · ${risposta.modello}`, dati };
  } catch (e) {
    return {
      ok: false,
      configurata: true,
      errore: `Risposta illeggibile da ${risposta.modello}: ${String(e).slice(0, 200)}`,
      dati,
    };
  }
}
