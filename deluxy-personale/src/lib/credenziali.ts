// Le credenziali che QUESTA app usa per chiamare le altre (il token di AI Mail,
// la chiave di scrittura di Budgets) non abitano qui: vivono nella **cassaforte
// del Hub** — `GET /api/chiavi?progetto=personale`, cifrate AES-256-GCM, con lo
// STESSO token di servizio che già leggeva i cartellini.
//
// Perché non una cassaforte locale (verdetto del custode della sicurezza,
// 30/08/2026): un segreto copiato in N app ha N rotazioni possibili e N valori
// fantasma — alla prima rotazione qualcuno usa ancora il vecchio e nessuno sa
// chi. Standard §7: ogni dato ha una casa sola, e la casa di un segreto è dove
// lo si ruota. Da notare la differenza con la tabella `ApiKey` di quest'app: le
// chiavi in USCITA si VERIFICANO, quindi basta l'hash; queste vanno USATE,
// quindi il valore deve essere recuperabile — sono due meccanismi diversi e non
// si mescolano.
//
// ⚠️ NON importare da `app/api/v1/**`: quelle rotte sono autenticate da chiavi
// in mano ad altre app e hanno CORS aperto.

const HUB_URL_PREDEFINITO = "https://deluxy-hub.vercel.app";
const DURATA_CACHE_MS = 5 * 60 * 1000;

export type NomeCredenziale = "MAIL_API_KEY" | "MAIL_UTENTE" | "BUDGETS_WRITE_KEY";
export type Origine = "ambiente" | "cassaforte";

// Tre stati DISTINTI, e non è pignoleria: «cassaforte irraggiungibile» non è
// «credenziale assente». Collassarli manderebbe l'operatore a incollare di nuovo
// una chiave che c'è già, mentre il problema è il token del Hub.
export type EsitoCredenziale =
  | { stato: "trovata"; valore: string; origine: Origine }
  | { stato: "assente" }
  | { stato: "cassaforte-irraggiungibile"; motivo: string };

type Cache = { quando: number; valori: Record<string, string> } | null;
let cache: Cache = null;
let ultimoErrore: string | null = null;

function hubConfigurato(): boolean {
  return Boolean(process.env.HUB_KEYS_TOKEN);
}

async function leggiCassaforte(): Promise<Record<string, string> | null> {
  if (!hubConfigurato()) {
    ultimoErrore = "Il token del Hub non è impostato in questa app.";
    return null;
  }
  if (cache && Date.now() - cache.quando < DURATA_CACHE_MS) return cache.valori;

  const base = (process.env.HUB_URL || HUB_URL_PREDEFINITO).replace(/\/$/, "");
  try {
    const risposta = await fetch(`${base}/api/chiavi?progetto=personale`, {
      headers: { "x-api-key": process.env.HUB_KEYS_TOKEN! },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!risposta.ok) {
      ultimoErrore =
        risposta.status === 401 || risposta.status === 403
          ? "Il Hub ha rifiutato il token di questa app (revocato, o senza lo scope «personale»)."
          : `Il Hub risponde ${risposta.status}.`;
      return null;
    }
    const dati = (await risposta.json().catch(() => null)) as { chiavi?: Record<string, string> } | null;
    const valori = dati?.chiavi ?? {};
    cache = { quando: Date.now(), valori };
    ultimoErrore = null;
    return valori;
  } catch {
    // Su errore di rete NON si serve un valore scaduto: per un segreto, meglio
    // dichiarare che non si sa, che agire su un valore vecchio.
    ultimoErrore = "Il Hub non risponde: la cassaforte non è raggiungibile.";
    return null;
  }
}

/** Svuota la cache: chiude la finestra di 5 minuti dopo una rotazione. */
export function ricaricaCassaforte(): void {
  cache = null;
}

/**
 * ⭐ `process.env` VINCE sulla cassaforte, sempre — e la fonte risolta viaggia
 * nel ritorno, mai dedotta da una catena di ripieghi anonima.
 *
 * Il motivo è la leva d'emergenza: se il Hub è giù o il token è revocato,
 * l'unico modo di rimettere in piedi l'invio è una variabile su Vercel. Se
 * vincesse la cassaforte, l'ultima leva dipenderebbe dal sistema guasto.
 */
export async function credenziale(nome: NomeCredenziale): Promise<EsitoCredenziale> {
  const daAmbiente = process.env[nome];
  if (daAmbiente) return { stato: "trovata", valore: daAmbiente, origine: "ambiente" };

  const valori = await leggiCassaforte();
  if (valori === null) {
    return { stato: "cassaforte-irraggiungibile", motivo: ultimoErrore ?? "motivo non noto" };
  }
  const daCassaforte = valori[nome];
  if (daCassaforte) return { stato: "trovata", valore: daCassaforte, origine: "cassaforte" };
  return { stato: "assente" };
}

/**
 * Diagnosi per l'interfaccia. **Non contiene il valore né alcuna sua porzione**:
 * rileggere un segreto non serve a nessuna operazione (si incolla, non si
 * rilegge), mentre trasformerebbe una sessione admin nel possesso delle chiavi.
 *
 * `divergente` = presente in ENTRAMBE le fonti con valori diversi: l'app sta
 * usando quello d'ambiente e la cassaforte è ignorata — è il valore fantasma, e
 * si dichiara invece di lasciarlo indovinare.
 */
export async function statoCredenziali(nomi: NomeCredenziale[]): Promise<
  Array<{
    nome: NomeCredenziale;
    presente: boolean;
    origine: Origine | null;
    divergente: boolean;
    cassaforteRaggiungibile: boolean;
    motivo: string | null;
  }>
> {
  const valori = await leggiCassaforte();
  const raggiungibile = valori !== null;

  return nomi.map((nome) => {
    const daAmbiente = process.env[nome];
    const daCassaforte = valori?.[nome];
    const presente = Boolean(daAmbiente || daCassaforte);
    return {
      nome,
      presente,
      origine: daAmbiente ? "ambiente" : daCassaforte ? "cassaforte" : null,
      divergente: Boolean(daAmbiente && daCassaforte && daAmbiente !== daCassaforte),
      cassaforteRaggiungibile: raggiungibile,
      motivo: raggiungibile ? null : ultimoErrore,
    };
  });
}
