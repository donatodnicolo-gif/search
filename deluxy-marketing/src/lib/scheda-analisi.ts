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
    /**
     * L'azione TRADOTTA in un'operazione che l'app sa mettere in coda, quando
     * il documento dà tutto quello che serve (tipo, campagna, parametri).
     * `null` = non eseguibile da qui (creativi, pubblici, ristrutturazioni…).
     * L'AI PROPONE la traduzione: la catena resta app → coda → approvazione
     * → script, come per le PropostaAi. Nessuna scorciatoia.
     */
    operazione: {
      tipo: string;
      /** Nome della campagna come CITATO nel documento (si aggancia dopo). */
      campagna: string;
      /** I parametri dell'operazione, come stringa JSON. */
      parametriJson: string | null;
    } | null;
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
        required: ["codice", "testo", "priorita", "quando", "operazione"],
        properties: {
          codice: { type: ["string", "null"], maxLength: 20 },
          testo: { type: "string", maxLength: 300 },
          priorita: { type: "string", enum: ["P0", "P1", "P2"] },
          quando: { type: ["string", "null"], maxLength: 40 },
          operazione: {
            type: ["object", "null"],
            additionalProperties: false,
            required: ["tipo", "campagna", "parametriJson"],
            properties: {
              tipo: {
                type: "string",
                enum: [
                  "pausa_campagna",
                  "attiva_campagna",
                  "budget",
                  "negativa",
                  "nuova_keyword",
                  "estensione",
                  "rimuovi_estensione",
                ],
              },
              campagna: { type: "string", maxLength: 120 },
              parametriJson: { type: ["string", "null"], maxLength: 400 },
            },
          },
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
8. Se il documento è un AUDIT o una verifica (checklist, controlli su
   tracciamento, struttura account, asset, landing): i findings sono i
   CONTROLLI FALLITI, i KPI sono i conteggi e i punteggi che l'audit stesso
   dà (controlli passati/totali, score), e il verdetto è lo stato dell'ACCOUNT
   — non delle vendite. Un audit non giudica il ROAS: giudica la casa.
9. OGNI azione può portare "operazione": la traduzione in un'operazione che
   l'app sa mettere in coda. Mappala SOLO se il documento dà tutto — la
   campagna e i parametri esatti. Tipi e parametri (parametriJson è una
   stringa JSON):
     · pausa_campagna / attiva_campagna → parametriJson null
     · budget → {"budget": <euro al giorno, numero>}
     · negativa → {"testo":"...","corrispondenza":"exact|phrase|broad"}
     · nuova_keyword → {"testo":"...","corrispondenza":"exact|phrase|broad"}
     · estensione → {"tipo":"sitelink","testo":"...","url":"..."} oppure
       {"tipo":"callout","testo":"..."}
     · rimuovi_estensione → {"tipo":"sitelink|callout|snippet","testo":"..."}
   Tutto il resto (creativi, annunci, pubblici, ad set Meta, tracciamento,
   ristrutturazioni) NON si mappa: operazione = null. MAI inventare un numero
   o un testo che il documento non dà: meglio null di un parametro plausibile.
10. Scrivi conciso: la scheda si legge in un minuto, il documento resta su Drive.`;

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
    massimoToken: 12000,
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
  // ⚠️ MANCANTI e INVECCHIATE nella STESSA coda, ordinata per data dell'analisi.
  //
  // Prima le mancanti avevano precedenza assoluta — e con 80 analisi vecchie
  // mai elaborate, una scheda RECENTE invecchiata (il documento ridepositato
  // sullo stesso percorso: successo il 25/08, +20 minuti e +1.037 byte) non
  // sarebbe stata ripresa per settimane, restando a raccontare la versione di
  // prima in silenzio. La data dell'analisi decide: l'ultima lettura è quella
  // che si guarda, l'arretrato di luglio può aspettare il giro dopo.
  const [senzaScheda, giaElaborate] = await Promise.all([
    prisma.analisi.findMany({
      where: {
        scheda: null,
        fileDrive: { not: null },
        // Solo testo: un .xlsx non si manda a un modello come stringa.
        OR: [{ fileDrive: { endsWith: ".md" } }, { fileDrive: { endsWith: ".txt" } }],
      },
      orderBy: { dataAnalisi: "desc" },
      take: 30,
      select: { id: true, titolo: true, dataAnalisi: true },
    }),
    prisma.analisi.findMany({
      where: { scheda: { not: null }, elaborataIl: { not: null }, fileDrive: { not: null } },
      orderBy: { dataAnalisi: "desc" },
      take: 30,
      select: { id: true, titolo: true, dataAnalisi: true, fileDrive: true, elaborataIl: true },
    }),
  ]);

  // Una scheda è INVECCHIATA se il documento è stato modificato DOPO
  // l'elaborazione: `modificatoIl` dell'indice contro `elaborataIl`.
  const documenti = await prisma.documentoDrive.findMany({
    where: { percorso: { in: giaElaborate.map((a) => a.fileDrive!) } },
    select: { percorso: true, modificatoIl: true },
  });
  const modifica = new Map(documenti.map((d) => [d.percorso, d.modificatoIl]));
  const invecchiate = giaElaborate.filter((a) => {
    const mod = modifica.get(a.fileDrive!);
    return mod != null && a.elaborataIl != null && mod > a.elaborataIl;
  });

  const daFare = [...senzaScheda, ...invecchiate]
    .sort((a, b) => b.dataAnalisi.getTime() - a.dataAnalisi.getTime())
    .slice(0, limite);

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
): Promise<Map<string, { id: string; nome: string; canale: string }>> {
  const mappa = new Map<string, { id: string; nome: string; canale: string }>();
  if (nomi.length === 0) return mappa;
  // I candidati sono le campagne del mondo di cui l'analisi parla: senza il
  // filtro, «Brand protection» citata in un'analisi Flowers combacerebbe
  // anche con quelle di Gifts e Cake.
  const candidate = await prisma.campagna.findMany({
    where: {
      ...(filtro.canale ? { canale: filtro.canale } : {}),
      ...(filtro.brand !== "cross" ? { brand: filtro.brand } : {}),
    },
    select: { id: true, nome: true, nomeVisibile: true, canale: true },
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
    if (trovate.length === 1) mappa.set(citato, { id: trovate[0].id, nome: trovate[0].nome, canale: trovate[0].canale });
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

// ───── Le azioni della scheda che si possono METTERE IN CODA ─────
//
// L'AI propone la traduzione azione→operazione; qui il codice la RIVEDE:
// tipo nel catalogo, parametri con la forma giusta, e (a parte) campagna
// agganciata senza ambiguità. Una proposta che non passa non è un errore a
// schermo: è un'azione che resta solo testo, com'era prima.
const TIPI_MAPPABILI_GOOGLE = new Set([
  "pausa_campagna",
  "attiva_campagna",
  "budget",
  "negativa",
  "nuova_keyword",
  "estensione",
  "rimuovi_estensione",
]);
// Su Meta esegue l'app (non lo script): sa fare solo stato e budget.
const TIPI_MAPPABILI_META = new Set(["pausa_campagna", "attiva_campagna", "budget"]);

export type OperazionePronta = { tipo: string; parametri: Record<string, unknown> | null };

/**
 * La proposta dell'AI, rivista dal codice. `null` = non si mette in coda
 * (tipo fuori catalogo, parametri malformati, o tipo non eseguibile sul
 * canale della campagna).
 */
export function operazioneDaAzione(
  azione: Scheda["azioni"][number],
  canaleCampagna: string
): OperazionePronta | null {
  const op = azione.operazione;
  if (!op) return null;
  const catalogo = canaleCampagna === "meta_ads" ? TIPI_MAPPABILI_META : TIPI_MAPPABILI_GOOGLE;
  if (!catalogo.has(op.tipo)) return null;

  let par: Record<string, unknown> | null = null;
  if (op.parametriJson) {
    try {
      const p = JSON.parse(op.parametriJson) as Record<string, unknown>;
      if (p && typeof p === "object" && !Array.isArray(p)) par = p;
    } catch {
      return null;
    }
  }

  const testoOk = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  switch (op.tipo) {
    case "pausa_campagna":
    case "attiva_campagna":
      return { tipo: op.tipo, parametri: null };
    case "budget": {
      const b = Number(par?.budget);
      return b > 0 && Number.isFinite(b) ? { tipo: op.tipo, parametri: { budget: b } } : null;
    }
    case "negativa":
    case "nuova_keyword": {
      if (!testoOk(par?.testo)) return null;
      const corr = ["exact", "phrase", "broad"].includes(String(par?.corrispondenza))
        ? String(par?.corrispondenza)
        : "exact";
      return { tipo: op.tipo, parametri: { testo: String(par!.testo).trim(), corrispondenza: corr } };
    }
    case "estensione": {
      const t = String(par?.tipo ?? "");
      if (t === "sitelink" && testoOk(par?.testo) && testoOk(par?.url))
        return { tipo: op.tipo, parametri: { tipo: t, testo: String(par!.testo).trim(), url: String(par!.url).trim() } };
      if (t === "callout" && testoOk(par?.testo))
        return { tipo: op.tipo, parametri: { tipo: t, testo: String(par!.testo).trim() } };
      return null;
    }
    case "rimuovi_estensione": {
      const t = String(par?.tipo ?? "");
      if (["sitelink", "callout", "snippet"].includes(t) && testoOk(par?.testo))
        return { tipo: op.tipo, parametri: { tipo: t, testo: String(par!.testo).trim() } };
      return null;
    }
    default:
      return null;
  }
}

/** Com'è descritta l'operazione sul bottone, prima di premere. */
export function descriviOperazione(pronta: OperazionePronta): string {
  const p = pronta.parametri ?? {};
  switch (pronta.tipo) {
    case "pausa_campagna": return "Metti in pausa la campagna";
    case "attiva_campagna": return "Riattiva la campagna";
    case "budget": return `Budget a ${p.budget} €/g`;
    case "negativa": return `Escludi «${p.testo}» (${p.corrispondenza})`;
    case "nuova_keyword": return `Aggiungi keyword «${p.testo}»`;
    case "estensione": return `Aggiungi ${p.tipo} «${p.testo}»`;
    case "rimuovi_estensione": return `Rimuovi ${p.tipo} «${p.testo}»`;
    default: return pronta.tipo;
  }
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
