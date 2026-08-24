import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";

// **Le chiavi che questa app emette** perché le altre app Deluxy la chiamino.
// L'opposto di `chiavi.ts`, che tiene le chiavi con cui Budgets chiama gli altri.
//
// ---- Le tre regole ----
//
// 1. **Il valore in chiaro non si conserva.** A database va solo l'impronta
//    SHA-256. Si mostra una volta sola alla creazione: se si perde, si revoca e
//    se ne fa un'altra. Un elenco da cui si possono rileggere le chiavi è un
//    elenco che basta rubare una volta.
// 2. **Il confronto è a tempo costante.** Confrontare due stringhe con `===`
//    esce al primo carattere diverso, e da quanto ci mette si può indovinare il
//    prefisso un carattere per volta. Su una chiave che dà accesso al budget
//    dell'azienda non è un rischio teorico da ignorare.
// 3. **Lo scope si controlla sul metodo, non sulla rotta.** Una rotta nuova che
//    scrive nasce protetta da sola: se dimentica di dichiararsi, il metodo la
//    tradisce comunque.

export const SCOPE = ["lettura", "scrittura"] as const;
export type Scope = (typeof SCOPE)[number];

// I metodi che **cambiano qualcosa**. Tutto il resto è lettura.
const METODI_DI_SCRITTURA = new Set(["POST", "PUT", "PATCH", "DELETE"]);
export const scriveQualcosa = (metodo: string) => METODI_DI_SCRITTURA.has(metodo.toUpperCase());

const PREFISSO = "dxb_";

export const impronta = (chiaro: string) => createHash("sha256").update(chiaro, "utf8").digest("hex");

// Una chiave nuova. 32 byte di casualità vera in base64url: né una parola né un
// contatore, perché una chiave indovinabile è peggio di nessuna chiave.
export function generaChiave(): { chiaro: string; prefisso: string; hash: string } {
  const chiaro = PREFISSO + randomBytes(32).toString("base64url");
  return { chiaro, prefisso: chiaro.slice(0, PREFISSO.length + 6), hash: impronta(chiaro) };
}

export function confrontoCostante(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  // `timingSafeEqual` pretende la stessa lunghezza: se differiscono la risposta
  // è già no, e va data senza rivelare *dove* differiscono.
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

export type EsitoChiave =
  | { ok: true; id: string; nome: string; scope: Scope }
  | { ok: false; motivo: "assente" | "sconosciuta" | "revocata" | "scope" };

// Verifica una chiave emessa e il suo scope. `null` in ingresso = header assente.
export async function verificaChiaveEmessa(
  inviata: string | null,
  serveScrittura: boolean
): Promise<EsitoChiave> {
  if (!inviata) return { ok: false, motivo: "assente" };
  const h = impronta(inviata);
  const trovata = await prisma.chiaveEmessa.findUnique({ where: { hash: h } });
  // Il confronto vero l'ha già fatto l'indice sull'impronta; questo secondo
  // passaggio a tempo costante evita che il tempo di risposta distingua «hash
  // che non esiste» da «hash che esiste»: la ricerca su indice è più veloce
  // quando non trova niente.
  if (!trovata || !confrontoCostante(trovata.hash, h)) return { ok: false, motivo: "sconosciuta" };
  if (trovata.revocata) return { ok: false, motivo: "revocata" };
  if (serveScrittura && trovata.scope !== "scrittura") return { ok: false, motivo: "scope" };

  // Si segna l'uso **senza aspettarlo**: è un dato di servizio, e una scrittura
  // in più sul percorso critico rallenta ogni chiamata API per niente. Se fallisce
  // pazienza — l'ultimo uso è un'informazione, non un permesso.
  prisma.chiaveEmessa
    .update({ where: { id: trovata.id }, data: { ultimoUso: new Date() } })
    .catch(() => null);

  return { ok: true, id: trovata.id, nome: trovata.nome, scope: trovata.scope as Scope };
}
