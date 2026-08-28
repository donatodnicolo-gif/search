import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { autentica, erroreApi, ipChiamante, rispostaApi } from "@/lib/api-auth";
import { elencaAllegati, salvaAllegato, TETTO_ALLEGATO } from "@/lib/allegati";

// GET  /api/v1/richieste/<id|riferimento>/allegati — metadati degli allegati.
// POST /api/v1/richieste/<id|riferimento>/allegati — l'app di origine allega
//      un documento A CORREDO della richiesta (la fattura ricevuta, lo
//      screenshot della chat). Corpo JSON: { nome, dati (base64) }.
//
// Il ruolo è SEMPRE "richiesta": la «prova» del pagamento la carica solo un
// operatore di quest'app — chi ha chiesto il pagamento non scrive la propria
// prova. Il tipo si verifica sui magic bytes, mai sul MIME dichiarato.

export const dynamic = "force-dynamic";
// Il corpo porta un file in base64 (fino a ~2 MB): serve più tempo del default.
export const maxDuration = 30;

async function trovaRichiesta(chiaveApiId: string, id: string) {
  return prisma.richiesta.findFirst({
    where: { chiaveApiId, OR: [{ id }, { riferimento: id }] },
    select: { id: true, riferimento: true },
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await autentica(req);
  if (!auth.ok) return auth.risposta;
  const { id } = await ctx.params;

  const r = await trovaRichiesta(auth.cliente.id, id);
  if (!r) return erroreApi(404, "Richiesta non trovata per questa chiave.");

  const allegati = await elencaAllegati(r.id);
  return rispostaApi({
    riferimento: r.riferimento,
    totale: allegati.length,
    allegati: allegati.map((a) => ({
      id: a.id,
      ruolo: a.ruolo,
      nome: a.nome,
      tipo: a.tipo,
      byte: a.byte,
      sha256: a.sha256,
      creatoIl: a.creatoIl.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await autentica(req, { scrittura: true });
  if (!auth.ok) return auth.risposta;
  const { id } = await ctx.params;

  const r = await trovaRichiesta(auth.cliente.id, id);
  if (!r) return erroreApi(404, "Richiesta non trovata per questa chiave.");

  let corpo: { nome?: unknown; dati?: unknown };
  try {
    corpo = JSON.parse(auth.corpo || "{}");
  } catch {
    return erroreApi(400, "Corpo JSON non valido.");
  }

  const base64 = String(corpo.dati ?? "").replace(/^data:[^;]+;base64,/, "");
  if (!base64) return erroreApi(400, "Manca il contenuto del file (campo `dati`, base64).");
  // Il tetto si controlla PRIMA di decodificare: base64 pesa +33%.
  if (base64.length > Math.ceil((TETTO_ALLEGATO * 4) / 3) + 8) {
    return erroreApi(413, `File troppo grande: il limite è ${Math.round(TETTO_ALLEGATO / 1000)} KB.`);
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    return erroreApi(400, "Il campo `dati` non è base64 valido.");
  }

  const esito = await salvaAllegato({
    richiestaId: r.id,
    ruolo: "richiesta",
    nome: String(corpo.nome ?? ""),
    buffer,
    caricatoDa: auth.cliente.nome,
    ip: ipChiamante(req),
  });
  if (!esito.ok) return erroreApi(esito.stato, esito.errore);
  return rispostaApi({ riferimento: r.riferimento, ...esito.allegato, ripetuto: esito.ripetuto }, esito.ripetuto ? 200 : 201);
}
