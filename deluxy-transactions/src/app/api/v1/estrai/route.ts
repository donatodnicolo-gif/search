import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { autentica, erroreApi, rispostaApi } from "@/lib/api-auth";
import { estraiPagamento, estrazioneConfigurata, type Immagine } from "@/lib/ai-estrai";
import { TETTO_ALLEGATO } from "@/lib/allegati";

// POST /api/v1/estrai — lettura AI di una richiesta di pagamento.
//
// Il motore centrale per le app che non ne hanno uno proprio (Finance, Scout,
// Piattaforma): da { testo } o { immagine: { dati, tipo } } escono importo,
// IBAN, intestatario, causale — PROPOSTI. L'esito non scrive niente da
// nessuna parte: riempie un modulo che una persona rilegge e conferma
// (regola di Libro, giuria 28/08/2026).
//
// Se Transactions non risponde, il modulo si compila a mano: la degradazione
// è dichiarata e innocua.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Rate limit dedicato e più severo del generale: ogni chiamata costa denaro
// (API del modello). E qui FAIL-CLOSED: se il contatore non è scrivibile si
// nega, non si passa — al contrario del limite generale, dove un contatore
// rotto non deve bloccare una richiesta di pagamento.
const ESTRAZIONI_AL_MINUTO = 10;

async function superaLimiteEstrai(chiaveId: string): Promise<boolean> {
  const minuto = Math.floor(Date.now() / 60_000);
  const id = `estrai:${chiaveId}:${minuto}`;
  try {
    const riga = await prisma.contatore.upsert({
      where: { id },
      update: { colpi: { increment: 1 } },
      create: { id, colpi: 1, scadeIl: new Date((minuto + 2) * 60_000) },
    });
    return riga.colpi > ESTRAZIONI_AL_MINUTO;
  } catch {
    return true; // fail-closed: senza contatore, niente estrazione
  }
}

export async function POST(req: NextRequest) {
  const auth = await autentica(req, { scrittura: true });
  if (!auth.ok) return auth.risposta;

  if (!estrazioneConfigurata()) {
    return erroreApi(503, "Lettura AI non configurata su Transactions (manca la chiave del modello).");
  }
  if (await superaLimiteEstrai(auth.cliente.id)) {
    return erroreApi(429, `Troppe letture AI: massimo ${ESTRAZIONI_AL_MINUTO} al minuto per app.`);
  }

  let corpo: { testo?: unknown; immagine?: { dati?: unknown; tipo?: unknown } };
  try {
    corpo = JSON.parse(auth.corpo || "{}");
  } catch {
    return erroreApi(400, "Corpo JSON non valido.");
  }

  const testo = typeof corpo.testo === "string" ? corpo.testo.slice(0, 20_000) : undefined;
  let immagine: Immagine | undefined;
  if (corpo.immagine?.dati) {
    const dati = String(corpo.immagine.dati).replace(/^data:[^;]+;base64,/, "");
    const tipo = String(corpo.immagine.tipo ?? "image/png");
    if (dati.length > Math.ceil((TETTO_ALLEGATO * 4) / 3) + 8) {
      return erroreApi(413, `Immagine troppo grande: il limite è ${Math.round(TETTO_ALLEGATO / 1000)} KB.`);
    }
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(tipo)) {
      return erroreApi(415, "Tipo immagine non supportato: png, jpeg, webp o gif.");
    }
    immagine = { dati, tipo };
  }
  if (!testo && !immagine) return erroreApi(400, "Serve un testo o un'immagine da leggere.");

  const esito = await estraiPagamento({ testo, immagine });
  if (esito.stato === "non-configurato") {
    return erroreApi(503, "Lettura AI non configurata su Transactions.");
  }
  if (esito.stato === "errore") return erroreApi(502, `Lettura fallita: ${esito.messaggio}`);

  return rispostaApi({
    dati: esito.dati,
    ibanValido: esito.ibanValido,
    ibanPaese: esito.ibanPaese,
    fornitore: esito.fornitore,
    nota: "Dati PROPOSTI dalla lettura: vanno riletti da una persona prima di qualunque salvataggio.",
  });
}
