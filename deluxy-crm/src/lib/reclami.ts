import { chiaveApp } from "./chiavi-app";
import type { Esito } from "./orders";

// I RECLAMI non vivono qui: la loro casa è il Customer Service, dove si aprono,
// si lavorano e si chiudono (Standard §7). Il CRM li LEGGE — perché chi tiene
// la relazione con un cliente deve sapere che cosa è andato storto prima di
// telefonargli — e per ogni reclamo rimanda alla sua scheda vera, là.
//
// Si legge da /api/v1/reclami (11/09/2026) con MESSAGGI_API_KEY, la stessa
// chiave del «Nuovo ordine». Nessuna copia in questo database: se un reclamo
// cambia stato nel Customer Service, qui si vede al caricamento dopo.

const BASE_DEFAULT = "https://deluxy-messaging.vercel.app";
const TIMEOUT_MS = 10_000;
/** Il pallino del menu gira a OGNI pagina: senza un TTL sarebbe una chiamata
 *  al Customer Service per ogni clic. Cinque minuti, come i pallini di Orders. */
export const TTL_PALLINO_RECLAMI_MS = 5 * 60 * 1000;

export type Reclamo = {
  id: string;
  ordineId: string;
  ordineNumero: string;
  negozioNome: string;
  clienteNome: string;
  telefono: string;
  email: string;
  casistica: string;
  colpaTipo: string;
  colpaNome: string;
  gravita: number;
  descrizione: string;
  prodotti: string[];
  azioni: string[];
  stato: string;
  esito: string;
  domandeAperte: number;
  risoltoIl: string | null;
  creatoIl: string;
  aggiornatoIl: string;
  /** Percorso della scheda nel Customer Service (da attaccare a MESSAGGI_URL). */
  link: string;
};

export type MessaggioReclamo = {
  id: string;
  autoreNome: string;
  testo: string;
  domanda: boolean;
  rispostaA: string;
  senzaRisposta: boolean;
  creatoIl: string;
};

export type EtichetteReclami = {
  stati: { chiave: string; nome: string; colore: string }[];
  colpe: { chiave: string; nome: string }[];
  gravita: { livello: number; nome: string; colore: string }[];
};

export type ElencoReclami = {
  reclami: Reclamo[];
  totale: number;
  page: number;
  limit: number;
  pagine: number;
  perStato: Record<string, number>;
  etichette: EtichetteReclami;
};

export type DettaglioReclamo = {
  reclamo: Reclamo;
  messaggi: MessaggioReclamo[];
  etichette: EtichetteReclami;
};

/** L'indirizzo del Customer Service, per i link alle schede vere. */
export async function baseCS(): Promise<string> {
  return ((await chiaveApp("MESSAGGI_URL")) ?? BASE_DEFAULT).replace(/\/$/, "");
}

// Cache a tempo, solo dove è chiesta (il pallino). Le pagine leggono sempre
// dal vivo: un reclamo che cambia stato mentre lo guardi deve cambiare.
const cache = new Map<string, { dati: unknown; scade: number }>();

async function leggi<T>(percorso: string, ttlMs = 0): Promise<Esito<T>> {
  if (ttlMs > 0) {
    const inCache = cache.get(percorso);
    if (inCache && inCache.scade > Date.now()) return { ok: true, dati: inCache.dati as T };
  }
  const k = await chiaveApp("MESSAGGI_API_KEY");
  if (!k) {
    return {
      ok: false,
      errore:
        "Manca MESSAGGI_API_KEY: la chiave del Customer Service (la stessa del «Nuovo ordine»), da emettere lì con npm run chiave -- deluxy-crm.",
    };
  }
  try {
    const res = await fetch(`${await baseCS()}${percorso}`, {
      headers: { "x-api-key": k },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const corpo = (await res.json().catch(() => null)) as (T & { errore?: string }) | null;
    if (res.status === 404 && !corpo?.errore) {
      // ⚠️ 404 SENZA un messaggio = la rotta non esiste: il Customer Service in
      // produzione non ha ancora l'API dei reclami. Dirlo com'è, invece di un
      // «risponde 404» che sembra un guasto e manda a cercare la cosa sbagliata.
      return {
        ok: false,
        errore: "Il Customer Service collegato non ha (ancora) l'API dei reclami: va pubblicata la sua versione dell'11/09/2026.",
      };
    }
    if (!res.ok) {
      // 404 CON messaggio: è un reclamo che non c'è (più). Lo dice lui.
      return { ok: false, errore: corpo?.errore ?? `Il Customer Service risponde ${res.status}.` };
    }
    if (ttlMs > 0) cache.set(percorso, { dati: corpo, scade: Date.now() + ttlMs });
    return { ok: true, dati: corpo as T };
  } catch {
    return { ok: false, errore: "Il Customer Service non risponde (timeout o rete)." };
  }
}

export type FiltriReclami = {
  /** Email o telefono: i reclami di UNA persona (la scheda cliente). */
  cliente?: string;
  q?: string;
  stato?: string;
  colpa?: string;
  gravita?: string;
  periodo?: string;
  page?: number;
  limit?: number;
  /** Quanto vale una risposta già presa (solo il pallino del menu la usa). */
  ttlMs?: number;
};

export async function reclami(f: FiltriReclami = {}): Promise<Esito<ElencoReclami>> {
  const { ttlMs = 0, ...filtri } = f;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filtri)) if (v !== undefined && v !== "" && v !== null) p.set(k, String(v));
  return leggi<ElencoReclami>(`/api/v1/reclami?${p.toString()}`, ttlMs);
}

export async function reclamo(id: string): Promise<Esito<DettaglioReclamo>> {
  return leggi<DettaglioReclamo>(`/api/v1/reclami/${encodeURIComponent(id)}`);
}

/**
 * I reclami di un cliente, cercati per email E per telefono, e per TUTTI i
 * contatti delle sue schede unite: una persona può aver reclamato con l'altra
 * email, e mostrargliene metà sarebbe peggio che non mostrarne nessuno. Le
 * risposte si fondono per id.
 *
 * ⚠️ Non fallisce a metà: se una delle chiamate cade, si dice.
 */
export async function reclamiDelCliente(
  contatti: { email?: string | null; telefono?: string | null }[],
): Promise<Esito<Reclamo[]>> {
  const chiavi = [
    ...new Set(
      contatti
        .flatMap((c) => [c.email?.trim(), c.telefono?.trim()])
        .filter((v): v is string => Boolean(v))
        .map((v) => v.toLowerCase()),
    ),
  ];
  if (!chiavi.length) return { ok: true, dati: [] };

  const esiti = await Promise.all(chiavi.map((c) => reclami({ cliente: c, limit: 50 })));
  const rotto = esiti.find((e) => !e.ok);
  if (rotto && !rotto.ok) return { ok: false, errore: rotto.errore };

  const perId = new Map<string, Reclamo>();
  for (const e of esiti) if (e.ok) for (const r of e.dati.reclami) perId.set(r.id, r);
  return {
    ok: true,
    dati: [...perId.values()].sort((a, b) => b.creatoIl.localeCompare(a.creatoIl)),
  };
}

// ── Etichette di riserva ──────────────────────────────────────────────────
// I vocabolari veri viaggiano con la risposta del Customer Service (così una
// casistica nuova si vede senza toccare il CRM). Questi valgono solo quando il
// CS non ha risposto: servono a scrivere «Aperto» invece di «aperto».
const STATI_DI_RISERVA: Record<string, { nome: string; colore: string }> = {
  aperto: { nome: "Aperto", colore: "var(--orange)" },
  in_lavorazione: { nome: "In lavorazione", colore: "var(--blue)" },
  risolto: { nome: "Risolto", colore: "var(--green)" },
  chiuso: { nome: "Chiuso", colore: "var(--text-secondary)" },
};

export function statoReclamo(chiave: string, et?: EtichetteReclami): { nome: string; colore: string } {
  const dalCS = et?.stati.find((s) => s.chiave === chiave);
  if (dalCS) return { nome: dalCS.nome, colore: dalCS.colore };
  return STATI_DI_RISERVA[chiave] ?? { nome: chiave || "Aperto", colore: "var(--text-secondary)" };
}

export function gravitaReclamo(livello: number, et?: EtichetteReclami): { nome: string; colore: string } {
  const dalCS = et?.gravita.find((g) => g.livello === livello);
  if (dalCS) return { nome: dalCS.nome, colore: dalCS.colore };
  return livello === 1
    ? { nome: "Lieve", colore: "var(--text-secondary)" }
    : livello === 3
      ? { nome: "Grave", colore: "var(--red)" }
      : { nome: "Media", colore: "var(--orange)" };
}

/** Un reclamo ancora da lavorare (non risolto né chiuso). */
export function reclamoAperto(stato: string): boolean {
  return stato === "aperto" || stato === "in_lavorazione";
}
