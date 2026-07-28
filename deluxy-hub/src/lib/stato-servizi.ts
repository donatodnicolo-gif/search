import { catalogoApp, type AppDeluxy } from "./apps";

// Controllo di stato di ogni app del catalogo. Il Hub non conosce i database
// altrui: interroga un health-check che ogni app espone su di sé. Convenzione
// (standard Deluxy): GET /api/health pubblico, no-store, risponde
//   { ok: true, app: "<id>", database: boolean }
// dove `database` è il risultato di una query banale (SELECT 1). Se un'app non
// ha ancora l'endpoint, ripieghiamo su /api/v1/health (alcune ce l'hanno già) e
// infine sulla semplice raggiungibilità del server.

export type StatoDb = "ok" | "ko" | "n-d";
export type StatoServer = "su" | "giu";

export type StatoServizio = {
  id: string;
  nome: string;
  sottotitolo: string;
  url: string;
  server: StatoServer;
  database: StatoDb;
  dettaglio: string;
  latenzaMs: number | null;
};

const TIMEOUT_MS = 6000;

function fetchConTimeout(url: string, opt: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...opt, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
}

// Prova un health-check JSON. Ritorna null quando l'endpoint non è un health
// pubblico (404, redirect al login, risposta non-JSON): così il chiamante
// ripiega sull'endpoint successivo o sulla raggiungibilità.
async function provaHealth(
  base: string,
  path: string,
): Promise<{ database: StatoDb; dettaglio: string } | null> {
  try {
    const r = await fetchConTimeout(base + path, { redirect: "manual" });
    // Un redirect (tipico 307 verso /login) vuol dire che quel percorso è
    // protetto: non è un health pubblico, ripieghiamo.
    if (r.status >= 300 && r.status < 400) return null;
    if (r.status !== 200) return null;
    if (!(r.headers.get("content-type") ?? "").includes("application/json")) return null;
    const dati = (await r.json().catch(() => null)) as
      | { ok?: boolean; database?: boolean; scrivibile?: boolean | null; avviso?: string }
      | null;
    // `ok: false` NON è una risposta da scartare: è un'app che sta dicendo di
    // stare male, ed è esattamente ciò che questa pagina deve mostrare. Si
    // ripiega solo quando manca il campo `ok`, cioè quando non è un health.
    if (!dati || typeof dati.ok !== "boolean") return null;

    const database: StatoDb =
      typeof dati.database === "boolean" ? (dati.database ? "ok" : "ko") : "n-d";

    // Un database che risponde ma non accetta scritture è comunque guasto: con
    // Supabase succede quando il progetto va in sola lettura (spazio esaurito),
    // e l'app sembra viva mentre non salva più niente.
    const soloLettura = database === "ok" && dati.scrivibile === false;

    const dettaglio =
      dati.avviso ??
      (database === "ko"
        ? "il database non risponde"
        : soloLettura
          ? "database in sola lettura: l'app legge ma non salva"
          : dati.ok === false
            ? "l'app segnala un problema"
            : "");

    return { database: soloLettura ? "ko" : database, dettaglio };
  } catch {
    return null;
  }
}

// Il server sta rispondendo? Qualsiasi status < 500 (anche 307 verso il login o
// 401) significa che il processo è vivo e serve richieste. Solo timeout, errore
// di rete o 5xx contano come "giù".
async function raggiungibile(url: string): Promise<{ server: StatoServer; dettaglio: string }> {
  try {
    const r = await fetchConTimeout(url, { redirect: "manual" });
    if (r.status > 0 && r.status < 500) return { server: "su", dettaglio: "" };
    return { server: "giu", dettaglio: `il server ha risposto ${r.status}` };
  } catch {
    return { server: "giu", dettaglio: "nessuna risposta dal server (timeout o rete)" };
  }
}

async function controlla(app: AppDeluxy): Promise<StatoServizio> {
  const inizio = Date.now();
  const base = app.url.replace(/\/+$/, "");

  const esito = (await provaHealth(base, "/api/health")) ?? (await provaHealth(base, "/api/v1/health"));
  if (esito) {
    return {
      id: app.id,
      nome: app.nome,
      sottotitolo: app.sottotitolo,
      url: app.url,
      server: "su",
      database: esito.database,
      dettaglio: esito.dettaglio,
      latenzaMs: Date.now() - inizio,
    };
  }

  const r = await raggiungibile(base);
  return {
    id: app.id,
    nome: app.nome,
    sottotitolo: app.sottotitolo,
    url: app.url,
    server: r.server,
    database: "n-d",
    dettaglio:
      r.dettaglio || (r.server === "su" ? "raggiungibile (health-check non ancora implementato)" : ""),
    latenzaMs: r.server === "su" ? Date.now() - inizio : null,
  };
}

// Controlla tutte le app in parallelo. Ogni controllo ha il suo timeout, quindi
// l'intera pagina si carica al più nel tempo del controllo più lento.
export async function statoServizi(): Promise<StatoServizio[]> {
  return Promise.all(catalogoApp().map(controlla));
}
