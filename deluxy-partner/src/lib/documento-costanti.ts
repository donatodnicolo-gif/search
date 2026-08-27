// COSTANTI PURE DEI DOCUMENTI — niente Prisma, niente server.
//
// ⚠️ Questo file esiste per una ragione precisa: `template-documento.ts` importa
// il client Prisma, e il form dei template è un componente CLIENT. Bastava una
// costante importata da lì per tirarsi dietro Prisma nel bundle del browser: il
// typecheck passa e la build muore con un errore che parla di webpack. Quello
// che serve a tutti e due i lati sta qui, e non importa nulla.

/**
 * La formula che rende la pro-forma quello che è: un documento che NON è una
 * fattura. Senza, il cliente può registrarla in contabilità e detrarne l'IVA.
 * (Testo verificato sulla prassi fiscale italiana il 27/08/2026.)
 */
export const DISCLAIMER_PROFORMA =
  "Il presente documento non costituisce fattura ai sensi dell'art. 21 del D.P.R. 633/72 e successive " +
  "modifiche e non genera esigibilità di imposta per il prestatore. La fattura definitiva verrà emessa " +
  "all'atto del pagamento del corrispettivo (art. 6, comma 3, D.P.R. 633/72).";

/**
 * ⚠️ Un PREVENTIVO non porta la formula della pro-forma: è un'offerta, non un
 * documento fiscale mancato. Dirgli «non costituisce fattura» sarebbe vero e
 * fuorviante insieme — nessuno si aspetta che un preventivo lo sia.
 */
export const DISCLAIMER_PREVENTIVO =
  "Il presente preventivo non costituisce fattura. I prezzi indicati si intendono validi fino alla data " +
  "sopra riportata; l'accettazione può avvenire per iscritto, anche via email.";

/** I brand del gruppo, per non farli riscrivere a mano ogni volta. */
export const BRAND_NOTI = ["deluxy.it", "deluxyflowers.com", "cakedesign.me"] as const;

/**
 * Il peso massimo del logo. Due limiti veri, non capricci: il documento si
 * stampa e viaggia via email, quindi un logo da 4 MB diventa una mail che non
 * parte. Un PNG di intestazione ne pesa 30-80.
 */
export const LOGO_MAX_BYTE = 512 * 1024;

/**
 * Il logo, controllato prima di salvarlo. ⚠️ Un `data:` URI con dentro
 * qualcosa che non è un'immagine finirebbe dritto nell'`img src` di una pagina
 * che poi si manda al cliente.
 */
export function logoAccettabile(v: string): { ok: true } | { ok: false; perche: string } {
  const s = v.trim();
  if (!s) return { ok: true };
  if (s.startsWith("data:")) {
    if (!/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,/i.test(s)) {
      return {
        ok: false,
        perche: "Il contenuto incollato non è un'immagine (deve iniziare con «data:image/…;base64,»).",
      };
    }
    // base64 → byte: ogni 4 caratteri sono 3 byte.
    const b64 = s.slice(s.indexOf(",") + 1);
    const byte = Math.floor((b64.length * 3) / 4);
    if (byte > LOGO_MAX_BYTE) {
      return {
        ok: false,
        perche: `Il logo pesa ${(byte / 1024).toFixed(0)} KB: il massimo è ${LOGO_MAX_BYTE / 1024} KB, o le email col documento non partono.`,
      };
    }
    return { ok: true };
  }
  if (/^https:\/\//i.test(s)) return { ok: true };
  return { ok: false, perche: "Serve un indirizzo https:// oppure un'immagine incollata come «data:image/…»." };
}
