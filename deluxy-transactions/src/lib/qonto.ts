import { createHash } from "crypto";
import { prisma } from "./db";
import { cifra, decifra } from "./crypto";

// Collegamento alla banca (Qonto Business API).
//
// Documentazione letta il 26/07/2026 su docs.qonto.com:
//  · base           https://thirdparty.qonto.com/v2
//  · autenticazione header `Authorization: <sign-in>:<secret-key>` — NON è
//                   Basic, non va in base64
//  · conti          GET  /bank_accounts
//  · movimenti      GET  /transactions?bank_account_id=…
//  · beneficiari    GET  /sepa/beneficiaries?trusted=true
//  · controllo nome POST /sepa/verify_payee      (VoP, obbligatorio in SEPA)
//  · bonifico       POST /sepa/transfers         (serve il proof token del VoP)
//
// Due cose imparate dalla documentazione e da non dimenticare:
//
//  1. Il bonifico via API chiede la **SCA** (conferma sul telefono di chi ha
//     autorizzato l'app) A MENO CHE il beneficiario non sia «trusted», e un
//     beneficiario si rende fidato solo dentro l'app Qonto, a mano. Quindi:
//     questa app paga solo beneficiari già fidati in Qonto. Non è un limite da
//     aggirare, è un secondo lucchetto che sta fuori dalla nostra portata — se
//     qualcuno prende questo server, non può inventarsi un beneficiario nuovo e
//     pagarlo.
//  2. Il `vop_proof_token` del controllo nome/IBAN vale 23 ore e serve per
//     forza. Il controllo dice se il nome corrisponde davvero all'intestatario:
//     è la difesa contro la fattura con l'IBAN cambiato.
//
// I vecchi endpoint `external_transfers` sono stati dismessi il 31/03/2026:
// qui si usa solo `sepa/transfers`.

const BASE = (process.env.QONTO_BASE_URL ?? "https://thirdparty.qonto.com/v2").replace(/\/$/, "");
const TIMEOUT_MS = 20_000;

export type ConfigQonto = { login: string; segreto: string; contoId: string | null; da: "app" | "ambiente" };

// Dove stanno le chiavi della banca.
//
// Si possono mettere in due posti: dalla pagina Impostazioni (finiscono sul
// database **cifrate** AES-256-GCM con TRANSACTIONS_ENC_KEY) oppure nelle
// variabili d'ambiente di Vercel. Vince quello che c'è nell'app: è lì che una
// persona le cambia quando ruota la chiave in Qonto.
//
// Perché qui è ammesso il database e per l'SMTP no (docs/SICUREZZA.md §0): chi
// riuscisse a scrivere sul database e sostituisse queste chiavi non ruberebbe
// niente — pagherebbe dal PROPRIO conto. Sostituire l'SMTP invece dirotta i
// codici di sblocco, e quello sì che è un furto.
export const CHIAVI_QONTO = {
  login: "qonto.login",
  segreto: "qonto.secret",
  conto: "qonto.bankAccountId",
} as const;

export async function configQonto(): Promise<ConfigQonto | null> {
  try {
    const righe = await prisma.impostazione.findMany({
      where: { chiave: { in: [CHIAVI_QONTO.login, CHIAVI_QONTO.segreto, CHIAVI_QONTO.conto] } },
    });
    const m = new Map(righe.map((r) => [r.chiave, r.valore]));
    const login = m.get(CHIAVI_QONTO.login);
    const segreto = m.get(CHIAVI_QONTO.segreto);
    if (login && segreto) {
      return {
        login: decifra(login),
        segreto: decifra(segreto),
        contoId: m.get(CHIAVI_QONTO.conto) ? decifra(m.get(CHIAVI_QONTO.conto)!) : null,
        da: "app",
      };
    }
  } catch {
    // database irraggiungibile o chiave di cifratura sbagliata: si prova con
    // l'ambiente, non si finge di essere collegati
  }

  const login = (process.env.QONTO_LOGIN ?? "").trim();
  const segreto = (process.env.QONTO_SECRET_KEY ?? "").trim();
  if (!login || !segreto) return null;
  return {
    login,
    segreto,
    contoId: (process.env.QONTO_BANK_ACCOUNT_ID ?? "").trim() || null,
    da: "ambiente",
  };
}

export async function qontoConfigurato(): Promise<boolean> {
  return (await configQonto()) != null;
}

/** Salva le chiavi inserite dalla pagina Impostazioni, cifrate. */
export async function salvaChiaviQonto(dati: { login: string; segreto: string; contoId: string }): Promise<void> {
  const scrivi = async (chiave: string, valore: string) => {
    await prisma.impostazione.upsert({
      where: { chiave },
      update: { valore: cifra(valore) },
      create: { chiave, valore: cifra(valore) },
    });
  };
  await scrivi(CHIAVI_QONTO.login, dati.login);
  await scrivi(CHIAVI_QONTO.segreto, dati.segreto);
  await scrivi(CHIAVI_QONTO.conto, dati.contoId);
}

export async function scollegaQonto(): Promise<void> {
  await prisma.impostazione.deleteMany({
    where: { chiave: { in: [CHIAVI_QONTO.login, CHIAVI_QONTO.segreto, CHIAVI_QONTO.conto] } },
  });
}

/** Cosa mostrare in pagina senza far vedere il segreto. */
export async function statoCollegamento(): Promise<{
  collegato: boolean;
  da: "app" | "ambiente" | null;
  login: string;
  contoId: string;
}> {
  const c = await configQonto();
  if (!c) return { collegato: false, da: null, login: "", contoId: "" };
  return { collegato: true, da: c.da, login: c.login, contoId: c.contoId ?? "" };
}

export type EsitoChiamata<T> = { ok: true; dati: T } | { ok: false; errore: string; stato?: number };

async function chiama<T>(
  percorso: string,
  opzioni: { metodo?: string; corpo?: unknown; intestazioni?: Record<string, string>; con?: ConfigQonto } = {},
): Promise<EsitoChiamata<T>> {
  const c = opzioni.con ?? (await configQonto());
  if (!c) {
    return { ok: false, errore: "Qonto non collegato: inserisci le chiavi in Impostazioni → Collegamento alla banca." };
  }

  const controllo = new AbortController();
  const timer = setTimeout(() => controllo.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${BASE}${percorso}`, {
      method: opzioni.metodo ?? "GET",
      headers: {
        // Formato voluto da Qonto: login e segreto separati da due punti, in
        // chiaro. Sembra Basic ma non lo è.
        Authorization: `${c.login}:${c.segreto}`,
        "content-type": "application/json",
        accept: "application/json",
        ...(opzioni.intestazioni ?? {}),
      },
      body: opzioni.corpo == null ? undefined : JSON.stringify(opzioni.corpo),
      signal: controllo.signal,
      cache: "no-store",
    });

    const testo = await r.text();
    let corpo: unknown = null;
    try {
      corpo = testo ? JSON.parse(testo) : null;
    } catch {
      corpo = null;
    }

    if (!r.ok) {
      return { ok: false, stato: r.status, errore: messaggioErrore(r.status, corpo, testo) };
    }
    return { ok: true, dati: corpo as T };
  } catch (e) {
    const err = e as Error;
    return {
      ok: false,
      errore: err.name === "AbortError" ? "La banca non ha risposto entro 20 secondi." : `Banca irraggiungibile: ${err.message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

function messaggioErrore(stato: number, corpo: unknown, grezzo: string): string {
  const c = corpo as { errors?: { detail?: string; title?: string; code?: string }[] } | null;
  const dettaglio = c?.errors?.map((e) => e.detail || e.title || e.code).filter(Boolean).join("; ");
  const testo = dettaglio || grezzo.slice(0, 300) || "nessun dettaglio";
  if (stato === 401) return `Qonto rifiuta le credenziali (401): ${testo}`;
  if (stato === 403) return `Qonto nega il permesso (403) — di solito manca la SCA o il beneficiario non è fidato: ${testo}`;
  if (stato === 400) return `Qonto rifiuta la richiesta (400): ${testo}`;
  return `Qonto ha risposto ${stato}: ${testo}`;
}

// ---------------------------------------------------------------------------
// Lettura: conti e movimenti
// ---------------------------------------------------------------------------

export type ContoQonto = {
  id: string;
  name?: string;
  iban?: string;
  bic?: string;
  balance_cents?: number;
  authorized_balance_cents?: number;
  currency?: string;
  status?: string;
  main?: boolean;
};

/**
 * Prova le chiavi PRIMA di salvarle: chiede l'elenco dei conti. Se il conto
 * indicato non esiste, lo dice adesso e non davanti a una distinta sbloccata.
 */
export async function provaChiaviQonto(dati: { login: string; segreto: string; contoId: string | null }): Promise<
  { ok: true; conti: number } | { ok: false; errore: string }
> {
  const r = await chiama<{ bank_accounts?: ContoQonto[] }>("/bank_accounts?per_page=100", {
    con: { login: dati.login, segreto: dati.segreto, contoId: dati.contoId, da: "app" },
  });
  if (!r.ok) return { ok: false, errore: r.errore };
  const elenco = (r.dati?.bank_accounts ?? []).filter((c) => c.status !== "closed");
  if (elenco.length === 0) return { ok: false, errore: "le chiavi funzionano ma non si vede nessun conto attivo." };
  if (dati.contoId && !elenco.some((c) => c.id === dati.contoId)) {
    return {
      ok: false,
      errore: `nessun conto con id ${dati.contoId}. Lascia vuoto il campo per usare il principale, oppure copia un id fra questi: ${elenco
        .map((c) => `${c.name ?? "conto"} = ${c.id}`)
        .join(", ")}`,
    };
  }
  return { ok: true, conti: elenco.length };
}

export async function conti(): Promise<EsitoChiamata<ContoQonto[]>> {
  const r = await chiama<{ bank_accounts?: ContoQonto[] }>("/bank_accounts?per_page=100");
  if (!r.ok) return r;
  return { ok: true, dati: r.dati?.bank_accounts ?? [] };
}

/** Il conto da usare: quello indicato nell'ambiente, altrimenti il principale. */
export async function contoDaUsare(): Promise<EsitoChiamata<ContoQonto>> {
  const c = await configQonto();
  const elenco = await conti();
  if (!elenco.ok) return elenco;
  const attivi = elenco.dati.filter((x) => x.status !== "closed");
  const scelto = c?.contoId
    ? attivi.find((x) => x.id === c.contoId)
    : attivi.find((x) => x.main) ?? attivi[0];
  if (!scelto) {
    return {
      ok: false,
      errore: c?.contoId
        ? `Nessun conto Qonto con id ${c.contoId}: controlla QONTO_BANK_ACCOUNT_ID.`
        : "Qonto non espone nessun conto attivo.",
    };
  }
  return { ok: true, dati: scelto };
}

export type MovimentoQonto = {
  id: string;
  transaction_id?: string;
  amount_cents?: number;
  currency?: string;
  side?: "credit" | "debit";
  status?: string;
  label?: string;
  reference?: string;
  settled_at?: string;
  emitted_at?: string;
};

export async function movimenti(opzioni: { contoId: string; dal?: Date; soloUscite?: boolean }): Promise<
  EsitoChiamata<MovimentoQonto[]>
> {
  const q = new URLSearchParams({ bank_account_id: opzioni.contoId, per_page: "100", sort_by: "settled_at:desc" });
  q.append("status[]", "completed");
  if (opzioni.soloUscite) q.set("side", "debit");
  if (opzioni.dal) q.set("settled_at_from", opzioni.dal.toISOString());
  const r = await chiama<{ transactions?: MovimentoQonto[] }>(`/transactions?${q.toString()}`);
  if (!r.ok) return r;
  return { ok: true, dati: r.dati?.transactions ?? [] };
}

// ---------------------------------------------------------------------------
// Beneficiari fidati
// ---------------------------------------------------------------------------

export type BeneficiarioQonto = { id: string; name?: string; iban?: string; trusted?: boolean; status?: string };

export async function beneficiariFidati(): Promise<EsitoChiamata<BeneficiarioQonto[]>> {
  const r = await chiama<{ beneficiaries?: BeneficiarioQonto[] }>("/sepa/beneficiaries?trusted=true&per_page=100");
  if (!r.ok) return r;
  return { ok: true, dati: r.dati?.beneficiaries ?? [] };
}

// ---------------------------------------------------------------------------
// Controllo del nome sull'IBAN (VoP) — obbligatorio prima di ogni bonifico
// ---------------------------------------------------------------------------

export type EsitoVop = {
  risultato: "MATCH" | "CLOSE_MATCH" | "NO_MATCH" | "NOT_POSSIBLE" | "SCONOSCIUTO";
  nomeTrovato?: string;
  proofToken?: string;
};

export async function controllaIntestatario(iban: string, nome: string): Promise<EsitoChiamata<EsitoVop>> {
  const r = await chiama<{
    match_result?: string;
    matched_name?: string;
    proof_token?: { token?: string };
  }>("/sepa/verify_payee", { metodo: "POST", corpo: { iban, beneficiary_name: nome.slice(0, 140) } });
  if (!r.ok) return r;
  const grezzo = r.dati?.match_result ?? "";
  const risultato = grezzo.replace(/^MATCH_RESULT_/, "");
  return {
    ok: true,
    dati: {
      risultato: (["MATCH", "CLOSE_MATCH", "NO_MATCH", "NOT_POSSIBLE"] as const).includes(
        risultato as "MATCH",
      )
        ? (risultato as EsitoVop["risultato"])
        : "SCONOSCIUTO",
      nomeTrovato: r.dati?.matched_name,
      proofToken: r.dati?.proof_token?.token,
    },
  };
}

// ---------------------------------------------------------------------------
// Bonifico
// ---------------------------------------------------------------------------

/**
 * Chiave di idempotenza deterministica: la stessa richiesta Deluxy genera
 * sempre lo stesso UUID, così un doppio clic o un retry di rete non paga due
 * volte. Qonto vuole un UUID, quindi si dà forma di UUID all'hash.
 */
export function chiaveIdempotenza(richiestaId: string): string {
  const h = createHash("sha256").update(`deluxy-transactions:${richiestaId}`).digest("hex");
  const v = `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
  return v;
}

export type BonificoFatto = { id: string; stato: string };

export async function creaBonifico(opzioni: {
  contoId: string;
  beneficiarioId: string;
  importoCent: number;
  causale: string;
  proofToken: string;
  richiestaId: string;
  nota?: string;
}): Promise<EsitoChiamata<BonificoFatto>> {
  const importo = (opzioni.importoCent / 100).toFixed(2);
  const r = await chiama<{ sepa_transfer?: { id?: string; status?: string }; transfer?: { id?: string; status?: string } }>(
    "/sepa/transfers",
    {
      metodo: "POST",
      intestazioni: { "X-Qonto-Idempotency-Key": chiaveIdempotenza(opzioni.richiestaId) },
      corpo: {
        vop_proof_token: opzioni.proofToken,
        transfer: {
          bank_account_id: opzioni.contoId,
          beneficiary_id: opzioni.beneficiarioId,
          reference: opzioni.causale.slice(0, 140),
          amount: importo,
          ...(opzioni.nota ? { note: opzioni.nota.slice(0, 140) } : {}),
        },
      },
    },
  );
  if (!r.ok) return r;
  const t = r.dati?.sepa_transfer ?? r.dati?.transfer;
  return { ok: true, dati: { id: t?.id ?? "", stato: t?.status ?? "sconosciuto" } };
}
