import { chiaveApp } from "./chiavi-app";
import type { Esito } from "./orders";

// Gli UTENTI del CRM vivono nel Deluxy Hub (casa unica, standard §7): qui si
// leggono, si creano e si abilitano/tolgono dal CRM passando dalla sua API
// `/api/utenti?app=crm` (11/09/2026), col token di servizio del Hub
// (HUB_KEYS_TOKEN, scope «crm», generato in Hub → /chiavi). Niente copia in
// questo database: ogni pagina rilegge dal Hub.

const HUB_URL = (process.env.HUB_URL ?? "https://deluxy-hub.vercel.app").replace(/\/$/, "");
const APP = "crm";

export type UtenteHub = {
  id: string;
  nome: string;
  email: string;
  ruolo: string; // admin | partner | commerciale
  attivo: boolean;
  abilitato: boolean; // può aprire il CRM (admin, o «crm» fra le sue app)
  creatoIl: string;
  ultimoAccesso: string | null;
};

async function chiama<T>(metodo: "GET" | "POST" | "PATCH", corpo?: unknown): Promise<Esito<T>> {
  const token = await chiaveApp("HUB_KEYS_TOKEN");
  if (!token) return { ok: false, errore: "Manca HUB_KEYS_TOKEN: il token di servizio del Hub (scope «crm»), da Hub → Chiavi → Token di servizio." };
  try {
    const res = await fetch(`${HUB_URL}/api/utenti?app=${APP}`, {
      method: metodo,
      headers: { "x-api-key": token, ...(corpo ? { "content-type": "application/json" } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const dati = (await res.json().catch(() => ({}))) as T & { errore?: string };
    if (!res.ok) return { ok: false, errore: dati.errore ?? `Hub: errore ${res.status}` };
    return { ok: true, dati };
  } catch (e) {
    return { ok: false, errore: e instanceof Error && e.name === "TimeoutError" ? "Il Hub non risponde (8 s)." : "Il Hub non è raggiungibile." };
  }
}

export async function utentiHub(): Promise<Esito<UtenteHub[]>> {
  const r = await chiama<{ utenti: UtenteHub[] }>("GET");
  return r.ok ? { ok: true, dati: r.dati.utenti } : r;
}

export async function creaUtenteHub(dati: { nome: string; email: string; password: string; ruolo: string }): Promise<Esito<UtenteHub>> {
  const r = await chiama<{ utente: UtenteHub }>("POST", dati);
  return r.ok ? { ok: true, dati: r.dati.utente } : r;
}

export async function abilitaUtenteHub(id: string, abilitato: boolean): Promise<Esito<UtenteHub>> {
  const r = await chiama<{ utente: UtenteHub }>("PATCH", { id, abilitato });
  return r.ok ? { ok: true, dati: r.dati.utente } : r;
}
