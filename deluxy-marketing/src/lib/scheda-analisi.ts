import { chiediAllAi } from "./ai";
import { prisma } from "./db";
import { testoDocumento } from "./drive";

// La SCHEDA di un'analisi: il documento di Drive rielaborato in una forma
// che una pagina può RENDERE, non solo mostrare.
//
// ⚠️ PERCHÉ (25/08/2026). Le analisi depositate su Drive sono il controllo
// esterno di questa app (una di loro ha trovato il difetto degli stati Meta
// lo stesso giorno in cui è nata questa scheda) — ma dentro l'app erano una
// riga d'elenco con 600 caratteri di sintesi. Il documento vero è un .md di
// 30 KB con tabelle: chi lo apre da telefono non lo legge, e un verdetto
// ROSSO sepolto a metà file non ferma nessuno. La scheda estrae la struttura
// (verdetto, numeri chiave, findings con priorità, azioni, campagne citate)
// e la pagina la rende grafica: pillole, colori, collegamenti alle campagne.
//
// ⚠️ La scheda NON sostituisce il documento: è la sua lettura. Il file su
// Drive resta la fonte, il link resta a schermo, e la scheda dice con che
// modello è stata prodotta (`elaborataCon`) — una rilettura senza firma non
// si può giudicare quando i modelli cambiano.

export type VerdettoScheda = "rosso" | "giallo" | "verde";

export type Scheda = {
  verdetto: VerdettoScheda;
  /** Una frase sola: il verdetto spiegato. */
  titolo: string;
  /** 2-4 frasi: cosa dice l'analisi, per chi non aprirà il documento. */
  sintesi: string;
  /** Il periodo coperto, come lo dice il documento ("30gg 26 lug – 24 ago"). */
  periodo: string | null;
  kpi: {
    etichetta: string;
    valore: string;
    /** Il termine di paragone, se il documento lo dà ("BE 3,43", "era 3,83"). */
    confronto: string | null;
    verso: "buono" | "cattivo" | "neutro";
  }[];
  findings: {
    priorita: "P0" | "P1" | "P2";
    titolo: string;
    dettaglio: string;
    /** Nomi ESATTI delle campagne citate, come compaiono sulla piattaforma. */
    campagne: string[];
  }[];
  azioni: {
    codice: string | null;
    testo: string;
    priorita: "P0" | "P1" | "P2";
    quando: string | null;
  }[];
  campagne: {
    /** Nome ESATTO della campagna sulla piattaforma. */
    nome: string;
    verdetto: VerdettoScheda;
    /** Una riga: cosa dice l'analisi di QUESTA campagna. */
    nota: string;
  }[];
  nonCoperto: string[];
};

const SCHEMA_SCHEDA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["verdetto", "titolo", "sintesi", "periodo", "kpi", "findings", "azioni", "campagne", "nonCoperto"],
  properties: {
    verdetto: { type: "string", enum: ["rosso", "giallo", "verde"] },
    titolo: { type: "string", maxLength: 140 },
    sintesi: { type: "string", maxLength: 900 },
    periodo: { type: ["string", "null"], maxLength: 80 },
    kpi: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["etichetta", "valore", "confronto", "verso"],
        properties: {
          etichetta: { type: "string", maxLength: 60 },
          valore: { type: "string", maxLength: 40 },
          confronto: { type: ["string", "null"], maxLength: 80 },
          verso: { type: "string", enum: ["buono", "cattivo", "neutro"] },
        },
      },
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["priorita", "titolo", "dettaglio", "campagne"],
        properties: {
          priorita: { type: "string", enum: ["P0", "P1", "P2"] },
          titolo: { type: "string", maxLength: 120 },
          dettaglio: { type: "string", maxLength: 400 },
          campagne: { type: "array", items: { type: "string", maxLength: 120 } },
        },
      },
    },
    azioni: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["codice", "testo", "priorita", "quando"],
        properties: {
          codice: { type: ["string", "null"], maxLength: 20 },
          testo: { type: "string", maxLength: 300 },
          priorita: { type: "string", enum: ["P0", "P1", "P2"] },
          quando: { type: ["string", "null"], maxLength: 40 },
        },
      },
    },
    campagne: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nome", "verdetto", "nota"],
        properties: {
          nome: { type: "string", maxLength: 120 },
          verdetto: { type: "string", enum: ["rosso", "giallo", "verde"] },
          nota: { type: "string", maxLength: 240 },
        },
      },
    },
    nonCoperto: { type: "array", items: { type: "string", maxLength: 160 } },
  },
};

const ISTRUZIONI = `Sei il lettore delle analisi pubblicitarie di Deluxy. Ricevi il testo completo
di un'analisi depositata su Drive (markdown, spesso con tabelle) e la restituisci
come SCHEDA strutturata, in ITALIANO, per una pagina che la renderà grafica.

Regole, nell'ordine in cui contano:
1. NON INVENTARE. Ogni numero, priorità e nome viene dal documento. Se il
   documento non dà un'informazione, il campo è null o la lista è vuota.
2. Il VERDETTO segue il documento quando lo dichiara (ROSSO/GIALLO/VERDE, o
   esiti equivalenti). Se non lo dichiara: rosso = problemi che chiedono un
   intervento immediato; giallo = gap da chiudere non bloccanti; verde = niente
   di bloccante.
3. I KPI sono i numeri che decidono il verdetto (max 8, i più importanti prima):
   valore com'è scritto nel documento, confronto = il termine di paragone che il
   documento stesso usa (break-even, benchmark, periodo precedente). "verso" dice
   se quel numero è una buona o cattiva notizia PER NOI.
4. I FINDINGS mantengono la priorità del documento (P0/P1/P2); se il documento
   usa un'altra scala, traducila (bloccante→P0, importante→P1, igiene→P2).
5. I nomi delle campagne vanno ESATTI, carattere per carattere, come compaiono
   sulla piattaforma (es. "[Deluxyflowers] - WORLD - ENG"): servono ad agganciare
   le schede campagna. Niente parafrasi, niente maiuscole cambiate.
6. In "campagne" metti OGNI campagna di cui il documento dice qualcosa di
   specifico, con verdetto e una riga di nota: è quello che la scheda campagna
   mostrerà accanto al bottone ANALISI.
7. "nonCoperto": cosa il documento dichiara di NON aver potuto verificare.
8. Scrivi conciso: la scheda si legge in un minuto, il documento resta su Drive.`;

export type EsitoElaborazione =
  | { ok: true; verdetto: VerdettoScheda; kpi: number; findings: number; campagne: number }
  | { ok: false; errore: string };

/** La scheda parsata di una riga Analisi, o null se non c'è / è illeggibile. */
export function schedaDi(analisi: { scheda: string | null }): Scheda | null {
  if (!analisi.scheda) return null;
  try {
    const s = JSON.parse(analisi.scheda) as Scheda;
    return s && typeof s === "object" && s.verdetto ? s : null;
  } catch {
    return null;
  }
}

/**
 * Rielabora UN'analisi: legge il documento completo (disco o API Drive),
 * lo passa all'AI con lo schema vincolante, salva la scheda.
 *
 * ⚠️ Il verdetto aggiorna anche `esito` (il semaforo storico degli elenchi)
 * SOLO se `esito` è vuoto: un esito dichiarato da chi ha depositato non si
 * sovrascrive con una lettura automatica.
 */
export async function elaboraAnalisi(analisiId: string): Promise<EsitoElaborazione> {
  const analisi = await prisma.analisi.findUnique({ where: { id: analisiId } });
  if (!analisi) return { ok: false, errore: "Analisi non trovata." };
  if (!analisi.fileDrive) {
    return { ok: false, errore: "Questa analisi non ha un documento su Drive: non c'è niente da rielaborare." };
  }

  const doc = await testoDocumento(analisi.fileDrive);
  if (!doc.ok) return { ok: false, errore: doc.errore };
  // I documenti sono ~30 KB; il taglio è un paracadute, non la norma. Se
  // scatta si dice, perché una scheda da mezzo documento non è una scheda.
  const LIMITE = 120_000;
  const tagliato = doc.testo.length > LIMITE;
  const testo = tagliato ? doc.testo.slice(0, LIMITE) : doc.testo;

  const risposta = await chiediAllAi({
    istruzioni: ISTRUZIONI + (tagliato ? "\n\nATTENZIONE: il documento è stato TRONCATO a 120.000 caratteri: dillo nella sintesi." : ""),
    dati: {
      titolo: analisi.titolo,
      tipo: analisi.tipo,
      brand: analisi.brand,
      canale: analisi.canale,
      dataAnalisi: analisi.dataAnalisi,
      documento: testo,
    },
    schema: SCHEMA_SCHEDA,
    massimoToken: 8000,
  });
  if (!risposta.ok) return { ok: false, errore: risposta.errore };

  let scheda: Scheda;
  try {
    scheda = JSON.parse(risposta.testo) as Scheda;
  } catch {
    return { ok: false, errore: "L'AI ha risposto fuori schema: JSON illeggibile." };
  }
  if (!["rosso", "giallo", "verde"].includes(scheda.verdetto)) {
    return { ok: false, errore: `Verdetto fuori catalogo: ${String(scheda.verdetto)}` };
  }

  const ESITO_DA_VERDETTO: Record<VerdettoScheda, string> = {
    rosso: "critico",
    giallo: "attenzione",
    verde: "ok",
  };
  await prisma.analisi.update({
    where: { id: analisi.id },
    data: {
      scheda: JSON.stringify(scheda),
      verdetto: scheda.verdetto,
      elaborataIl: new Date(),
      elaborataCon: `${risposta.fornitore}/${risposta.modello}`,
      ...(analisi.esito ? {} : { esito: ESITO_DA_VERDETTO[scheda.verdetto] }),
    },
  });
  return {
    ok: true,
    verdetto: scheda.verdetto,
    kpi: scheda.kpi.length,
    findings: scheda.findings.length,
    campagne: scheda.campagne.length,
  };
}

/**
 * Rielabora le analisi che non hanno ancora una scheda, le più recenti prima.
 * La chiama il cron di Drive dopo la sync: `limite` basso apposta — ogni
 * elaborazione è una chiamata AI da ~30-60 s e la funzione ha un tetto.
 */
export async function elaboraNonElaborate(limite = 2): Promise<{
  elaborate: number;
  fallite: { titolo: string; errore: string }[];
}> {
  const daFare = await prisma.analisi.findMany({
    where: {
      scheda: null,
      fileDrive: { not: null },
      // Solo testo: un .xlsx non si manda a un modello come stringa.
      OR: [{ fileDrive: { endsWith: ".md" } }, { fileDrive: { endsWith: ".txt" } }],
    },
    orderBy: { dataAnalisi: "desc" },
    take: limite,
    select: { id: true, titolo: true },
  });

  let elaborate = 0;
  const fallite: { titolo: string; errore: string }[] = [];
  for (const a of daFare) {
    const esito = await elaboraAnalisi(a.id);
    if (esito.ok) elaborate++;
    else fallite.push({ titolo: a.titolo, errore: esito.errore });
  }
  return { elaborate, fallite };
}

// ---------- L'aggancio fra i nomi CITATI e le campagne VERE ----------

// I documenti abbreviano: «WORLD-ENG» per «[Deluxyflowers] - WORLD - ENG»,
// «[Palloncini] AWARENESS» per «[Palloncini] - AWARENESS». L'AI ha l'ordine di
// copiare esatto — e copia esatto QUELLO CHE C'È SCRITTO, che è già corto.
// Il confronto quindi si fa su una forma normalizzata (solo lettere e cifre):
// il nome vero della campagna deve CONTENERE il citato, o viceversa.
//
// ⚠️ «Cercare non è affermare»: un contenimento che combacia su DUE campagne
// non è un aggancio, è un'ambiguità — e un'ambiguità agganciata a caso manda
// il lettore sulla campagna sbagliata con l'aria di saperlo. Il candidato dev'
// essere UNO: se sono di più, niente link, e il chip resta grigio.
export function normalizzaNome(nome: string): string {
  return nome.toLowerCase().replace(/[^a-z0-9à-ù]+/g, "");
}

function combacia(citato: string, vero: string): boolean {
  const c = normalizzaNome(citato);
  const v = normalizzaNome(vero);
  if (!c || !v) return false;
  if (c === v) return true;
  // Sotto le 6 lettere il contenimento pesca troppo («ita», «eng»).
  if (c.length < 6) return false;
  return v.includes(c) || c.includes(v);
}

/**
 * Da nomi citati a campagne vere, per un'analisi di quel brand/canale.
 * Restituisce solo gli agganci NON ambigui.
 */
export async function mappaCampagneCitate(
  nomi: string[],
  filtro: { brand: string; canale: string | null }
): Promise<Map<string, { id: string; nome: string }>> {
  const mappa = new Map<string, { id: string; nome: string }>();
  if (nomi.length === 0) return mappa;
  // I candidati sono le campagne del mondo di cui l'analisi parla: senza il
  // filtro, «Brand protection» citata in un'analisi Flowers combacerebbe
  // anche con quelle di Gifts e Cake.
  const candidate = await prisma.campagna.findMany({
    where: {
      ...(filtro.canale ? { canale: filtro.canale } : {}),
      ...(filtro.brand !== "cross" ? { brand: filtro.brand } : {}),
    },
    select: { id: true, nome: true, nomeVisibile: true },
  });
  for (const citato of nomi) {
    // Due livelli: prima l'uguaglianza esatta (normalizzata), poi il
    // contenimento. «VENDITE» citata combacia per contenimento con nove
    // campagne che hanno 'vendite' nel nome — ma UNA si chiama proprio così,
    // e l'esatto vince sull'ambiguo.
    const esatte = candidate.filter(
      (c) =>
        normalizzaNome(c.nome) === normalizzaNome(citato) ||
        (c.nomeVisibile ? normalizzaNome(c.nomeVisibile) === normalizzaNome(citato) : false)
    );
    const trovate =
      esatte.length > 0
        ? esatte
        : candidate.filter(
            (c) => combacia(citato, c.nome) || (c.nomeVisibile ? combacia(citato, c.nomeVisibile) : false)
          );
    if (trovate.length === 1) mappa.set(citato, { id: trovate[0].id, nome: trovate[0].nome });
  }
  return mappa;
}

/**
 * L'analisi più recente che parla di QUESTA campagna: è quello che il bottone
 * ANALISI sulla scheda campagna apre.
 *
 * Prima si cerca una scheda che NOMINI la campagna (nome di piattaforma o nome
 * visibile), perché lì c'è anche la nota specifica; se nessuna la nomina, si
 * ripiega sull'ultima analisi elaborata dello stesso brand+canale — che parla
 * comunque del suo mondo. `null` = nessuna analisi utile, e il bottone non
 * compare: un bottone che apre una pagina a caso insegna a non premerlo.
 */
export async function ultimaAnalisiPerCampagna(campagna: {
  nome: string;
  nomeVisibile?: string | null;
  brand: string;
  canale: string;
}): Promise<{
  id: string;
  verdetto: VerdettoScheda;
  dataAnalisi: Date;
  titolo: string;
  perCampagna: Scheda["campagne"][number] | null;
} | null> {
  const recenti = await prisma.analisi.findMany({
    where: {
      scheda: { not: null },
      brand: { in: [campagna.brand, "cross"] },
      OR: [{ canale: campagna.canale }, { canale: null }],
    },
    orderBy: { dataAnalisi: "desc" },
    take: 12,
    select: { id: true, titolo: true, dataAnalisi: true, scheda: true, verdetto: true },
  });
  if (recenti.length === 0) return null;

  const nomi = [campagna.nome, campagna.nomeVisibile ?? ""].filter(Boolean);

  for (const a of recenti) {
    const s = schedaDi(a);
    if (!s) continue;
    const voce = s.campagne.find((c) => nomi.some((n) => combacia(c.nome, n)));
    if (voce) {
      return { id: a.id, verdetto: s.verdetto, dataAnalisi: a.dataAnalisi, titolo: a.titolo, perCampagna: voce };
    }
  }
  const prima = recenti.find((a) => schedaDi(a));
  if (!prima) return null;
  const s = schedaDi(prima)!;
  return { id: prima.id, verdetto: s.verdetto, dataAnalisi: prima.dataAnalisi, titolo: prima.titolo, perCampagna: null };
}

export const COLORE_VERDETTO: Record<VerdettoScheda, string> = {
  rosso: "var(--red)",
  giallo: "var(--orange)",
  verde: "var(--green)",
};
export const ETICHETTA_VERDETTO: Record<VerdettoScheda, string> = {
  rosso: "Rosso",
  giallo: "Giallo",
  verde: "Verde",
};
export const COLORE_PRIORITA: Record<"P0" | "P1" | "P2", string> = {
  P0: "var(--red)",
  P1: "var(--orange)",
  P2: "var(--text-tertiary)",
};
