import { prisma } from "@/lib/db";

// Da dove vengono le credenziali: **prima l'ambiente, poi il database**.
//
// ⚠️⚠️ PERCHÉ L'ORDINE CONTA (24/08/2026). Le chiavi vivevano nella tabella
// `Impostazione`, in chiaro, e il Postgres è **condiviso fra quattordici app**
// con un solo utente: chiunque abbia la stringa di connessione di una
// qualunque di quelle app poteva leggere la chiave privata di Google e la
// chiave dell'API Anthropic di questa. Non è un rischio teorico — è una
// `SELECT`. Misurato: `drive.service_account` 2.343 caratteri,
// `ai_chiave_anthropic` 108, `drive.apikey` 39.
//
// ⚠️ Due punti li leggevano già dall'ambiente, ma **come ripiego**: il valore
// del database vinceva sempre, quindi metterlo fra le variabili non lo
// disattivava — restava lì, leggibile, e nessuno se ne accorgeva perché l'app
// funzionava. Invertire la precedenza è metà del lavoro; l'altra metà è
// cancellare la riga (`node scripts/segreti-fuori-dal-db.mjs --togli`).
//
// ⚠️ Il ripiego sul database NON si toglie dal codice: serve finché le righe
// non sono state spostate, e serve in sviluppo locale, dove le variabili non
// ci sono e la configurazione si fa dalla pagina Impostazioni. Quello che
// cambia è **chi comanda**.

/** Le impostazioni che sono credenziali, e il nome della variabile che le batte. */
export const SEGRETI: Record<string, string> = {
  "drive.service_account": "GOOGLE_SERVICE_ACCOUNT",
  "drive.apikey": "GOOGLE_DRIVE_API_KEY",
  ai_chiave_anthropic: "ANTHROPIC_API_KEY",
  ai_chiave_openai: "OPENAI_API_KEY",
  "drive.oauth_client_secret": "GOOGLE_OAUTH_CLIENT_SECRET",
  "drive.oauth_refresh": "GOOGLE_OAUTH_REFRESH",
};

/**
 * Il valore di una credenziale: la variabile d'ambiente se c'è, altrimenti
 * l'impostazione salvata. Torna `null` se non c'è da nessuna parte.
 */
export async function segreto(chiave: string): Promise<string | null> {
  const nomeEnv = SEGRETI[chiave];
  const daEnv = nomeEnv ? (process.env[nomeEnv] ?? "").trim() : "";
  if (daEnv) return daEnv;
  const riga = await prisma.impostazione.findUnique({ where: { chiave } }).catch(() => null);
  return (riga?.valore ?? "").trim() || null;
}

/**
 * Da dove arriva, per dirlo a schermo: una credenziale che vive nell'ambiente
 * non si può cambiare dalla pagina Impostazioni, e una casella che accetta
 * scritture che poi non hanno effetto è peggio di una casella disabilitata.
 */
export async function provenienzaSegreto(
  chiave: string,
): Promise<{ c: boolean; da: "ambiente" | "database" | null }> {
  const nomeEnv = SEGRETI[chiave];
  if (nomeEnv && (process.env[nomeEnv] ?? "").trim()) return { c: true, da: "ambiente" };
  const riga = await prisma.impostazione.findUnique({ where: { chiave } }).catch(() => null);
  return (riga?.valore ?? "").trim() ? { c: true, da: "database" } : { c: false, da: null };
}
