import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./db";
import { confrontaSicuro, decifra, hmacSha256, sha256 } from "./crypto";
import { registra } from "./audit";
import { leggiRegole } from "./impostazioni";

// Autenticazione delle API che le altre app Deluxy usano per chiedere un
// pagamento. Rispetto allo standard §4.3 (chiave in x-api-key) qui si aggiunge
// tutto quello che serve quando in ballo ci sono dei soldi:
//
//   1. chiave API — SHA-256 sul database, il valore in chiaro non esiste qui;
//   2. FIRMA HMAC-SHA256 del corpo — chi intercetta la chiave non basta:
//      serve anche il segreto di firma, che viaggia solo alla creazione;
//   3. marca temporale ±5 minuti — una richiesta vecchia non si può rigiocare;
//   4. NONCE usa-e-getta — nemmeno una richiesta fresca si può rigiocare;
//   5. lista di IP consentiti, se impostata sulla chiave;
//   6. limite di colpi al minuto per chiave;
//   7. idempotenza — un retry di rete non genera due bonifici.
//
// Header attesi:
//   x-api-key:            <chiave>
//   x-deluxy-timestamp:   <millisecondi epoch>
//   x-deluxy-nonce:       <stringa unica, max 80 caratteri>
//   x-deluxy-signature:   sha256=<hmac esadecimale>
//   x-idempotency-key:    <facoltativo, per POST>
//
// Da firmare: `<metodo>\n<percorso>\n<timestamp>\n<nonce>\n<sha256 del corpo>`
// dove <percorso> comprende la query (`/api/v1/richieste?stato=in_attesa`).

export type Cliente = {
  id: string;
  nome: string;
  puoRichiedere: boolean;
  puoLeggere: boolean;
  tettoRichiesta: number;
  tettoGiornaliero: number;
};

export type EsitoAuth = { ok: true; cliente: Cliente; corpo: string } | { ok: false; risposta: NextResponse };

export function erroreApi(status: number, messaggio: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    { errore: messaggio, ...extra },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function rispostaApi(dati: unknown, status = 200) {
  return NextResponse.json(dati, { status, headers: { "Cache-Control": "no-store" } });
}

export function ipChiamante(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "sconosciuto";
}

function estraiChiave(req: NextRequest): string | null {
  const diretta = req.headers.get("x-api-key");
  if (diretta) return diretta.trim();
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

/** Stringa canonica da firmare. È anche quella che il client deve costruire. */
export function stringaDaFirmare(
  metodo: string,
  percorso: string,
  timestamp: string,
  nonce: string,
  corpo: string,
): string {
  return [metodo.toUpperCase(), percorso, timestamp, nonce, sha256(corpo)].join("\n");
}

async function superaLimite(chiaveId: string, colpiAlMinuto: number): Promise<boolean> {
  if (colpiAlMinuto <= 0) return false;
  const minuto = Math.floor(Date.now() / 60_000);
  const id = `${chiaveId}:${minuto}`;
  try {
    const riga = await prisma.contatore.upsert({
      where: { id },
      update: { colpi: { increment: 1 } },
      create: { id, colpi: 1, scadeIl: new Date((minuto + 2) * 60_000) },
    });
    return riga.colpi > colpiAlMinuto;
  } catch {
    // Il contatore non deve bloccare l'app: se non si scrive, si passa.
    return false;
  }
}

/**
 * Verifica tutto e restituisce il cliente e il corpo grezzo (già letto: il
 * body di una Request si legge una volta sola, e serviva per la firma).
 */
export async function autentica(
  req: NextRequest,
  opzioni: { scrittura?: boolean } = {},
): Promise<EsitoAuth> {
  const ip = ipChiamante(req);
  const nega = async (status: number, messaggio: string, dettagli: Record<string, unknown> = {}) => {
    // Ogni rifiuto finisce nel registro: è così che si vede un tentativo.
    await registra("sicurezza.allarme", "api", { messaggio, ip, ...dettagli });
    return { ok: false as const, risposta: erroreApi(status, messaggio) };
  };

  const chiave = estraiChiave(req);
  if (!chiave) {
    return { ok: false, risposta: erroreApi(401, "Chiave API mancante: header x-api-key o Authorization: Bearer") };
  }

  const record = await prisma.chiaveApi.findUnique({ where: { hash: sha256(chiave) } });
  if (!record) return nega(401, "Chiave API non valida");
  if (!record.attiva || record.revocataIl) return nega(401, "Chiave API revocata", { chiave: record.nome });
  if (record.scadeIl && record.scadeIl.getTime() < Date.now()) {
    return nega(401, "Chiave API scaduta", { chiave: record.nome });
  }

  // Lista di IP consentiti (facoltativa, ma consigliata per le app server).
  if (record.ipConsentiti.trim()) {
    const ammessi = record.ipConsentiti.split(",").map((s) => s.trim()).filter(Boolean);
    if (!ammessi.includes(ip)) {
      return nega(403, "Indirizzo IP non autorizzato per questa chiave", { chiave: record.nome });
    }
  }

  if (opzioni.scrittura && !record.puoRichiedere) {
    return nega(403, "Questa chiave non può creare richieste di pagamento", { chiave: record.nome });
  }
  if (!opzioni.scrittura && !record.puoLeggere) {
    return nega(403, "Questa chiave non può leggere", { chiave: record.nome });
  }

  const regole = await leggiRegole();

  if (await superaLimite(record.id, regole.colpiAlMinuto)) {
    return nega(429, `Troppe richieste: massimo ${regole.colpiAlMinuto} al minuto`, { chiave: record.nome });
  }

  // ---- firma ----
  const corpo = req.method === "GET" || req.method === "HEAD" ? "" : await req.text();
  const timestamp = req.headers.get("x-deluxy-timestamp") ?? "";
  const nonce = req.headers.get("x-deluxy-nonce") ?? "";
  const firma = (req.headers.get("x-deluxy-signature") ?? "").replace(/^sha256=/i, "").trim();

  if (!timestamp || !nonce || !firma) {
    return nega(401, "Richiesta non firmata: servono x-deluxy-timestamp, x-deluxy-nonce e x-deluxy-signature", {
      chiave: record.nome,
    });
  }
  if (nonce.length > 80) return nega(400, "Nonce troppo lungo (max 80 caratteri)", { chiave: record.nome });

  const ts = Number(timestamp);
  const tolleranza = Math.max(1, regole.minutiFirma) * 60_000;
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > tolleranza) {
    return nega(401, `Marca temporale fuori finestra (±${regole.minutiFirma} minuti): controlla l'orologio del server`, {
      chiave: record.nome,
    });
  }

  let segreto: string;
  try {
    segreto = decifra(record.segretoHmac);
  } catch {
    return nega(500, "Segreto di firma non leggibile: TRANSACTIONS_ENC_KEY errata o cambiata", { chiave: record.nome });
  }

  // Nella firma entra anche la query: altrimenti un ?limite=1000 o un filtro
  // diverso passerebbero senza che la firma se ne accorga.
  const indirizzo = new URL(req.url);
  const percorso = indirizzo.pathname + indirizzo.search;
  const attesa = hmacSha256(segreto, stringaDaFirmare(req.method, percorso, timestamp, nonce, corpo));
  if (!confrontaSicuro(attesa, firma)) {
    return nega(401, "Firma non valida", { chiave: record.nome, percorso });
  }

  // ---- nonce usa-e-getta ----
  try {
    await prisma.nonce.create({
      data: { valore: `${record.id}:${nonce}`, chiaveId: record.id, scadeIl: new Date(Date.now() + tolleranza * 2) },
    });
  } catch {
    // vincolo di unicità = nonce già visto: è un replay
    return nega(409, "Nonce già utilizzato: richiesta rigiocata", { chiave: record.nome });
  }

  prisma.chiaveApi.update({ where: { id: record.id }, data: { ultimoUso: new Date() } }).catch(() => {});

  return {
    ok: true,
    cliente: {
      id: record.id,
      nome: record.nome,
      puoRichiedere: record.puoRichiedere,
      puoLeggere: record.puoLeggere,
      tettoRichiesta: record.tettoRichiesta,
      tettoGiornaliero: record.tettoGiornaliero,
    },
    corpo,
  };
}

// ---------------------------------------------------------------------------
// Idempotenza
// ---------------------------------------------------------------------------

export type EsitoIdempotenza =
  | { tipo: "nuova"; chiave: string | null }
  | { tipo: "ripetuta"; risposta: NextResponse }
  | { tipo: "conflitto"; risposta: NextResponse };

/** Se la stessa chiave è già stata usata, ridà la risposta di allora. */
export async function controllaIdempotenza(
  req: NextRequest,
  clienteId: string,
  corpo: string,
): Promise<EsitoIdempotenza> {
  const chiave = (req.headers.get("x-idempotency-key") ?? "").trim();
  if (!chiave) return { tipo: "nuova", chiave: null };
  const impronta = sha256(corpo);
  try {
    const esistente = await prisma.idempotenza.findUnique({
      where: { chiaveApiId_chiave: { chiaveApiId: clienteId, chiave } },
    });
    if (!esistente) return { tipo: "nuova", chiave };
    if (esistente.impronta !== impronta) {
      return {
        tipo: "conflitto",
        risposta: erroreApi(409, "Chiave di idempotenza già usata con un corpo diverso"),
      };
    }
    return {
      tipo: "ripetuta",
      risposta: NextResponse.json(JSON.parse(esistente.risposta), {
        status: 200,
        headers: { "Cache-Control": "no-store", "x-idempotenza": "ripetuta" },
      }),
    };
  } catch {
    return { tipo: "nuova", chiave };
  }
}

export async function memorizzaIdempotenza(
  clienteId: string,
  chiave: string | null,
  corpo: string,
  risposta: unknown,
): Promise<void> {
  if (!chiave) return;
  try {
    await prisma.idempotenza.create({
      data: { chiaveApiId: clienteId, chiave, impronta: sha256(corpo), risposta: JSON.stringify(risposta) },
    });
  } catch {
    // corsa fra due retry simultanei: la prima ha già scritto, va bene così
  }
}
