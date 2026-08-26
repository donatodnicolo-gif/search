import { chiediAllAi } from "./ai";
import { prisma } from "./db";
import { breakEvenRoas } from "./guardrail";
import { normalizza } from "./ingest-metriche";

// Cosa fare di ogni keyword e di ogni parola cercata, secondo l'AI.
//
// ⚠️ Regole di questo file, in ordine di importanza:
//
//  1. **L'AI propone, non decide.** Quello che torna finisce in `PropostaAi`
//     con stato "proposta". Accettarla mette in coda un'operazione da
//     approvare, esattamente come se l'avesse chiesta una persona. Nessuna
//     scorciatoia: la catena app → coda → approvazione → script resta intera.
//  2. **Niente proposte su numeri che non ci sono.** Una keyword con 3 clic
//     non si giudica, e all'AI non la si manda nemmeno: chiedere un parere su
//     dati insufficienti produce un parere, non un'informazione. Sotto le
//     soglie qui sotto l'azione è "osserva", decisa dal codice, senza AI.
//  3. **I numeri si congelano.** Una proposta riletta fra un mese deve dire su
//     quali numeri era stata fatta, o sembra un giudizio su quelli di oggi.

// Sotto queste soglie non si chiede niente all'AI: non c'è statistica.
const CLIC_MINIMI = 10;
const SPESA_MINIMA = 15;

export const AZIONI_PROPOSTA = [
  "tieni",
  "osserva",
  "alza",
  "abbassa",
  "pausa",
  "escludi",
  "aggiungi",
] as const;

export const ETICHETTA_AZIONE_PROPOSTA: Record<string, string> = {
  tieni: "Tieni così",
  osserva: "Aspetta e guarda",
  alza: "Spingi di più",
  abbassa: "Spingi di meno",
  pausa: "Metti in pausa",
  escludi: "Escludi",
  aggiungi: "Aggiungila come keyword",
};

export const COLORE_AZIONE_PROPOSTA: Record<string, string> = {
  tieni: "var(--green)",
  osserva: "var(--text-tertiary)",
  alza: "var(--gold-strong)",
  abbassa: "var(--orange)",
  pausa: "var(--orange)",
  escludi: "var(--red)",
  aggiungi: "var(--blue)",
};

// ——— IDEAL vs SPECIFIC ———
//
// L'idea: alcune parole descrivono **quello che vendiamo** e valgono ovunque
// ("consegna fiori a domicilio Roma" → la stessa cosa esiste a Milano);
// altre sono **legate a un caso solo** — un concorrente, un'insegna, un modo
// di dire di quella città — e trasportarle altrove non vuol dire niente.
//
// Serve a una cosa sola, ma importante: le IDEAL si possono confrontare fra
// campagne e si può dire "questa funziona a Roma e a Milano manca". Le
// SPECIFIC no, e confrontarle produrrebbe suggerimenti senza senso.
export const CLASSI_PAROLA = ["ideal", "specific"] as const;

export const ETICHETTA_CLASSE_PAROLA: Record<string, string> = {
  ideal: "Ideale",
  specific: "Specifica",
};

export const SPIEGA_CLASSE_PAROLA: Record<string, string> = {
  ideal:
    "Descrive quello che vendiamo, non un caso particolare: la stessa parola ha senso in un'altra città o su un altro brand. Sono queste che si confrontano fra campagne.",
  specific:
    "Legata a un caso solo — un concorrente, un'insegna, un modo di dire locale, un prodotto che esiste solo qui. Non si confronta con altre campagne: trasportarla non vorrebbe dire niente.",
};

export type RigaDaGiudicare = {
  tipo: "keyword" | "termine";
  testo: string;
  spesa: number;
  clic: number;
  conversioni: number | null;
  incasso: number;
  punteggioQualita?: number | null;
  statoAttuale?: string | null;
};

export type EsitoProposte =
  | { ok: true; proposte: number; senzaDati: number; fornitore: string; modello: string }
  | { ok: false; errore: string; configurata: boolean };

const ISTRUZIONI = `Sei l'analista ADV di Deluxy, che vende fiori, torte e regali di lusso consegnati a domicilio in Italia.

Per OGNI riga che ricevi devi dire due cose.

1) AZIONE — cosa farne, scegliendo fra:
   - "tieni": va bene così, non toccarla
   - "osserva": i numeri non bastano ancora per decidere
   - "alza": rende sopra il break-even, vale la pena spingerla di più
   - "abbassa": rende ma sotto il break-even, va ridimensionata
   - "pausa": spende e non rende, va fermata (solo per le keyword)
   - "escludi": non è pertinente a quello che vendiamo, va messa fra le negative
   - "aggiungi": è una parola cercata che converte e NON è ancora comprata come keyword

   Regole non negoziabili:
   - "escludi" solo per NON PERTINENZA (cerca un'altra cosa: lavoro, gratis, fai da te, un
     prodotto che non vendiamo, informazioni). Una parola pertinente che rende poco si
     "abbassa" o si mette in "pausa", non si esclude: escluderla chiude la porta per sempre.
   - Il break-even del brand ti viene dato: sopra è guadagno, sotto è perdita. Non usare
     soglie tue.
   - Se i numeri non bastano, dì "osserva" e non inventare una motivazione forte.

2) CLASSE — "ideal" oppure "specific":
   - "ideal": descrive quello che vendiamo e varrebbe anche altrove. "consegna fiori roma",
     "flower delivery milan", "torte compleanno domicilio" sono ideal: la stessa parola ha
     senso in un'altra città.
   - "specific": legata a un caso solo — il nome di un concorrente o di un'insegna
     ("maryflor", "martesana"), un modo di dire locale, un prodotto che esiste solo lì, il
     nostro stesso marchio ("deluxy"). Trasportarla su un'altra campagna non vorrebbe dire
     niente.
   - Nel dubbio fra le due: "specific". Una ideal sbagliata viene poi suggerita ad altre
     campagne e propaga l'errore; una specific sbagliata resta ferma dov'è.

MOTIVO: una frase, in italiano, che nomina il numero da cui nasce la decisione
(es. "38 € e nessun ordine in 30 giorni"). Niente frasi generiche.
FIDUCIA: "alta" se i numeri parlano chiaro, "media" se sono pochi, "bassa" se stai
tirando a indovinare — con "bassa" la proposta viene mostrata ma non eseguibile.

Rispondi SOLO con l'oggetto JSON richiesto, una voce per ogni riga ricevuta, con lo stesso
testo esatto che hai ricevuto.`;

const SCHEMA = {
  type: "object",
  properties: {
    proposte: {
      type: "array",
      items: {
        type: "object",
        properties: {
          testo: { type: "string" },
          tipo: { type: "string", enum: ["keyword", "termine"] },
          azione: { type: "string", enum: [...AZIONI_PROPOSTA] },
          classe: { type: "string", enum: [...CLASSI_PAROLA] },
          motivo: { type: "string" },
          fiducia: { type: "string", enum: ["alta", "media", "bassa"] },
        },
        required: ["testo", "tipo", "azione", "classe", "motivo", "fiducia"],
        additionalProperties: false,
      },
    },
  },
  required: ["proposte"],
  additionalProperties: false,
};

// Le righe della campagna che vale la pena far giudicare, già ripulite.
export async function righeDaGiudicare(campagna: {
  id: string;
  nome: string;
}): Promise<{ da: RigaDaGiudicare[]; senzaDati: RigaDaGiudicare[] }> {
  const [termini, nomiKeyword] = await Promise.all([
    prisma.termineRicerca.findMany({ where: { campagnaId: campagna.id }, orderBy: { spesa: { sort: "desc", nulls: "last" } }, take: 60 }),
    prisma.copyAnnuncio.groupBy({ by: ["campagna"], where: { tipo: "keyword" } }),
  ]);
  const bersaglio = normalizza(campagna.nome);
  const compatibili = nomiKeyword.map((n) => n.campagna).filter((n) => normalizza(n) === bersaglio);
  const keyword = compatibili.length
    ? await prisma.copyAnnuncio.findMany({
        where: { tipo: "keyword", campagna: { in: compatibili } },
        orderBy: { spesa: { sort: "desc", nulls: "last" } },
        take: 60,
      })
    : [];

  const tutte: RigaDaGiudicare[] = [
    ...keyword.map((k) => ({
      tipo: "keyword" as const,
      testo: k.testo,
      spesa: k.spesa ?? 0,
      clic: k.clic ?? 0,
      conversioni: k.conversioni,
      incasso: k.incasso ?? 0,
      punteggioQualita: k.punteggioQualita,
      statoAttuale: k.stato,
    })),
    ...termini.map((t) => ({
      tipo: "termine" as const,
      testo: t.testo,
      spesa: t.spesa ?? 0,
      clic: t.clic ?? 0,
      conversioni: t.conversioni,
      incasso: t.ricavi ?? 0,
      statoAttuale: t.stato,
    })),
  ];

  // Basta UNA delle due soglie: una parola che ha speso 40 € con 4 clic è
  // giudicabile (costa cara), e una da 12 clic e 3 € pure (non rende nulla).
  const abbastanza = (r: RigaDaGiudicare) => r.clic >= CLIC_MINIMI || r.spesa >= SPESA_MINIMA;
  return { da: tutte.filter(abbastanza), senzaDati: tutte.filter((r) => !abbastanza(r)) };
}

export async function chiediProposte(campagna: {
  id: string;
  nome: string;
  brand: string;
}): Promise<EsitoProposte> {
  const { da, senzaDati } = await righeDaGiudicare(campagna);

  // Le righe senza abbastanza numeri NON vanno all'AI: si scrivono qui come
  // "osserva", con il motivo vero, che è "non c'è ancora niente da leggere".
  await salva(
    campagna.id,
    senzaDati.map((r) => ({
      tipo: r.tipo,
      testo: r.testo,
      azione: "osserva",
      classe: null,
      motivo: `Solo ${r.clic} clic e ${r.spesa.toFixed(2)} € nel periodo: non c'è ancora abbastanza per giudicarla.`,
      fiducia: "alta",
      numeri: numeriDi(r),
    }))
  );

  if (da.length === 0) {
    return { ok: true, proposte: 0, senzaDati: senzaDati.length, fornitore: "—", modello: "—" };
  }

  const be = breakEvenRoas(campagna.brand);
  const risposta = await chiediAllAi({
    istruzioni: ISTRUZIONI,
    schema: SCHEMA,
    dati: {
      campagna: campagna.nome,
      brand: campagna.brand,
      breakEvenRoas: be,
      spiegaBreakEven: `Sopra ${be.toFixed(2).replace(".", ",")}× di resa (incasso ÷ spesa) la campagna guadagna, sotto perde.`,
      righe: da.map((r) => ({
        tipo: r.tipo,
        testo: r.testo,
        spesa: Number(r.spesa.toFixed(2)),
        clic: r.clic,
        conversioni: r.conversioni,
        incasso: Number(r.incasso.toFixed(2)),
        resa: r.spesa > 0 ? Number((r.incasso / r.spesa).toFixed(2)) : null,
        punteggioQualita: r.punteggioQualita ?? null,
        statoNellApp: r.statoAttuale,
      })),
    },
  });

  if (!risposta.ok) return { ok: false, errore: risposta.errore, configurata: risposta.configurata };

  let letto: { proposte?: unknown };
  try {
    letto = JSON.parse(risposta.testo);
  } catch {
    return {
      ok: false,
      configurata: true,
      errore: `L'AI ha risposto qualcosa che non è JSON: ${risposta.testo.slice(0, 200)}`,
    };
  }
  if (!Array.isArray(letto.proposte)) {
    return { ok: false, configurata: true, errore: "L'AI non ha risposto con l'elenco delle proposte." };
  }

  // ⚠️ Uno schema rispettato non vuol dire un contenuto sensato: si tiene solo
  // quello che corrisponde a una riga davvero mandata. Se l'AI si inventa una
  // parola, quella parola non entra.
  const perTesto = new Map(da.map((r) => [`${r.tipo}::${r.testo}`, r]));
  const buone: ParametriSalva[] = [];
  for (const p of letto.proposte as Record<string, unknown>[]) {
    const tipo = p.tipo === "keyword" || p.tipo === "termine" ? p.tipo : null;
    const testo = typeof p.testo === "string" ? p.testo : null;
    if (!tipo || !testo) continue;
    const riga = perTesto.get(`${tipo}::${testo}`);
    if (!riga) continue;
    const azione = (AZIONI_PROPOSTA as readonly string[]).includes(String(p.azione))
      ? String(p.azione)
      : "osserva";
    const classe = (CLASSI_PAROLA as readonly string[]).includes(String(p.classe))
      ? String(p.classe)
      : null;
    buone.push({
      tipo,
      testo,
      azione,
      classe,
      motivo: typeof p.motivo === "string" && p.motivo.trim() ? p.motivo.trim() : "Nessuna motivazione data.",
      fiducia: ["alta", "media", "bassa"].includes(String(p.fiducia)) ? String(p.fiducia) : "media",
      numeri: numeriDi(riga),
    });
  }

  await salva(campagna.id, buone);
  return {
    ok: true,
    proposte: buone.length,
    senzaDati: senzaDati.length,
    fornitore: risposta.fornitore,
    modello: risposta.modello,
  };
}

type ParametriSalva = {
  tipo: string;
  testo: string;
  azione: string;
  classe: string | null;
  motivo: string;
  fiducia: string;
  numeri: string;
};

function numeriDi(r: RigaDaGiudicare): string {
  return JSON.stringify({
    spesa: Number(r.spesa.toFixed(2)),
    clic: r.clic,
    conversioni: r.conversioni,
    incasso: Number(r.incasso.toFixed(2)),
    quando: new Date().toISOString().slice(0, 10),
  });
}

// Scrittura in blocco: una proposta per query vorrebbe dire 120 andate e
// ritorno per campagna, cioè la stessa morte per timeout già vista altrove.
async function salva(campagnaId: string, righe: ParametriSalva[]) {
  if (righe.length === 0) return;
  const esistenti = await prisma.propostaAi.findMany({
    where: { campagnaId },
    select: { id: true, tipo: true, testo: true, stato: true },
  });
  const perChiave = new Map(esistenti.map((e) => [`${e.tipo}::${e.testo}`, e]));

  const daCreare: (ParametriSalva & { campagnaId: string })[] = [];
  for (const r of righe) {
    const vecchia = perChiave.get(`${r.tipo}::${r.testo}`);
    if (vecchia) {
      // Una proposta già decisa non si riscrive di nascosto: torna "proposta"
      // solo perché l'AI ha ricontato, e chi l'aveva scartata deve accorgersene.
      await prisma.propostaAi.update({
        where: { id: vecchia.id },
        data: { ...r, stato: "proposta", decisaIl: null, creataIl: new Date() },
      });
    } else {
      daCreare.push({ ...r, campagnaId });
    }
  }
  if (daCreare.length > 0) {
    await prisma.propostaAi.createMany({ data: daCreare, skipDuplicates: true });
  }
}

// ——— Le ideali che mancano qui ———
//
// Il confronto fra campagne si fa SOLO sulle "ideal": una parola che descrive
// quello che vendiamo funziona a Roma e può mancare a Milano. Le "specific"
// restano dove sono — suggerire il nome di un concorrente romano a Milano non
// vorrebbe dire niente.
export type IdealeMancante = {
  testo: string;
  daCampagna: string;
  daCampagnaId: string;
  spesa: number;
  incasso: number;
  resa: number | null;
  motivo: string;
};

export async function idealiCheMancano(campagna: {
  id: string;
  nome: string;
  brand: string;
}): Promise<IdealeMancante[]> {
  // Le ideali che RENDONO, viste sulle altre campagne dello stesso brand.
  const altrove = await prisma.propostaAi.findMany({
    where: {
      classe: "ideal",
      azione: { in: ["tieni", "alza"] },
      campagnaId: { not: campagna.id },
      campagna: { brand: campagna.brand },
    },
    include: { campagna: { select: { id: true, nome: true } } },
    orderBy: { creataIl: "desc" },
    take: 200,
  });
  if (altrove.length === 0) return [];

  // Quello che questa campagna ha già: keyword comprate e parole già viste.
  const qui = await prisma.propostaAi.findMany({
    where: { campagnaId: campagna.id },
    select: { testo: true },
  });
  const nomiKeyword = await prisma.copyAnnuncio.groupBy({ by: ["campagna"], where: { tipo: "keyword" } });
  const bersaglio = normalizza(campagna.nome);
  const compatibili = nomiKeyword.map((n) => n.campagna).filter((n) => normalizza(n) === bersaglio);
  const keywordQui = compatibili.length
    ? await prisma.copyAnnuncio.findMany({
        where: { tipo: "keyword", campagna: { in: compatibili } },
        select: { testo: true },
      })
    : [];

  // Confronto sulle parole, non sulla stringa: "flower delivery milan" e
  // "milan flower delivery" sono la stessa cosa comprata due volte.
  const impronta = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^a-zà-ù0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(" ");
  const gia = new Set([...qui.map((q) => q.testo), ...keywordQui.map((k) => k.testo)].map(impronta));

  const trovate = new Map<string, IdealeMancante>();
  for (const p of altrove) {
    const chiave = impronta(p.testo);
    if (gia.has(chiave) || trovate.has(chiave)) continue;
    let numeri: { spesa?: number; incasso?: number } = {};
    try {
      numeri = p.numeri ? JSON.parse(p.numeri) : {};
    } catch {
      numeri = {};
    }
    const spesa = numeri.spesa ?? 0;
    const incasso = numeri.incasso ?? 0;
    trovate.set(chiave, {
      testo: p.testo,
      daCampagna: p.campagna.nome,
      daCampagnaId: p.campagna.id,
      spesa,
      incasso,
      resa: spesa > 0 ? incasso / spesa : null,
      motivo: p.motivo,
    });
  }
  return [...trovate.values()].sort((a, b) => (b.resa ?? 0) - (a.resa ?? 0)).slice(0, 12);
}
