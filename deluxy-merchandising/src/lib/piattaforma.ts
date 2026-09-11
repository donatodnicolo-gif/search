// **Rispondere alla piattaforma consegne (app delivery).**
//
// Richiesta dell'utente (11/09/2026): «l'utente deve mettere il prodotto come
// approvato se va bene e restituire approvato anche all'app delivery».
//
// Fin qui il giro era a senso unico: la piattaforma ci manda i prodotti che un
// partner carica, noi non le rispondiamo. L'approvazione però è una decisione
// **nostra** — il prodotto entra nell'assortimento Deluxy — e di là c'è una
// colonna che aspetta quella risposta (`Product.approved`, oggi sempre `false`
// per tutto ciò che arriva).
//
// ⚠️ **Best-effort, mai bloccante.** Se la piattaforma non risponde,
// l'approvazione qui vale lo stesso e l'esito resta scritto sulla scheda: un
// prodotto approvato che non è stato comunicato è un problema, ma è un problema
// **visibile**. Bloccare l'approvazione perché un'altra app è giù sarebbe
// peggio.
//
// ⚠️ **La rotta di là va aperta**: il canale app della piattaforma
// (`/api/v1/app/...`) oggi ha `GET prodotti` ma nessuna scrittura sui prodotti.
// Il contratto esatto — indirizzo, corpo, risposta — è in
// `docs/CONTRATTO-APP-DELIVERY.md`. Finché non c'è, questa funzione risponde
// «la piattaforma non conosce ancora questa richiesta» e lo si legge sulla
// scheda del prodotto.

import { leggiSegreto } from "./segreti";

export type EsitoPiattaforma = { ok: boolean; messaggio: string };

async function configurazione(): Promise<{ url: string; chiave: string } | null> {
  const url = (await leggiSegreto("PIATTAFORMA_URL")) ?? process.env.PIATTAFORMA_URL ?? "";
  const chiave = (await leggiSegreto("PIATTAFORMA_API_KEY")) ?? "";
  if (!url.trim() || !chiave.trim()) return null;
  return { url: url.trim().replace(/\/+$/, ""), chiave: chiave.trim() };
}

/**
 * Dice alla piattaforma che il suo prodotto è approvato (o non lo è più).
 *
 * `idEsterno` è l'id del prodotto **sulla piattaforma**, che ci arriva quando lo
 * manda: senza quello non c'è niente da aggiornare, e si dice invece di provare
 * a indovinare da SKU o nome.
 */
export async function comunicaApprovazione(
  idEsterno: string | null,
  approvato: boolean,
  dati?: { codice?: string | null; nome?: string | null; prezzoVendita?: number | null },
): Promise<EsitoPiattaforma> {
  if (!idEsterno) return { ok: false, messaggio: "Il prodotto non porta l'id della piattaforma: non so quale scheda aggiornare di là." };
  const conf = await configurazione();
  if (!conf) return { ok: false, messaggio: "Piattaforma consegne non configurata (Impostazioni → App collegate): approvato qui, non comunicato." };

  try {
    const res = await fetch(`${conf.url}/api/v1/app/prodotti/${encodeURIComponent(idEsterno)}/approvato`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": conf.chiave },
      body: JSON.stringify({
        approvato,
        // Quello che la decisione porta con sé: di là il prezzo pubblico è la
        // ragione per cui un prodotto resta fermo, e adesso c'è.
        prezzoPubblico: dati?.prezzoVendita ?? null,
        sku: dati?.codice ?? null,
        nome: dati?.nome ?? null,
        da: "merchandising",
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 404) {
      return { ok: false, messaggio: "La piattaforma non conosce ancora questa richiesta (rotta /app/prodotti/:id/approvato da aprire di là): approvato qui, non comunicato." };
    }
    if (!res.ok) {
      const testo = (await res.text().catch(() => "")).slice(0, 200);
      return { ok: false, messaggio: `La piattaforma risponde HTTP ${res.status}${testo ? `: ${testo}` : ""}.` };
    }
    return { ok: true, messaggio: approvato ? "Approvazione comunicata alla piattaforma consegne." : "Revoca comunicata alla piattaforma consegne." };
  } catch (e) {
    const nome = e instanceof Error ? e.name : "";
    const motivo = nome === "TimeoutError" || nome === "AbortError" ? "non ha risposto entro 15 s" : `non è raggiungibile (${e instanceof Error ? e.message : String(e)})`;
    return { ok: false, messaggio: `La piattaforma ${motivo}: approvato qui, non comunicato.` };
  }
}
