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

// ─────────────────────────────────────────────────────────────────────────────
// **Andare a prendere quello che la piattaforma non manda.**
//
// ⚠️⚠️ 11/09/2026, misurato sul prodotto vero «Torta Damianino»
// (`DXY-23284`, arrivato alle 13:16): la spinta della piattaforma
// (`merchandising-sync.module.ts` → `inviaOra`) mette nel corpo **nove campi**
// più quattro per il partner (`nomePartner`, `nomePartnerAttivo`, `fase`,
// `noteSviluppo`). Non manda le **varianti**, non manda `partnerId` né
// l'insegna, non manda il plus, le note, i giorni di preavviso, le foto. Noi li
// accettiamo tutti da mesi: semplicemente non arrivano, e nessun ritocco di qua
// può inventarli.
//
// Però **di là c'è già una lettura che li contiene**: `GET /api/v1/app/prodotti`
// torna `varianti[]`, `partnerId`, `partner` (l'insegna), `prezzoPubblico` e
// `tipologia`. Quindi invece di aspettare che la spinta venga allargata, il
// prodotto lo completiamo tirando noi — la casa del dato resta la piattaforma
// (Standard Deluxy §7), noi ne prendiamo copia.
//
// Resta fuori quello che quella rotta non seleziona: descrizione, plus
// (`shortDesc`), note di specifica, giorni di preavviso, foto. Per quelli serve
// davvero la modifica di là, ed è scritta in `docs/CONTRATTO-APP-DELIVERY.md`.

export type VarianteDallaPiattaforma = {
  id: string;
  nome: string;
  sku: string;
  prezzo: number | null;
  prezzoPubblico: number | null;
};

export type ProdottoLettoDallaPiattaforma = {
  id: string;
  nome: string;
  sku: string;
  prezzo: number | null;
  prezzoPubblico: number | null;
  tipo: string | null;
  tipologia: string | null;
  varianti: VarianteDallaPiattaforma[];
  partnerId: string;
  partner: string;
};

/**
 * Cerca un prodotto sulla piattaforma e torna quello **giusto**.
 *
 * ⚠️ La rotta di là è una **ricerca** (`q` su nome e SKU, 30 righe): non si può
 * prendere la prima riga e sperare. Si cerca per SKU e si tiene solo la riga il
 * cui `id` è l'`idEsterno` che ci ha mandato; se l'id non c'è, si accetta
 * l'unica riga con lo SKU identico. Meglio non trovare niente che copiare le
 * varianti del prodotto di un altro partner.
 *
 * ⚠️ Quella rotta filtra `active: true, archived: false`: un prodotto spento di
 * là non si trova, e il messaggio lo dice invece di far pensare a un guasto.
 */
export async function leggiProdottoDallaPiattaforma(
  sku: string | null,
  idEsterno: string | null,
): Promise<{ ok: true; prodotto: ProdottoLettoDallaPiattaforma } | { ok: false; messaggio: string }> {
  const chiave = (sku ?? "").trim() || (idEsterno ?? "").trim();
  if (!chiave) return { ok: false, messaggio: "Il prodotto non ha né SKU né id della piattaforma: non so cosa cercare di là." };
  const conf = await configurazione();
  if (!conf) return { ok: false, messaggio: "Piattaforma consegne non configurata (Impostazioni → Piattaforma consegne)." };

  try {
    const res = await fetch(`${conf.url}/api/v1/app/prodotti?q=${encodeURIComponent(chiave)}`, {
      headers: { "x-api-key": conf.chiave },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const testo = (await res.text().catch(() => "")).slice(0, 200);
      return { ok: false, messaggio: `La piattaforma risponde HTTP ${res.status}${testo ? `: ${testo}` : ""}.` };
    }
    const corpo = (await res.json()) as { prodotti?: ProdottoLettoDallaPiattaforma[] };
    const righe = Array.isArray(corpo.prodotti) ? corpo.prodotti : [];
    const perId = idEsterno ? righe.find((r) => r.id === idEsterno) : undefined;
    if (perId) return { ok: true, prodotto: perId };
    const perSku = sku ? righe.filter((r) => (r.sku ?? "").trim().toLowerCase() === sku.trim().toLowerCase()) : [];
    if (perSku.length === 1) return { ok: true, prodotto: perSku[0] };
    if (perSku.length > 1) return { ok: false, messaggio: `Di là ci sono ${perSku.length} prodotti con lo SKU ${sku}: non si può scegliere per noi.` };
    return {
      ok: false,
      messaggio: righe.length
        ? "Il prodotto non è fra quelli che la piattaforma restituisce (la sua ricerca mostra solo gli attivi non archiviati)."
        : "La piattaforma non trova nessun prodotto con questo codice.",
    };
  } catch (e) {
    const nome = e instanceof Error ? e.name : "";
    const motivo = nome === "TimeoutError" || nome === "AbortError" ? "non ha risposto entro 15 s" : `non è raggiungibile (${e instanceof Error ? e.message : String(e)})`;
    return { ok: false, messaggio: `La piattaforma ${motivo}.` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// **I partner, come li conosce la piattaforma.**
//
// 11/09/2026. Serve a riempire i campi del negozio che parlano del partner e
// che nessuno ha voglia di ribattere: da dove parte la consegna
// (`custom.partner_address`), in quali province si vende
// (`custom.nations_availability`), la città (`custom.citta`) — e soprattutto a
// **chiamare il partner per nome** invece che col suo numero.
//
// La rotta è `GET /api/v1/app/partner`: torna i partner attivi con insegna,
// città e le sigle delle province servite. L'aggancio col nostro prodotto è il
// `partnerPiattaformaId` (il cuid), che ci arriva quando il prodotto nasce.

export type PartnerDallaPiattaforma = {
  id: string;
  insegna: string;
  citta: string;
  province: string[];
  servizi: string[];
};

/** Tutti i partner attivi della piattaforma. Vuoto se non è configurata. */
export async function leggiPartnerDallaPiattaforma(): Promise<
  { ok: true; partner: PartnerDallaPiattaforma[] } | { ok: false; messaggio: string }
> {
  const conf = await configurazione();
  if (!conf) return { ok: false, messaggio: "Piattaforma consegne non configurata (Impostazioni → Piattaforma consegne)." };
  try {
    const res = await fetch(`${conf.url}/api/v1/app/partner`, {
      headers: { "x-api-key": conf.chiave },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const testo = (await res.text().catch(() => "")).slice(0, 200);
      return { ok: false, messaggio: `La piattaforma risponde HTTP ${res.status}${testo ? `: ${testo}` : ""}.` };
    }
    const corpo = (await res.json()) as PartnerDallaPiattaforma[] | { partner?: PartnerDallaPiattaforma[] };
    const righe = Array.isArray(corpo) ? corpo : Array.isArray(corpo.partner) ? corpo.partner : [];
    return { ok: true, partner: righe };
  } catch (e) {
    const nome = e instanceof Error ? e.name : "";
    const motivo = nome === "TimeoutError" || nome === "AbortError" ? "non ha risposto entro 15 s" : `non è raggiungibile (${e instanceof Error ? e.message : String(e)})`;
    return { ok: false, messaggio: `La piattaforma ${motivo}.` };
  }
}
