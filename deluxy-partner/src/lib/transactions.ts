import { createHash, createHmac, randomUUID } from "crypto";
import { chiave, env } from "./env";

// Client di **Deluxy Transactions**, l'unica app da cui può uscire denaro.
//
// Regola dell'ecosistema (CLAUDE.md di repo): nessuna app Deluxy paga nessuno
// per conto proprio. Finance non manda bonifici: manda una RICHIESTA. Il denaro
// esce solo dopo che una persona l'ha autorizzata dentro Transactions, con
// secondo fattore e — sopra soglia — doppia firma.
//
// Ogni chiamata è firmata: chiave (`x-api-key`) + HMAC-SHA256 del corpo con un
// segreto separato. La firma copre metodo, percorso, marca temporale e nonce,
// così una richiesta intercettata non si può rigiocare né modificare.
//
// Env: TRANSACTIONS_URL, TRANSACTIONS_API_KEY, TRANSACTIONS_HMAC_SECRET.

function baseUrl(): string {
  return (env("TRANSACTIONS_URL") || "https://deluxy-transactions.vercel.app").replace(/\/$/, "");
}

export function transactionsConfigurato(): boolean {
  return Boolean(chiave("TRANSACTIONS_API_KEY") && env("TRANSACTIONS_HMAC_SECRET"));
}

/** URL a cui Transactions notifica i cambi di stato. Senza, la richiesta parte
 *  lo stesso ma l'esito va guardato a mano dentro Transactions. */
function urlNotifica(): string | undefined {
  const base = env("APP_URL") || (env("VERCEL_URL") ? `https://${env("VERCEL_URL")}` : undefined);
  if (!base) return undefined;
  const u = base.startsWith("http") ? base : `https://${base}`;
  return u.startsWith("https://") ? `${u.replace(/\/$/, "")}/api/pagamenti/notifica` : undefined;
}

async function chiamataFirmata(
  metodo: "GET" | "POST",
  percorso: string,
  corpoOggetto?: unknown,
  idempotenza?: string
): Promise<{ stato: number; dati: Record<string, unknown> | null }> {
  const apiKey = chiave("TRANSACTIONS_API_KEY");
  const segreto = env("TRANSACTIONS_HMAC_SECRET");
  if (!apiKey || !segreto) throw new Error("Transactions non configurata: mancano TRANSACTIONS_API_KEY / TRANSACTIONS_HMAC_SECRET.");

  const corpo = corpoOggetto ? JSON.stringify(corpoOggetto) : "";
  const timestamp = String(Date.now());
  const nonce = randomUUID();
  const impronta = createHash("sha256").update(corpo).digest("hex");
  const daFirmare = [metodo, percorso, timestamp, nonce, impronta].join("\n");
  const firma = createHmac("sha256", segreto).update(daFirmare).digest("hex");

  const res = await fetch(`${baseUrl()}${percorso}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "x-deluxy-timestamp": timestamp,
      "x-deluxy-nonce": nonce,
      "x-deluxy-signature": `sha256=${firma}`,
      ...(idempotenza ? { "x-idempotency-key": idempotenza } : {}),
    },
    ...(corpo ? { body: corpo } : {}),
    signal: AbortSignal.timeout(15000),
  });
  return { stato: res.status, dati: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

export type EsitoRichiesta =
  | { ok: true; riferimento: string; stato: string; ripetuta: boolean; nota?: string }
  | { ok: false; errore: string };

/** Chiede a Transactions il pagamento del dovuto di un mese a un partner.
 *
 *  `riferimentoEsterno` è la coppia partner+mese: la stessa richiesta non può
 *  generarne due, nemmeno se il bottone viene premuto due volte o se la rete
 *  fa ripetere la chiamata. Su un'app che muove denaro è la garanzia che conta
 *  più di tutte. */
export async function richiediPagamentoPartner(opts: {
  partnerId: string;
  beneficiario: string;
  iban: string;
  importo: number;
  anno: number;
  mese: number;
  causale: string;
  note?: string;
}): Promise<EsitoRichiesta> {
  const riferimentoEsterno = `saldo-${opts.partnerId}-${opts.anno}-${String(opts.mese).padStart(2, "0")}`;
  try {
    const { stato, dati } = await chiamataFirmata(
      "POST",
      "/api/v1/richieste",
      {
        importo: opts.importo.toFixed(2),
        beneficiario: opts.beneficiario.slice(0, 120),
        iban: opts.iban.replace(/\s+/g, "").toUpperCase(),
        causale: opts.causale.slice(0, 140), // limite SEPA
        categoria: "partner",
        note: opts.note,
        riferimentoEsterno,
        ...(urlNotifica() ? { urlNotifica: urlNotifica() } : {}),
      },
      riferimentoEsterno // chiave di idempotenza: un retry non crea un secondo pagamento
    );

    if (stato === 200 || stato === 201) {
      return {
        ok: true,
        riferimento: String(dati?.riferimento ?? ""),
        stato: String(dati?.stato ?? "in_attesa"),
        ripetuta: Boolean(dati?.ripetuta),
        nota: dati?.nota ? String(dati.nota) : undefined,
      };
    }
    const msg = dati?.errore ?? dati?.error ?? dati?.messaggio;
    return { ok: false, errore: `Transactions ha risposto ${stato}${msg ? `: ${String(msg)}` : ""}` };
  } catch (e) {
    return { ok: false, errore: `Transactions non raggiungibile: ${(e as Error).message}` };
  }
}

/** Verifica la firma di una notifica IN ARRIVO da Transactions.
 *  La documentazione di Transactions è esplicita: la notifica è un avviso, non
 *  una prova. Senza questo controllo chiunque conoscesse l'URL potrebbe
 *  raccontare a Finance che un pagamento è stato eseguito. */
export function notificaAutentica(corpoGrezzo: string, timestamp: string, firmaHeader: string): boolean {
  const segreto = env("TRANSACTIONS_HMAC_SECRET");
  if (!segreto || !timestamp || !firmaHeader) return false;
  // Marca temporale fuori da ±5 minuti: si rifiuta, come fa Transactions con noi.
  const eta = Math.abs(Date.now() - Number(timestamp));
  if (!Number.isFinite(eta) || eta > 5 * 60_000) return false;

  const impronta = createHash("sha256").update(corpoGrezzo).digest("hex");
  const attesa = createHmac("sha256", segreto).update(`${timestamp}\n${impronta}`).digest("hex");
  const inviata = firmaHeader.replace(/^sha256=/, "").trim();
  if (inviata.length !== attesa.length) return false;
  // Confronto a tempo costante, senza uscire al primo byte diverso.
  let diff = 0;
  for (let i = 0; i < attesa.length; i++) diff |= attesa.charCodeAt(i) ^ inviata.charCodeAt(i);
  return diff === 0;
}

export const STATI_RICHIESTA: Record<string, { label: string; badge: string }> = {
  in_attesa: { label: "In attesa di firma", badge: "orange" },
  sospesa: { label: "Sospesa", badge: "orange" },
  approvata: { label: "Approvata", badge: "blue" },
  in_lotto: { label: "In distinta SEPA", badge: "blue" },
  pagata: { label: "Pagata", badge: "green" },
  rifiutata: { label: "Rifiutata", badge: "red" },
  annullata: { label: "Annullata", badge: "neutral" },
};
