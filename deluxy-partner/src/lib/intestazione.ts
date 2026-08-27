// L'INTESTAZIONE DI UN DOCUMENTO — chi emette, come si paga, cosa c'è in calce.
//
// ⚠️ FINANCE NON POSSIEDE I TEMPLATE (decisione dell'utente, 27/08/2026: «Scout
// sarà l'owner dei template, a Finance vengono comunicate solo le pro-forme»).
// Qui arriva una FOTOGRAFIA: i campi con cui il documento è stato emesso,
// salvati sul documento stesso.
//
// Non è solo una questione di proprietà — è anche più corretto così. Con un
// riferimento a un template, ritoccare il logo o l'IBAN avrebbe cambiato
// l'aspetto di tutte le pro-forma già emesse, comprese quelle stampate e
// spedite mesi prima. Un documento è una fotografia: l'intestazione con cui è
// uscito resta quella.
//
// Senza intestazione (documenti vecchi, o creati a mano dall'app) si usa quella
// generale delle Impostazioni: è ciò che si è sempre visto.
import { CHIAVI, leggiImpostazioni } from "./impostazioni";
import { DISCLAIMER_PREVENTIVO, DISCLAIMER_PROFORMA } from "./documento-costanti";

export interface Intestazione {
  ragioneSociale: string;
  indirizzo: string;
  piva: string;
  codiceFiscale: string;
  rea: string;
  contatti: string;
  logoDataUrl: string;
  iban: string;
  intestatarioConto: string;
  modalitaPagamento: string;
  sdi: string;
  pec: string;
  banca: string;
  bic: string;
  disclaimer: string;
  /** Il brand dichiarato da chi ha emesso: si mostra a schermo, non decide. */
  brand: string;
}

function testo(v: unknown, max = 400): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/**
 * Ripulisce l'intestazione che arriva da fuori.
 *
 * ⚠️ Il logo finisce dentro un `img src` di una pagina che poi si manda al
 * cliente: si accettano solo `data:image/…` e `https://`. Tutto il resto —
 * `javascript:`, `data:text/html` — viene buttato senza discutere.
 */
export function leggiIntestazione(v: unknown): Intestazione | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const logo = testo(o.logoDataUrl, 900_000);
  const logoOk = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,/i.test(logo) || /^https:\/\//i.test(logo);
  const i: Intestazione = {
    ragioneSociale: testo(o.ragioneSociale, 200),
    indirizzo: testo(o.indirizzo, 300),
    piva: testo(o.piva, 40),
    codiceFiscale: testo(o.codiceFiscale, 40),
    rea: testo(o.rea, 60),
    contatti: testo(o.contatti, 300),
    logoDataUrl: logoOk ? logo : "",
    iban: testo(o.iban, 60),
    intestatarioConto: testo(o.intestatarioConto, 200),
    modalitaPagamento: testo(o.modalitaPagamento, 300),
    sdi: testo(o.sdi, 20),
    pec: testo(o.pec, 200),
    banca: testo(o.banca, 120),
    bic: testo(o.bic, 20),
    disclaimer: testo(o.disclaimer, 1500),
    brand: testo(o.brand, 120),
  };
  // Senza chi emette non è un'intestazione: meglio quella generale che una
  // mezza, che sul foglio si vedrebbe come un buco.
  return i.ragioneSociale ? i : null;
}

/** L'intestazione da stampare: quella del documento, o quella generale. */
export async function intestazioneDaMostrare(
  salvata: unknown,
  preventivo: boolean,
): Promise<Intestazione & { fonte: "documento" | "impostazioni" }> {
  const i = leggiIntestazione(salvata);
  const disclaimerDefault = preventivo ? DISCLAIMER_PREVENTIVO : DISCLAIMER_PROFORMA;
  if (i) return { ...i, disclaimer: i.disclaimer || disclaimerDefault, fonte: "documento" };
  const imp = await leggiImpostazioni();
  return {
    ragioneSociale: imp[CHIAVI.aziendaIntestazione] || "Deluxy",
    indirizzo: imp[CHIAVI.aziendaIndirizzo] || "",
    piva: imp[CHIAVI.aziendaPiva] || "",
    codiceFiscale: "",
    rea: "",
    contatti: imp[CHIAVI.aziendaContatti] || "",
    logoDataUrl: "",
    iban: "",
    intestatarioConto: "",
    modalitaPagamento: "",
    sdi: "",
    pec: "",
    banca: "",
    bic: "",
    disclaimer: disclaimerDefault,
    brand: "",
    fonte: "impostazioni",
  };
}
