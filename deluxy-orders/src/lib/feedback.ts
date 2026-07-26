import { prisma } from "./db";

// Import dei FEEDBACK DEGLI ORDINI dal Customer Service (deluxy-messaging).
//
// Là dentro nascono due cose legate a un ordine, e restano distinte perché non
// valgono uguale:
//  - **reclami**: un problema (casistica, colpa, gravità, stato, esito). Fatto
//    operativo: cambia come si tratta quel cliente e quel fornitore.
//  - **voti**: il giudizio 1-5 di una persona su un valet o un partner. È
//    un'opinione, e senza numero d'ordine non viene nemmeno esportata.
//
// Qui si tiene una COPIA di sola lettura: la fonte resta il Customer Service.
// L'import è **incrementale** (`da` = ultimo aggiornamento importato) e
// **idempotente** (upsert su `idEsterno`): rilanciarlo non crea doppioni.
//
// LA REGOLA CHE CONTA — un feedback si attacca a un ordine solo se il numero lo
// identifica **senza ambiguità**. Lo stesso numero esiste su più negozi
// («#1234» c'è su deluxy.it e su cakedesign.me): attaccare il reclamo
// all'ordine sbagliato è peggio che lasciarlo scollegato. Quando non si può
// decidere, il feedback si importa comunque con `collegamento = ambiguo` o
// `non-trovato` e resta visibile nella pagina, non sparisce in silenzio.

export type Configurazione = { url: string; chiave: string };

// Dove sta il Customer Service e con che chiave si legge. Convenzione dei nomi:
// standard Deluxy §4.4 (`<APP>_URL`, `<APP>_API_KEY`).
export function configurazione(): Configurazione | null {
  const url = (process.env.MESSAGGI_URL ?? "").trim().replace(/\/$/, "");
  const chiave = (process.env.MESSAGGI_API_KEY ?? "").trim();
  if (!url || !chiave) return null;
  return { url, chiave };
}

type VoceApi = {
  id: string;
  ordine: { id: string | null; numero: string; negozio: string };
  cliente: { nome: string; email: string; telefono: string };
  casistica?: string;
  colpaTipo?: string;
  colpaNome?: string;
  gravita?: number;
  stato?: string;
  descrizione?: string;
  azioni?: string;
  esito?: string;
  risoltoIl?: string | null;
  voto?: number;
  testo?: string;
  origine?: string;
  soggettoTipo?: string;
  soggettoNome?: string;
  creatoIl: string;
  aggiornatoIl: string;
};

type RispostaApi = {
  page: number;
  limit: number;
  pagine: number;
  totali: { reclami: number; voti: number };
  reclami: VoceApi[];
  voti: VoceApi[];
};

export type EsitoImport = {
  letti: number;
  nuovi: number;
  aggiornati: number;
  collegati: number;
  scollegati: number;
  errore?: string;
};

// Il numero dell'ordine come lo scrive il Customer Service («1234», «#1234»,
// « #1234 ») e come sta qui («#1234»): si confronta la parte numerica.
function numeroPulito(numero: string): string {
  return numero.trim().replace(/^#/, "").trim();
}

// Trova l'ordine a cui appartiene un feedback. Torna anche COME l'ha trovato,
// perché «l'ho attaccato al numero, senza sapere il negozio» e «numero e
// negozio combaciano» non danno la stessa fiducia.
async function collegaOrdine(
  numero: string,
  negozio: string,
): Promise<{ ordineId: string | null; collegamento: string }> {
  const pulito = numeroPulito(numero);
  if (!pulito) return { ordineId: null, collegamento: "non-trovato" };

  // In Orders il numero è salvato con il cancelletto; si accettano entrambe le
  // forme perché nulla garantisce come lo scriva chi apre il reclamo.
  const candidati = await prisma.ordine.findMany({
    where: { OR: [{ numero: `#${pulito}` }, { numero: pulito }] },
    select: { id: true, brand: true },
  });
  if (candidati.length === 0) return { ordineId: null, collegamento: "non-trovato" };

  const marca = negozio.trim().toLowerCase();
  if (marca) {
    const perBrand = candidati.filter((c) => c.brand.toLowerCase() === marca);
    if (perBrand.length === 1) return { ordineId: perBrand[0].id, collegamento: "numero+brand" };
    if (perBrand.length > 1) return { ordineId: null, collegamento: "ambiguo" };
  }
  if (candidati.length === 1) return { ordineId: candidati[0].id, collegamento: "numero" };
  return { ordineId: null, collegamento: "ambiguo" };
}

// Da quando riprendere: l'ultimo aggiornamento già importato, meno un minuto di
// sovrapposizione (l'upsert è idempotente, quindi rileggere qualcosa non fa
// danno; perdersi una modifica sì).
async function daQuando(): Promise<string | undefined> {
  const ultimo = await prisma.feedbackOrdine.findFirst({
    orderBy: { aggiornatoIl: "desc" },
    select: { aggiornatoIl: true },
  });
  if (!ultimo) return undefined;
  return new Date(ultimo.aggiornatoIl.getTime() - 60_000).toISOString();
}

async function scarica(conf: Configurazione, page: number, da?: string): Promise<RispostaApi> {
  const p = new URLSearchParams({ page: String(page), limit: "200" });
  if (da) p.set("da", da);
  const res = await fetch(`${conf.url}/api/v1/feedback?${p}`, {
    headers: { "x-api-key": conf.chiave },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const testo = await res.text().catch(() => "");
    throw new Error(`Customer Service ha risposto ${res.status}${testo ? `: ${testo.slice(0, 200)}` : ""}`);
  }
  // Se la rotta non è pubblicata, il Customer Service manda al login e risponde
  // con una PAGINA: senza questo controllo l'errore sarebbe «Unexpected token
  // '<'», che non dice niente a nessuno.
  const tipo = res.headers.get("content-type") ?? "";
  if (!tipo.includes("application/json")) {
    throw new Error(
      `Il Customer Service ha risposto con una pagina (${tipo.split(";")[0] || "senza tipo"}) invece che con dati: ` +
        `di solito significa che /api/v1/feedback non è ancora pubblicato su ${conf.url}, oppure che l'URL non è quello giusto.`,
    );
  }
  return (await res.json()) as RispostaApi;
}

async function salva(voce: VoceApi, tipo: "reclamo" | "voto", esito: EsitoImport): Promise<void> {
  const { ordineId, collegamento } = await collegaOrdine(voce.ordine.numero, voce.ordine.negozio);
  const idEsterno = `${tipo}:${voce.id}`;

  const dati = {
    tipo,
    ordineId,
    ordineNumero: voce.ordine.numero ?? "",
    negozio: voce.ordine.negozio ?? "",
    collegamento,
    clienteNome: voce.cliente?.nome ?? "",
    clienteEmail: voce.cliente?.email ?? "",
    clienteTelefono: voce.cliente?.telefono ?? "",
    casistica: voce.casistica ?? "",
    colpaTipo: voce.colpaTipo ?? "",
    colpaNome: voce.colpaNome ?? "",
    gravita: voce.gravita ?? null,
    stato: voce.stato ?? "",
    descrizione: voce.descrizione || null,
    azioni: voce.azioni || null,
    esito: voce.esito || null,
    risoltoIl: voce.risoltoIl ? new Date(voce.risoltoIl) : null,
    voto: voce.voto ?? null,
    testo: voce.testo || null,
    origine: voce.origine || null,
    soggettoTipo: voce.soggettoTipo || null,
    soggettoNome: voce.soggettoNome || null,
    creatoIl: new Date(voce.creatoIl),
    aggiornatoIl: new Date(voce.aggiornatoIl),
  };

  const esistente = await prisma.feedbackOrdine.findUnique({ where: { idEsterno }, select: { id: true } });
  await prisma.feedbackOrdine.upsert({
    where: { idEsterno },
    create: { idEsterno, ...dati },
    update: dati,
  });

  esito.letti++;
  if (esistente) esito.aggiornati++;
  else esito.nuovi++;
  if (ordineId) esito.collegati++;
  else esito.scollegati++;

  // La traccia sull'ordine: chi guarda la storia dell'ordine deve vedere che il
  // Customer Service ci ha messo mano, senza aprire un'altra app.
  if (ordineId && !esistente) {
    await prisma.eventoOrdine.create({
      data: {
        ordineId,
        tipo: "feedback",
        descrizione:
          tipo === "reclamo"
            ? `Reclamo dal Customer Service: ${voce.casistica || "senza casistica"}${voce.gravita ? ` (gravità ${voce.gravita})` : ""}`
            : `Voto ${voce.voto}/5 dal Customer Service${voce.soggettoNome ? ` su ${voce.soggettoNome}` : ""}`,
        autore: "customer-service",
      },
    });
  }
}

// L'import vero e proprio. `completo` rilegge tutto dall'inizio (serve dopo aver
// cambiato le regole di collegamento: i feedback già importati si riattaccano
// agli ordini che nel frattempo sono arrivati).
export async function importaFeedback(completo = false): Promise<EsitoImport> {
  const esito: EsitoImport = { letti: 0, nuovi: 0, aggiornati: 0, collegati: 0, scollegati: 0 };
  const conf = configurazione();
  if (!conf) {
    esito.errore =
      "Customer Service non configurato: servono MESSAGGI_URL e MESSAGGI_API_KEY (la chiave si crea là con `npm run chiave -- deluxy-orders`).";
    return esito;
  }

  const da = completo ? undefined : await daQuando();

  try {
    let page = 1;
    let pagine = 1;
    do {
      const risposta = await scarica(conf, page, da);
      pagine = risposta.pagine;
      for (const r of risposta.reclami ?? []) await salva(r, "reclamo", esito);
      for (const v of risposta.voti ?? []) await salva(v, "voto", esito);
      page++;
    } while (page <= pagine && page <= 50); // 50 pagine = 10.000 voci: oltre, c'è un problema
  } catch (e) {
    esito.errore = (e as Error).message;
  }

  return esito;
}

// Riepilogo per la UI: quanti reclami aperti, quanti feedback in totale.
export async function riepilogoFeedback(): Promise<{
  reclami: number;
  reclamiAperti: number;
  voti: number;
  scollegati: number;
  ultimo: Date | null;
}> {
  const [reclami, reclamiAperti, voti, scollegati, ultimo] = await Promise.all([
    prisma.feedbackOrdine.count({ where: { tipo: "reclamo" } }),
    prisma.feedbackOrdine.count({ where: { tipo: "reclamo", stato: { in: ["aperto", "in_lavorazione"] } } }),
    prisma.feedbackOrdine.count({ where: { tipo: "voto" } }),
    prisma.feedbackOrdine.count({ where: { ordineId: null } }),
    prisma.feedbackOrdine.findFirst({ orderBy: { importatoIl: "desc" }, select: { importatoIl: true } }),
  ]);
  return { reclami, reclamiAperti, voti, scollegati, ultimo: ultimo?.importatoIl ?? null };
}
