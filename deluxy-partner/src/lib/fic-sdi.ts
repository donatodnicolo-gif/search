import { ficStato, ficFetch, ficIdDaNumero, ficInviaAlloSdi } from "./fic";

// LO STATO DI INVIO ALLO SDI, E IL BOTTONE CHE LO FA PARTIRE (10/09/2026).
//
// Richiesta dell'utente: «le fatture che crei su FIC non vengono poi mandate:
// dicci lo stato della fattura (se è stata inviata da FIC) e crea un pulsante
// su FINANCE, anche nel pop-up di dettaglio, che le faccia mandare
// effettivamente anche da FIC al cassetto fiscale».
//
// Fatture in Cloud dice lo stato in `ei_status` (documentazione FIC): vuoto,
// «not_sent» o «missing» = mai partita; «attempt»/«pending»/«processing» = in
// viaggio; «sent»/«accepted» = arrivata; «rejected»/«discarded»/«error»/
// «not_delivered» = qualcosa da guardare. Qui quei codici diventano parole e
// un solo giudizio: si può premere «Invia» oppure no.
//
// ⚠️ L'invio è IRREVERSIBILE: una fattura partita verso lo SDI è un atto
// fiscale, e per disfarla serve una nota di credito. Per questo il bottone
// chiede conferma e questa funzione rilegge lo stato PRIMA di inviare: non si
// manda due volte, e non si manda una fattura scartata senza averla corretta.

export type StatoSdi = {
  codice: string; // com'è su FIC («not_sent», «sent»…); "" se non c'è
  etichetta: string;
  colore: "green" | "blue" | "orange" | "red" | "neutral";
  inviabile: boolean; // ha senso premere «Invia allo SDI»?
  spiegazione: string;
};

export function descriviStatoSdi(ei: string | null | undefined): StatoSdi {
  const c = (ei ?? "").trim();
  switch (c) {
    case "":
    case "not_sent":
    case "missing":
      return { codice: c, etichetta: "Non inviata allo SDI", colore: "orange", inviabile: true, spiegazione: "Il documento è su Fatture in Cloud ma non è mai partito verso il cassetto fiscale del cliente." };
    case "attempt":
      return { codice: c, etichetta: "Invio in corso", colore: "blue", inviabile: false, spiegazione: "Fatture in Cloud sta provando a inviarla (può volerci fino a 2 ore)." };
    case "pending":
      return { codice: c, etichetta: "In verifica", colore: "blue", inviabile: false, spiegazione: "Firma digitale e invio in corso di verifica." };
    case "processing":
      return { codice: c, etichetta: "In consegna dallo SDI", colore: "blue", inviabile: false, spiegazione: "Lo SDI la sta recapitando al cliente." };
    case "sent":
      return { codice: c, etichetta: "Inviata allo SDI", colore: "green", inviabile: false, spiegazione: "Partita: è nel cassetto fiscale del cliente." };
    case "accepted":
      return { codice: c, etichetta: "Accettata dal cliente", colore: "green", inviabile: false, spiegazione: "Il cliente l'ha accettata." };
    case "no_response":
      return { codice: c, etichetta: "Inviata, senza risposta", colore: "green", inviabile: false, spiegazione: "Consegnata; il cliente non ha risposto nei termini (vale come accettata)." };
    case "rejected":
      return { codice: c, etichetta: "Rifiutata dal cliente", colore: "red", inviabile: false, spiegazione: "Va corretta su Fatture in Cloud e rimandata da lì." };
    case "discarded":
      return { codice: c, etichetta: "Scartata dallo SDI", colore: "red", inviabile: false, spiegazione: "Lo SDI l'ha scartata: va corretta su Fatture in Cloud e rimandata da lì." };
    case "error":
      return { codice: c, etichetta: "Errore di invio", colore: "red", inviabile: true, spiegazione: "L'invio è fallito: si può riprovare." };
    case "not_delivered":
      return { codice: c, etichetta: "Non consegnata", colore: "orange", inviabile: false, spiegazione: "Lo SDI non è riuscito a recapitarla (è comunque nel cassetto fiscale)." };
    default:
      return { codice: c, etichetta: `Stato FIC «${c}»`, colore: "neutral", inviabile: false, spiegazione: "Stato non previsto: controllare su Fatture in Cloud." };
  }
}

export type EsitoInvioSdi =
  | { ok: true; id: number; prima: StatoSdi; dopo: StatoSdi }
  | { ok: false; errore: string; stato?: StatoSdi };

// Legge lo stato attuale di un documento dato il numero interno («648/2026»).
export async function statoSdiDaNumero(numero: string, annoFallback?: number): Promise<{ id: number; stato: StatoSdi } | null> {
  const { collegato, companyId } = await ficStato();
  if (!collegato || !companyId) return null;
  const id = await ficIdDaNumero(numero, annoFallback);
  if (!id) return null;
  const doc = await ficFetch<{ data: { ei_status?: string | null } }>(`/c/${companyId}/issued_documents/${id}?fields=id,ei_status`);
  return { id, stato: descriviStatoSdi(doc.data.ei_status) };
}

// Manda allo SDI il documento con quel numero — solo se il suo stato lo
// consente. Scrive nel registro modifiche com'è andata. Non lancia.
export async function inviaFatturaAlloSdi(
  numero: string,
  annoFallback: number | undefined,
  contesto: { fatturaId?: string | null; partner?: string | null; da: string }
): Promise<EsitoInvioSdi> {
  const { registra } = await import("./registro");
  try {
    const { collegato, companyId } = await ficStato();
    if (!collegato || !companyId) return { ok: false, errore: "Fatture in Cloud non è collegato." };
    const id = await ficIdDaNumero(numero, annoFallback);
    if (!id) return { ok: false, errore: `Su Fatture in Cloud non risulta un solo documento con il numero ${numero}.` };
    const letto = await ficFetch<{ data: { ei_status?: string | null; entity?: { name?: string | null } } }>(
      `/c/${companyId}/issued_documents/${id}?fields=id,ei_status,entity`
    );
    const prima = descriviStatoSdi(letto.data.ei_status);
    if (!prima.inviabile) {
      return { ok: false, errore: `Non si invia: ${prima.etichetta.toLowerCase()} — ${prima.spiegazione}`, stato: prima };
    }
    const inv = await ficInviaAlloSdi(id);
    if (!inv.ok) {
      await registra({
        azione: `Invio allo SDI della fattura ${numero} NON riuscito`,
        categoria: "fatture",
        entita: "fattura",
        entitaId: contesto.fatturaId ?? undefined,
        partner: contesto.partner ?? letto.data.entity?.name ?? undefined,
        dettaglio: `${inv.errore} · da ${contesto.da}`,
      });
      return { ok: false, errore: inv.errore, stato: prima };
    }
    // Rilettura: FIC risponde «attempt»/«pending» subito dopo l'invio; è quello
    // che si mostra, non un «inviata» dedotto.
    const dopoLetto = await ficFetch<{ data: { ei_status?: string | null } }>(`/c/${companyId}/issued_documents/${id}?fields=id,ei_status`).catch(() => null);
    const dopo = descriviStatoSdi(dopoLetto?.data.ei_status ?? "attempt");
    await registra({
      azione: `Fattura ${numero} inviata allo SDI da Finance`,
      categoria: "fatture",
      entita: "fattura",
      entitaId: contesto.fatturaId ?? undefined,
      partner: contesto.partner ?? letto.data.entity?.name ?? undefined,
      dettaglio: `Stato su Fatture in Cloud: prima «${prima.codice || "vuoto"}», dopo «${dopo.codice || "vuoto"}» (${dopo.etichetta}) · da ${contesto.da}`,
    });
    return { ok: true, id, prima, dopo };
  } catch (e) {
    return { ok: false, errore: (e as Error).message };
  }
}
