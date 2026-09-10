import { chiaveApp } from "./chiavi-app";

// Gli eventi CRM con una data si spingono anche al Deluxy Calendario
// (sistema "deluxy-crm", idEsterno = id dell'evento): l'agenda di tutte le app
// è la sua casa (standard §7.2). Best-effort: se il Calendario è giù o la
// chiave manca, l'evento CRM resta valido e lo si annota soltanto.
//
// Dal 10/09/2026 ci passano anche le PROGRAMMAZIONI con i clienti (idEsterno
// "prog:<id>", tipo "attivita"): stessa chiamata, stesso upsert per
// sistema+idEsterno, quindi cambiare stato o data aggiorna, non duplica.

const BASE_DEFAULT = "https://deluxy-calendario.vercel.app";

// Gli stati che il Calendario conosce (deluxy-calendario/src/lib/stati.ts).
export type StatoAgenda = "programmato" | "completato" | "annullato";

export async function spingiEventoInAgenda(evento: {
  id: string;
  titolo: string;
  descrizione?: string | null;
  luogo?: string | null;
  inizio: Date;
  fine?: Date | null;
  annullato?: boolean;
  tipo?: string;
  stato?: StatoAgenda;
}): Promise<{ ok: boolean; nota: string | null }> {
  const [chiave, utente] = await Promise.all([
    chiaveApp("CALENDARIO_API_KEY"),
    chiaveApp("CALENDARIO_UTENTE"),
  ]);
  if (!chiave || !utente) {
    return { ok: false, nota: "Calendario non configurato (CALENDARIO_API_KEY / CALENDARIO_UTENTE): evento non in agenda." };
  }
  const base = ((await chiaveApp("CALENDARIO_URL")) ?? BASE_DEFAULT).replace(/\/$/, "");

  try {
    const res = await fetch(`${base}/api/v1/eventi`, {
      method: "POST",
      headers: { "x-api-key": chiave, "Content-Type": "application/json" },
      body: JSON.stringify({
        sistema: "deluxy-crm",
        idEsterno: evento.id,
        utenteEmail: utente,
        titolo: evento.titolo,
        descrizione: evento.descrizione ?? undefined,
        luogo: evento.luogo ?? undefined,
        inizio: evento.inizio.toISOString(),
        fine: evento.fine ? evento.fine.toISOString() : undefined,
        tipo: evento.tipo ?? "evento",
        stato: evento.stato ?? (evento.annullato ? "annullato" : "programmato"),
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { ok: false, nota: `Il Calendario risponde ${res.status}: evento non in agenda.` };
    return { ok: true, nota: null };
  } catch {
    return { ok: false, nota: "Il Calendario non risponde: evento non in agenda." };
  }
}
