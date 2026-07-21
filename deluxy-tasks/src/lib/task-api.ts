import type { Task, TaskLivello } from "@prisma/client";
import { normalizzaLivelli, type LivelloInput } from "./livelli";
import { isPriorita, PRIORITA_DEFAULT } from "./priorita";
import { isStato, STATO_DEFAULT } from "./stati";

// Serializzazione e validazione delle task per l'API v1.

// Forma pubblica della task nell'API: date in ISO, niente campi interni superflui.
// Accetta la task con i livelli inclusi (se presenti).
export function serializzaTask(t: Task & { livelli?: TaskLivello[] }) {
  return {
    id: t.id,
    sistema: t.sistema,
    idEsterno: t.idEsterno,
    utenteEmail: t.utenteEmail,
    utenteNome: t.utenteNome,
    titolo: t.titolo,
    descrizione: t.descrizione,
    stato: t.stato,
    // Priorità/scadenza EFFETTIVE (del livello scelto)
    priorita: t.priorita,
    scadenza: t.scadenza?.toISOString() ?? null,
    // Livelli di priorità con date diverse; livelloSceltoId = quello attivo
    livelloSceltoId: t.livelloSceltoId,
    livelli: (t.livelli ?? [])
      .slice()
      .sort((a, b) => a.ordine - b.ordine)
      .map((l) => ({
        id: l.id,
        priorita: l.priorita,
        data: l.data?.toISOString() ?? null,
        nota: l.nota,
        ordine: l.ordine,
      })),
    completataIl: t.completataIl?.toISOString() ?? null,
    creataDa: t.creataDa,
    link: t.link,
    contesto:
      t.contestoTipo || t.contestoId || t.contestoEtichetta
        ? { tipo: t.contestoTipo, id: t.contestoId, etichetta: t.contestoEtichetta }
        : null,
    tag: t.tag,
    extra: t.extra ?? null,
    attiva: t.attiva,
    // Stato di sincronizzazione
    revisione: t.revisione,
    revisioneOrigine: t.revisioneOrigine,
    aggiornatoDaOrigine: t.aggiornatoDaOrigine?.toISOString() ?? null,
    ultimoAttore: t.ultimoAttore,
    creataIl: t.creataIl.toISOString(),
    aggiornataIl: t.aggiornataIl.toISOString(),
  };
}

// Campi che un'app può scrivere/aggiornare via API.
export type DatiTask = {
  utenteEmail?: string;
  utenteNome?: string | null;
  titolo?: string;
  descrizione?: string | null;
  stato?: string;
  priorita?: string;
  scadenza?: Date | null;
  completataIl?: Date | null;
  creataDa?: string | null;
  link?: string | null;
  contestoTipo?: string | null;
  contestoId?: string | null;
  contestoEtichetta?: string | null;
  tag?: string[];
  extra?: unknown;
  // Livelli di priorità con date diverse (sostituiscono l'intero set se presenti)
  livelli?: LivelloInput[];
  livelloSceltoNota?: string | null; // quale livello rendere effettivo (per nota)
  // Stato di aggiornamento comunicato dall'origine
  revisioneOrigine?: string | null;
  aggiornatoDaOrigine?: Date | null;
};

function testo(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

// Accetta null esplicito (per svuotare un campo) o testo.
function testoNullabile(v: unknown): string | null | undefined {
  if (v === null) return null;
  return testo(v);
}

function dataOpz(v: unknown): Date | null | undefined {
  if (v === null) return null;
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

// Valida il body in ingresso. In creazione (`creazione=true`) titolo ed
// utenteEmail sono obbligatori; in patch tutto è opzionale.
export function validaTask(
  body: Record<string, unknown>,
  creazione: boolean,
): { errore: string } | { dati: DatiTask } {
  const dati: DatiTask = {};

  const email = testo(body.utenteEmail);
  if (email) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { errore: "utenteEmail non è un'email valida" };
    dati.utenteEmail = email.toLowerCase();
  } else if (creazione) {
    return { errore: "utenteEmail è obbligatorio" };
  }

  const titolo = testo(body.titolo);
  if (titolo) dati.titolo = titolo;
  else if (creazione) return { errore: "titolo è obbligatorio" };

  if ("utenteNome" in body) dati.utenteNome = testoNullabile(body.utenteNome) ?? null;
  if ("descrizione" in body) dati.descrizione = testoNullabile(body.descrizione) ?? null;
  if ("creataDa" in body) dati.creataDa = testoNullabile(body.creataDa) ?? null;
  if ("link" in body) dati.link = testoNullabile(body.link) ?? null;
  if ("contestoTipo" in body) dati.contestoTipo = testoNullabile(body.contestoTipo) ?? null;
  if ("contestoId" in body) dati.contestoId = testoNullabile(body.contestoId) ?? null;
  if ("contestoEtichetta" in body) dati.contestoEtichetta = testoNullabile(body.contestoEtichetta) ?? null;

  if (body.stato !== undefined) {
    if (!isStato(body.stato)) return { errore: `stato non valido (usa: aperta, in_corso, completata, annullata)` };
    dati.stato = body.stato;
  }
  if (body.priorita !== undefined) {
    if (!isPriorita(body.priorita)) return { errore: `priorita non valida (usa: bassa, media, alta, urgente)` };
    dati.priorita = body.priorita;
  }

  if ("scadenza" in body) {
    const d = dataOpz(body.scadenza);
    if (d === undefined && body.scadenza !== undefined && body.scadenza !== null)
      return { errore: "scadenza non è una data valida (usa ISO 8601)" };
    dati.scadenza = d ?? null;
  }

  if (Array.isArray(body.tag)) {
    dati.tag = body.tag.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
  }

  if ("extra" in body) dati.extra = body.extra;

  // Livelli di priorità con date diverse. Se presenti sostituiscono l'intero set.
  if ("livelli" in body && body.livelli != null) {
    let esito: ReturnType<typeof normalizzaLivelli>;
    try {
      esito = normalizzaLivelli(body.livelli);
    } catch (e) {
      return { errore: e instanceof Error ? e.message : "livelli non validi" };
    }
    if ("errore" in esito) return { errore: esito.errore };
    dati.livelli = esito.livelli;
  }
  const notaScelta = testo(body.livelloSceltoNota);
  if (notaScelta) dati.livelloSceltoNota = notaScelta;

  // Stato di aggiornamento dell'origine: la sua versione (stringa libera) e la
  // freschezza `asOf` (o `aggiornatoDaOrigine`). Usati per stabilire chi vince.
  const rev = testo(body.revisioneOrigine);
  if (rev) dati.revisioneOrigine = rev;
  const asOf = dataOpz(body.asOf ?? body.aggiornatoDaOrigine);
  if (asOf === undefined && (body.asOf ?? body.aggiornatoDaOrigine) != null)
    return { errore: "asOf non è una data valida (usa ISO 8601)" };
  if (asOf) dati.aggiornatoDaOrigine = asOf;

  return { dati };
}

// Default applicati alla creazione se non forniti.
export function conDefault(dati: DatiTask): DatiTask {
  return {
    ...dati,
    stato: dati.stato ?? STATO_DEFAULT,
    priorita: dati.priorita ?? PRIORITA_DEFAULT,
  };
}
