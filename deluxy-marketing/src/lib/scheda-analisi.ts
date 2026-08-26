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
     * L'azione TRADOTTA nelle operazioni che l'app sa mettere in coda — UNA
     * PER CAMPAGNA: «togli il claim dalle 4 campagne» sono quattro operazioni,
     * non una (lezione del 26/08: la mappa a operazione singola copriva una
     * campagna sola e l'utente se n'è accorto). Vuoto = non eseguibile da qui.
     * L'AI PROPONE la traduzione: la catena resta app → coda → approvazione
     * → script, come per le PropostaAi. Nessuna scorciatoia.
     */
    operazioni?: {
      tipo: string;
      /** Nome della campagna come CITATO nel documento (si aggancia dopo). */
      campagna: string;
      /** I parametri dell'operazione, come stringa JSON. */
      parametriJson: string | null;
    }[] | null;
    /**
     * L'INDICE del finding a cui questa azione risponde, `null` se nessuno.
     * Prima il legame si deduceva dalla citazione del codice nel testo del
     * finding — e la #50 (budget ITA) non compariva sotto F5 (ITA strozzata
     * dal budget) perché F5 non la cita. Il legame lo sa chi ha scritto
     * entrambi: l'AI, al momento dell'elaborazione.
     */
    finding?: number | null;
    /** La forma vecchia, a operazione singola: le schede già salvate ce l'hanno. */
    operazione?: {
      tipo: string;
      campagna: string;
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
        required: ["codice", "testo", "priorita", "quando", "operazioni", "finding"],
        properties: {
          codice: { type: ["string", "null"], maxLength: 20 },
          testo: { type: "string", maxLength: 300 },
          priorita: { type: "string", enum: ["P0", "P1", "P2"] },
          quando: { type: ["string", "null"], maxLength: 40 },
          finding: { type: ["integer", "null"] },
          operazioni: {
            type: "array",
            items: {
              type: "object",
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
9. OGNI azione porta "finding": l'INDICE (da 0) del finding di QUESTA scheda a
   cui risponde, null se non risponde a un finding preciso. E porta
   "operazioni": le traduzioni in operazioni che l'app sa mettere in coda —
   **UNA PER CAMPAGNA**: se l'azione tocca quattro campagne sono quattro
   operazioni. Mappa SOLO ciò per cui il documento dà tutto — la campagna e i
   parametri esatti; le campagne che il documento nomina senza dare i testi o i
   numeri NON si mappano. Un aumento di budget con la percentuale e la base nel
   documento ("+20% da 28,75") È mappabile: il conto è del documento, non tuo.
   Se il documento dà una FORBICE esplicita («da 10 a 12-13 €/g»), mappa
   l'estremo BASSO della forbice: è il passo prudente, e il numero è del
   documento. Tipi e parametri (parametriJson è una stringa JSON):
     · pausa_campagna / attiva_campagna → parametriJson null
     · budget → {"budget": <euro al giorno, numero>}. Se l'azione chiede uno
       SCALINO/aumento di budget SENZA dare l'importo ma il documento dà il
       budget ATTUALE, mappa il +20%: è lo scalino ordinario del change
       control di casa (doc 11, banda 20-30%, si prende il passo prudente) —
       il conto viene dalla regola, non è inventato. Arrotonda ai 10 centesimi.
     · negativa → {"testo":"...","corrispondenza":"exact|phrase|broad"}
     · nuova_keyword → {"testo":"...","corrispondenza":"exact|phrase|broad"}
     · estensione → {"tipo":"sitelink","testo":"...","url":"..."} oppure
       {"tipo":"callout","testo":"..."}
     · rimuovi_estensione → {"tipo":"sitelink|callout|snippet","testo":"..."} —
       ⚠️ il testo è il TITOLO del link, non quello che c'è scritto dentro: se
       il documento identifica il claim dal CONTENUTO («sitelink White-glove»),
       quasi sempre è la descrizione → usa {"tipo":"sitelink","descrizione":"..."}
       SENZA testo, e lo script lo trova su campagna, gruppi e account
   Tutto il resto (creativi, annunci, pubblici, ad set Meta, tracciamento,
   ristrutturazioni) NON si mappa: operazione = null. MAI inventare un numero
   o un testo che il documento non dà: meglio null di un parametro plausibile.
10. LA SCHEDA SI LEGGE SENZA IL DOCUMENTO. Ogni sigla interna (M-N4, A9-cr,
   #26, «doc 6 §4.5»…) va SPIEGATA in parole nel testo dell'azione la prima
   volta che compare: «dopo M-N4» non dice niente a chi guarda la pagina —
   «dopo il consolidamento del retargeting (M-N4)» sì. Il campo "quando" è
   una DATA o una condizione in parole semplici, mai una sigla nuda.
11. Scrivi conciso: la scheda si legge in un minuto, il documento resta su Drive.`;

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

  // ⚠️ IL CENSIMENTO ASSET ENTRA NEL PAYLOAD (26/08/2026). Il documento
  // spesso indica un claim su più campagne SENZA dare i titoli esatti («6
  // sitelink same-day su 4 campagne») — e la mappa, vincolata a non
  // inventare, produceva un'operazione sola. I titoli veri l'app li ha già:
  // il censimento che arriva da Google. Si passano all'AI, che traduce il
  // claim in operazioni per campagna usando titoli REALI, non inventati.
  // Solo Google (le estensioni sono sue) e solo per i brand veri.
  let assetCensiti: { campagna: string; tipo: string; testo: string }[] = [];
  if (analisi.brand !== "cross" && (analisi.canale == null || analisi.canale === "google_ads")) {
    const campagneAccese = await prisma.campagna.findMany({
      where: { brand: analisi.brand, canale: "google_ads", statoPiattaforma: "ENABLED" },
      select: { nome: true },
    });
    assetCensiti = (
      await prisma.copyAnnuncio.findMany({
        where: {
          brand: analisi.brand,
          tipo: { in: ["sitelink", "callout"] },
          statoPiattaforma: "ENABLED",
          campagna: { in: campagneAccese.map((c) => c.nome) },
        },
        select: { campagna: true, tipo: true, testo: true },
        take: 80,
      })
    ).map((a) => ({ campagna: a.campagna, tipo: a.tipo, testo: a.testo }));
  }

  const risposta = await chiediAllAi({
    istruzioni:
      ISTRUZIONI +
      (assetCensiti.length > 0
        ? "\n\nNOTA su assetCensiti: è il censimento VERO degli asset attivi (sitelink e callout letti da Google dall'app, per campagna). Quando il documento chiede di rimuovere un claim su più campagne SENZA dare i titoli esatti, traduci in operazioni rimuovi_estensione per campagna usando i titoli del censimento — SOLO dove il titolo corrisponde chiaramente al claim (es. same-day → «Consegna Oggi», «Delivery Today»). Il censimento è settimanale e può essere indietro: un asset appena rimosso può ancora comparirci — mappalo lo stesso, il dedupe dell'app lo riconosce."
        : "") +
      (tagliato ? "\n\nATTENZIONE: il documento è stato TRONCATO a 120.000 caratteri: dillo nella sintesi." : ""),
    dati: {
      titolo: analisi.titolo,
      tipo: analisi.tipo,
      brand: analisi.brand,
      canale: analisi.canale,
      dataAnalisi: analisi.dataAnalisi,
      documento: testo,
      ...(assetCensiti.length > 0 ? { assetCensiti } : {}),
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
      // ⚠️ La riconciliazione parla per INDICI di azione: una scheda nuova li
      // rimescola, e una riconciliazione vecchia su indici nuovi direbbe il
      // falso con l'aria di saperlo. Si azzera, il giro dopo la rifà.
      riconciliazione: null,
      riconciliataIl: null,
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

/**
 * Il verdetto d'analisi per OGNI campagna di un elenco, in un giro solo.
 *
 * È `ultimaAnalisiPerCampagna` pensata per la pagina /campagne: là una query
 * per card sarebbero cento query, qui le analisi si caricano UNA volta e il
 * confronto dei nomi gira in memoria. Stesse regole della gemella: prima la
 * scheda che NOMINA la campagna (lì c'è la nota specifica), altrimenti
 * l'ultima analisi di brand+canale — che parla comunque del suo mondo — e
 * vale per OGNI canale, Meta compreso: le schede Meta esistono dal 25/08.
 */
export async function mappaAnalisiPerCampagne(
  campagne: { id: string; nome: string; nomeVisibile?: string | null; brand: string; canale: string }[]
): Promise<
  Map<string, { analisiId: string; verdetto: VerdettoScheda; titolo: string; dataAnalisi: Date; nota: string | null; nominata: boolean }>
> {
  const esito = new Map<
    string,
    { analisiId: string; verdetto: VerdettoScheda; titolo: string; dataAnalisi: Date; nota: string | null; nominata: boolean }
  >();
  if (campagne.length === 0) return esito;
  const recenti = await prisma.analisi.findMany({
    where: { scheda: { not: null } },
    orderBy: { dataAnalisi: "desc" },
    take: 40,
    select: { id: true, titolo: true, dataAnalisi: true, scheda: true, brand: true, canale: true },
  });
  if (recenti.length === 0) return esito;
  // La scheda si rilegge una volta per analisi, non una per campagna.
  const lette = recenti
    .map((a) => ({ a, s: schedaDi(a) }))
    .filter((x): x is { a: (typeof recenti)[number]; s: Scheda } => x.s != null);

  for (const c of campagne) {
    const nomi = [c.nome, c.nomeVisibile ?? ""].filter(Boolean);
    const compatibili = lette.filter(
      ({ a }) => (a.brand === c.brand || a.brand === "cross") && (a.canale === c.canale || a.canale == null)
    );
    const nominata = compatibili.find(({ s }) => s.campagne.some((v) => nomi.some((n) => combacia(v.nome, n))));
    if (nominata) {
      const voce = nominata.s.campagne.find((v) => nomi.some((n) => combacia(v.nome, n)))!;
      esito.set(c.id, {
        analisiId: nominata.a.id,
        verdetto: voce.verdetto ?? nominata.s.verdetto,
        titolo: nominata.a.titolo,
        dataAnalisi: nominata.a.dataAnalisi,
        nota: voce.nota ?? null,
        nominata: true,
      });
    } else if (compatibili.length > 0) {
      const prima = compatibili[0];
      esito.set(c.id, {
        analisiId: prima.a.id,
        verdetto: prima.s.verdetto,
        titolo: prima.a.titolo,
        dataAnalisi: prima.a.dataAnalisi,
        nota: null,
        nominata: false,
      });
    }
  }
  return esito;
}

/**
 * TUTTE le note che le analisi hanno scritto su una campagna, con la loro
 * data — non solo l'ultima. È la storia dei giudizi esterni: la nota della
 * voce «campagne» della scheda, più i findings che la citano per nome.
 *
 * Solo le analisi che la NOMINANO: il ripiego «verdetto dell'insieme» qui
 * non entra — una sezione che ripetesse la stessa sintesi generica per ogni
 * campagna del brand sarebbe rumore, non storia.
 */
export async function noteAnalisiPerCampagna(campagna: {
  nome: string;
  nomeVisibile?: string | null;
  brand: string;
  canale: string;
}): Promise<
  {
    analisiId: string;
    titolo: string;
    dataAnalisi: Date;
    verdetto: VerdettoScheda;
    nota: string;
    findings: { priorita: "P0" | "P1" | "P2"; titolo: string; dettaglio: string }[];
  }[]
> {
  const recenti = await prisma.analisi.findMany({
    where: {
      scheda: { not: null },
      brand: { in: [campagna.brand, "cross"] },
      OR: [{ canale: campagna.canale }, { canale: null }],
    },
    orderBy: { dataAnalisi: "desc" },
    take: 12,
    select: { id: true, titolo: true, dataAnalisi: true, scheda: true },
  });
  const nomi = [campagna.nome, campagna.nomeVisibile ?? ""].filter(Boolean);
  const righe: Awaited<ReturnType<typeof noteAnalisiPerCampagna>> = [];
  for (const a of recenti) {
    const s = schedaDi(a);
    if (!s) continue;
    const voce = s.campagne.find((v) => nomi.some((n) => combacia(v.nome, n)));
    const findings = s.findings.filter((f) => f.campagne.some((cit) => nomi.some((n) => combacia(cit, n))));
    if (!voce && findings.length === 0) continue;
    righe.push({
      analisiId: a.id,
      titolo: a.titolo,
      dataAnalisi: a.dataAnalisi,
      verdetto: voce?.verdetto ?? s.verdetto,
      nota: voce?.nota ?? "",
      findings: findings.map((f) => ({ priorita: f.priorita, titolo: f.titolo, dettaglio: f.dettaglio })),
    });
  }
  return righe;
}

// ───── Le analisi STORICHE: superate da una più recente sullo stesso mondo ─────
//
// «Storica» è uno stato DERIVATO, mai scritto in tabella: appena si deposita
// l'analisi nuova le vecchie diventano storiche da sole, e se la nuova venisse
// tolta tornerebbero attuali. Un flag salvato invecchierebbe — è la stessa
// famiglia del riassunto d'handoff che resta indietro.
//
// Il «mondo» è brand+canale (stessa chiave dell'aggancio alle campagne).
// Solo una data STRETTAMENTE più recente supera: due analisi dello stesso
// giorno sono entrambe attuali — sceglierne una a caso sarebbe peggio.

// ⚠️ Si confronta il GIORNO, non il timestamp. `dataAnalisi` porta anche
// l'ora, e un'analisi RIDEPOSITATA in giornata crea due righe a poche ore di
// distanza: col confronto stretto la scheda risultava «superata» dal suo
// stesso doppione — trovato in produzione al primo giro («superata da» sé
// stessa, stesso titolo). Due righe dello stesso giorno sono la stessa
// stagione: nessuna delle due è storia dell'altra.
const giornoDi = (d: Date) => d.toISOString().slice(0, 10);

/** Per ogni analisi superata: chi la supera. In un giro solo, per gli elenchi. */
export async function mappaAnalisiStoriche(): Promise<
  Map<string, { id: string; titolo: string; dataAnalisi: Date }>
> {
  const tutte = await prisma.analisi.findMany({
    select: { id: true, brand: true, canale: true, dataAnalisi: true, titolo: true },
  });
  const chiave = (a: { brand: string; canale: string | null }) => `${a.brand}|${a.canale ?? "-"}`;
  const capofila = new Map<string, { id: string; titolo: string; dataAnalisi: Date }>();
  for (const a of tutte) {
    const c = capofila.get(chiave(a));
    if (!c || a.dataAnalisi > c.dataAnalisi) capofila.set(chiave(a), { id: a.id, titolo: a.titolo, dataAnalisi: a.dataAnalisi });
  }
  const storiche = new Map<string, { id: string; titolo: string; dataAnalisi: Date }>();
  for (const a of tutte) {
    const capo = capofila.get(chiave(a))!;
    if (capo.id !== a.id && giornoDi(capo.dataAnalisi) > giornoDi(a.dataAnalisi)) storiche.set(a.id, capo);
  }
  return storiche;
}

/** La singola: l'analisi più recente che supera QUESTA, o null se è attuale. */
export async function analisiCheSupera(a: {
  id: string;
  brand: string;
  canale: string | null;
  dataAnalisi: Date;
}): Promise<{ id: string; titolo: string; dataAnalisi: Date } | null> {
  // Dal primo istante del GIORNO DOPO: chi è dello stesso giorno non supera.
  const g = a.dataAnalisi;
  const giornoDopo = new Date(Date.UTC(g.getUTCFullYear(), g.getUTCMonth(), g.getUTCDate() + 1));
  return prisma.analisi.findFirst({
    where: { brand: a.brand, canale: a.canale, dataAnalisi: { gte: giornoDopo }, id: { not: a.id } },
    orderBy: { dataAnalisi: "desc" },
    select: { id: true, titolo: true, dataAnalisi: true },
  });
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

export type PropostaOperazione = { tipo: string; campagna: string; parametriJson: string | null };

/** Le proposte di un'azione, qualunque sia l'età della scheda (singola o multipla). */
export function proposteDi(azione: Scheda["azioni"][number]): PropostaOperazione[] {
  if (azione.operazioni && azione.operazioni.length > 0) return azione.operazioni;
  return azione.operazione ? [azione.operazione] : [];
}

/**
 * La proposta dell'AI, rivista dal codice. `null` = non si mette in coda
 * (tipo fuori catalogo, parametri malformati, o tipo non eseguibile sul
 * canale della campagna).
 */
export function operazioneDaProposta(
  op: PropostaOperazione | null | undefined,
  canaleCampagna: string
): OperazionePronta | null {
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
      if (!["sitelink", "callout", "snippet"].includes(t)) return null;
      // Il claim puo' stare nella DESCRIZIONE del sitelink, non nel titolo
      // (caso vero del 26/08: il link si chiamava «How it Works»): basta uno
      // dei due, e se ci sono entrambi lo script li esige entrambi.
      const haTesto = testoOk(par?.testo);
      const haDescr = t === "sitelink" && testoOk(par?.descrizione);
      if (!haTesto && !haDescr) return null;
      return {
        tipo: op.tipo,
        parametri: {
          tipo: t,
          ...(haTesto ? { testo: String(par!.testo).trim() } : {}),
          ...(haDescr ? { descrizione: String(par!.descrizione).trim() } : {}),
        },
      };
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
    case "rimuovi_estensione":
      // La rimozione può mirare alla DESCRIZIONE (il claim sta lì, il titolo
      // non si sa): l'etichetta lo dice, invece di stampare «undefined».
      return p.testo
        ? `Rimuovi ${p.tipo} «${p.testo}»`
        : `Rimuovi ${p.tipo} con descrizione «${p.descrizione}»`;
    default: return pronta.tipo;
  }
}

// ───── LA RICONCILIAZIONE: cosa risulta FATTO di quello che il report chiede ─────
//
// ⚠️ PERCHÉ (26/08/2026). Il report propone, la coda esegue — ma nessuno
// richiudeva il cerchio: il sitelink vietato è stato rimosso DAVVERO (esito
// «2 sitelink rimossi», 26/08 04:41) e la scheda continuava a proporlo come
// se niente fosse. Un'azione fatta che resta scritta «da fare» insegna a non
// leggere le azioni. L'incrocio lo fa l'AI perché il legame non è sempre
// letterale: la #17 è stata tentata due volte con parametri diversi, e solo
// la seconda è quella giusta — una JOIN non lo sa, un lettore sì.
//
// ⚠️ La riconciliazione dice quello che risulta DALLA CODA dell'app: un'azione
// fatta a mano in interfaccia resta «da fare» finché un censimento non la
// mostra. Meglio un «da fare» stantio che un «fatto» dedotto.

export type StatoAzioneRiconciliata = "fatta" | "in_corso" | "fallita" | "parziale" | "da_fare";

export type Riconciliazione = {
  azioni: {
    indice: number;
    stato: StatoAzioneRiconciliata;
    /** Gli id delle operazioni della coda che riguardano questa azione. */
    operazioni: string[];
    /** Una riga fattuale: cosa risulta, con esito e data quando ci sono. */
    nota: string;
  }[];
};

const SCHEMA_RICONCILIAZIONE: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["azioni"],
  properties: {
    azioni: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["indice", "stato", "operazioni", "nota"],
        properties: {
          indice: { type: "integer" },
          stato: { type: "string", enum: ["fatta", "in_corso", "fallita", "parziale", "da_fare"] },
          operazioni: { type: "array", items: { type: "string", maxLength: 40 } },
          nota: { type: "string", maxLength: 240 },
        },
      },
    },
  },
};

const ISTRUZIONI_RICONCILIAZIONE = `Sei il revisore della coda operazioni di Deluxy Marketing. Ricevi le AZIONI
proposte da un'analisi e le OPERAZIONI della coda (con stato ed esito) dello
stesso mondo. Per OGNI azione dici cosa risulta fatto, in ITALIANO.

Regole:
1. Collega un'operazione a un'azione SOLO se l'intento combacia davvero
   (stessa campagna o stesso oggetto, stesso scopo). Il legame può non essere
   letterale: un'azione tentata due volte con parametri diversi è la stessa
   azione. Nel dubbio, NON collegare.
2. stato:
   · "fatta" — almeno un'operazione ESEGUITA il cui esito conferma l'intento
     dell'azione (leggi l'esito, non solo lo stato).
   · "fallita" — l'ultimo tentativo è fallito e non ce n'è uno vivo in coda.
   · "in_corso" — c'è un'operazione in_attesa o approvata che la copre.
   · "parziale" — l'azione chiede più cose e solo alcune risultano eseguite.
   · "da_fare" — nessuna operazione la riguarda. È lo stato di default.
3. La nota è FATTUALE e cita l'esito e la data quando ci sono («2 sitelink
   rimossi il 26/08»). Niente giudizi, niente promesse.
4. "operazioni" contiene SOLO id presenti nell'elenco ricevuto.
5. La coda è dell'app: un'azione fatta a mano in interfaccia resta "da_fare"
   — non dedurre mai un fatto che la coda non mostra.`;

/**
 * Incrocia la scheda di un'analisi con la coda operazioni e salva il risultato.
 */
export async function riconciliaAnalisi(analisiId: string): Promise<
  { ok: true; fatte: number; inCorso: number; fallite: number } | { ok: false; errore: string }
> {
  const analisi = await prisma.analisi.findUnique({ where: { id: analisiId } });
  if (!analisi) return { ok: false, errore: "Analisi non trovata." };
  const scheda = schedaDi(analisi);
  if (!scheda) return { ok: false, errore: "Questa analisi non ha ancora una scheda." };
  if (scheda.azioni.length === 0) return { ok: false, errore: "La scheda non ha azioni da riconciliare." };

  // Le operazioni del suo mondo: quelle sulle campagne del brand, dalla
  // vigilia dell'analisi in poi, più quelle il cui motivo la cita.
  const dalGiorno = new Date(analisi.dataAnalisi.getTime() - 3 * 86_400_000);
  const operazioni = await prisma.operazioneAdv.findMany({
    where: {
      creataIl: { gte: dalGiorno },
      OR: [
        { campagnaId: { in: (await prisma.campagna.findMany({
            where: { brand: analisi.brand, ...(analisi.canale ? { canale: analisi.canale } : {}) },
            select: { id: true },
          })).map((c) => c.id) } },
        { motivo: { contains: analisi.titolo } },
      ],
    },
    orderBy: { creataIl: "desc" },
    take: 80,
    select: {
      id: true, tipo: true, bersaglio: true, parametri: true, stato: true,
      esito: true, motivo: true, creataIl: true, eseguitaIl: true,
    },
  });
  if (operazioni.length === 0) {
    // Niente coda = tutte da fare: non serve l'AI per dirlo, e si scrive
    // comunque, così la pagina sa che la riconciliazione è stata fatta.
    await prisma.analisi.update({
      where: { id: analisi.id },
      data: {
        riconciliazione: JSON.stringify({ azioni: [] } satisfies Riconciliazione),
        riconciliataIl: new Date(),
      },
    });
    return { ok: true, fatte: 0, inCorso: 0, fallite: 0 };
  }

  const risposta = await chiediAllAi({
    istruzioni: ISTRUZIONI_RICONCILIAZIONE,
    dati: {
      analisi: { titolo: analisi.titolo, data: analisi.dataAnalisi, brand: analisi.brand },
      azioni: scheda.azioni.map((a, indice) => ({
        indice,
        codice: a.codice,
        testo: a.testo,
        operazioneProposta: a.operazione,
      })),
      operazioni: operazioni.map((o) => ({
        id: o.id,
        tipo: o.tipo,
        bersaglio: o.bersaglio,
        parametri: o.parametri,
        stato: o.stato,
        esito: o.esito ? o.esito.slice(0, 240) : null,
        motivo: o.motivo ? o.motivo.slice(0, 160) : null,
        creataIl: o.creataIl,
        eseguitaIl: o.eseguitaIl,
      })),
    },
    schema: SCHEMA_RICONCILIAZIONE,
    massimoToken: 6000,
  });
  if (!risposta.ok) return { ok: false, errore: risposta.errore };

  let ric: Riconciliazione;
  try {
    ric = JSON.parse(risposta.testo) as Riconciliazione;
  } catch {
    return { ok: false, errore: "L'AI ha risposto fuori schema." };
  }
  // La revisione del codice: indici nel range, id solo fra quelli veri,
  // «da_fare» senza operazioni non si scrive (è il default, sarebbe rumore).
  const idVeri = new Set(operazioni.map((o) => o.id));
  ric.azioni = (ric.azioni ?? []).filter(
    (a) =>
      Number.isInteger(a.indice) &&
      a.indice >= 0 &&
      a.indice < scheda.azioni.length &&
      ["fatta", "in_corso", "fallita", "parziale", "da_fare"].includes(a.stato)
  );
  for (const a of ric.azioni) a.operazioni = (a.operazioni ?? []).filter((id) => idVeri.has(id));
  ric.azioni = ric.azioni.filter((a) => a.stato !== "da_fare" || a.operazioni.length > 0);

  await prisma.analisi.update({
    where: { id: analisi.id },
    data: { riconciliazione: JSON.stringify(ric), riconciliataIl: new Date() },
  });
  return {
    ok: true,
    fatte: ric.azioni.filter((a) => a.stato === "fatta").length,
    inCorso: ric.azioni.filter((a) => a.stato === "in_corso").length,
    fallite: ric.azioni.filter((a) => a.stato === "fallita").length,
  };
}

/** La riconciliazione parsata, o null. */
export function riconciliazioneDi(analisi: {
  riconciliazione: string | null;
}): Riconciliazione | null {
  if (!analisi.riconciliazione) return null;
  try {
    const r = JSON.parse(analisi.riconciliazione) as Riconciliazione;
    return r && Array.isArray(r.azioni) ? r : null;
  } catch {
    return null;
  }
}

/**
 * Riconcilia le schede recenti la cui coda è CAMBIATA dopo l'ultima
 * riconciliazione (o mai riconciliate). Le chiama il cron dopo le schede.
 */
export async function riconciliaRecenti(limite = 2): Promise<{ riconciliate: number; fallite: string[] }> {
  const candidate = await prisma.analisi.findMany({
    where: { scheda: { not: null }, dataAnalisi: { gte: new Date(Date.now() - 14 * 86_400_000) } },
    orderBy: { dataAnalisi: "desc" },
    take: 10,
    select: { id: true, titolo: true, brand: true, canale: true, riconciliataIl: true, dataAnalisi: true },
  });
  const daFare: typeof candidate = [];
  for (const a of candidate) {
    if (daFare.length >= limite) break;
    if (!a.riconciliataIl) { daFare.push(a); continue; }
    // La coda è cambiata dopo? Basta un'operazione del brand toccata dopo.
    const cambiata = await prisma.operazioneAdv.findFirst({
      where: {
        creataIl: { gte: new Date(a.dataAnalisi.getTime() - 3 * 86_400_000) },
        campagnaId: { in: (await prisma.campagna.findMany({
            where: { brand: a.brand, ...(a.canale ? { canale: a.canale } : {}) },
            select: { id: true },
          })).map((c) => c.id) },
        OR: [
          { creataIl: { gt: a.riconciliataIl } },
          { eseguitaIl: { gt: a.riconciliataIl } },
          { approvataIl: { gt: a.riconciliataIl } },
        ],
      },
      select: { id: true },
    });
    if (cambiata) daFare.push(a);
  }
  let riconciliate = 0;
  const fallite: string[] = [];
  for (const a of daFare) {
    const esito = await riconciliaAnalisi(a.id);
    if (esito.ok) riconciliate++;
    else fallite.push(`${a.titolo}: ${esito.errore}`);
  }
  return { riconciliate, fallite };
}

// ───── LE RISPOSTE: il canale di RITORNO verso i progetti di analisi ─────
//
// ⚠️ PERCHÉ (26/08/2026, richiesta utente). Le analisi propongono azioni;
// l'utente ne accoglie alcune e ne respinge altre — ma il rifiuto restava
// nella sua testa, e l'analisi successiva riproponeva le stesse cose. La
// risposta si scrive QUI e si DEPOSITA su Drive (ads\App Azioni\OUT -
// dall'app, come RISULTATI e APPEND): i progetti di analisi la leggono prima
// di scrivere il report nuovo — accolta si verifica, respinta non si
// ripropone senza fatti nuovi, rimandata torna alla sua data.

export type RispostaAzione = {
  /** accolta | respinta | rimandata */
  r: "accolta" | "respinta" | "rimandata";
  nota: string | null;
  quando: string; // ISO
};
export type Risposte = Record<string, RispostaAzione>;

export function risposteDi(analisi: { risposte: string | null }): Risposte {
  if (!analisi.risposte) return {};
  try {
    const r = JSON.parse(analisi.risposte) as Risposte;
    return r && typeof r === "object" ? r : {};
  } catch {
    return {};
  }
}

export const COLORE_RISPOSTA: Record<RispostaAzione["r"], string> = {
  accolta: "var(--green)",
  respinta: "var(--red)",
  rimandata: "var(--orange)",
};
export const ETICHETTA_RISPOSTA: Record<RispostaAzione["r"], string> = {
  accolta: "Accolta",
  respinta: "Respinta",
  rimandata: "Rimandata",
};

/**
 * Il file .md delle risposte, per la cartella OUT su Drive. Contiene TUTTE le
 * risposte correnti dell'analisi (non solo l'ultima): chi legge un file solo
 * ha il quadro intero, e i file precedenti diventano storia senza ambiguità.
 */
export function testoRisposteMd(
  analisi: { titolo: string; brand: string; fileDrive: string | null },
  scheda: Scheda,
  risposte: Risposte
): string {
  const righe: string[] = [];
  righe.push(`# RISPOSTE App — ${analisi.titolo}`);
  righe.push("");
  righe.push(
    `Fonte: le risposte dell'utente alle AZIONI PROPOSTE dall'analisi, date nell'app ` +
      `(deluxy-marketing.vercel.app). Documento analizzato: ${analisi.fileDrive ?? "—"}.`
  );
  righe.push("");
  righe.push(
    "⚠️ Come leggerle (per i progetti di analisi): **accolta** → verificarne " +
      "l'esecuzione al prossimo giro; **respinta** → NON riproporla senza fatti " +
      "nuovi, e se la si ripropone dire perché la risposta non regge più; " +
      "**rimandata** → ripresentarla alla data detta nella nota. Le azioni senza " +
      "risposta sono ancora in esame: proporle di nuovo è lecito."
  );
  righe.push("");
  righe.push("| Azione | Proposta | Risposta | Nota dell'utente | Quando |");
  righe.push("|---|---|---|---|---|");
  const pulisci = (t: string) => t.replace(/\|/g, "/").replace(/\s+/g, " ").trim();
  for (const [indice, r] of Object.entries(risposte)) {
    const az = scheda.azioni[Number(indice)];
    if (!az) continue;
    righe.push(
      `| ${az.codice ?? `az.${indice}`} | ${pulisci(az.testo).slice(0, 160)} | **${ETICHETTA_RISPOSTA[r.r].toUpperCase()}** | ${r.nota ? pulisci(r.nota).slice(0, 200) : "—"} | ${r.quando.slice(0, 16).replace("T", " ")} |`
    );
  }
  righe.push("");
  righe.push("*File scritto dall'app alla risposta dell'utente: è lo stato COMPLETO delle risposte a questa analisi (i file precedenti con lo stesso titolo sono superati).*");
  return righe.join("\n");
}

export const COLORE_STATO_RICONCILIATO: Record<StatoAzioneRiconciliata, string> = {
  fatta: "var(--green)",
  in_corso: "var(--blue)",
  fallita: "var(--red)",
  parziale: "var(--orange)",
  da_fare: "var(--text-tertiary)",
};
export const ETICHETTA_STATO_RICONCILIATO: Record<StatoAzioneRiconciliata, string> = {
  fatta: "✓ Fatta",
  in_corso: "In coda",
  fallita: "Fallita",
  parziale: "Parziale",
  da_fare: "Da fare",
};

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
