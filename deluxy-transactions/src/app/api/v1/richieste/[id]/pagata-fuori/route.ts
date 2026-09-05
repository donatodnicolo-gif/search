import { NextRequest } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { autentica, erroreApi, ipChiamante, rispostaApi } from "@/lib/api-auth";
import { chiudiDichiarataDallOrigine } from "@/lib/richieste";
import { METODI_FUORI } from "@/lib/metodi-fuori";
import { notificaOrigine } from "@/lib/webhook";

// POST /api/v1/richieste/<id | riferimento | riferimentoEsterno>/pagata-fuori
//
// L'app di origine dichiara che il beneficiario è GIÀ stato pagato per un'altra
// strada (portale della banca, contanti, compensazione…): la richiesta esce
// dalla coda come «pagata fuori dall'app», con attore = nome dell'app.
//
// Perché esiste (05/09/2026): il Customer Service segnava «pagata» una
// richiesta dopo il bonifico a mano, e qui restava `in_attesa` — un operatore
// l'avrebbe pagata una seconda volta. Con Finance era già successo su 7
// richieste (4.794,45 €).
//
// Perché NON è una seconda porta per il denaro (SICUREZZA.md §0-ter): da qui
// non esce un euro. È la stessa registrazione che fa un operatore, meno il
// secondo fattore — al suo posto ci sono la firma HMAC della chiave, il
// vincolo «solo le richieste di QUESTA chiave» (come l'annullo), il motivo
// obbligatorio e `dichiaratoDa` nell'evento: chi legge il registro sa che la
// prova non ce l'ha nessuno qui. Perimetro = quello dell'annullo via API:
// solo `in_attesa` o `sospesa` (revisione ostile 05/09: oltre, un login
// qualsiasi dell'app di origine avrebbe potuto cancellare una decisione
// firmata da due operatori e spegnere uno sblocco in corso). Dopo
// l'approvazione risponde 409: la chiude un operatore dentro Transactions.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await autentica(req, { scrittura: true });
  if (!auth.ok) return auth.risposta;
  const { id } = await ctx.params;

  const r = await prisma.richiesta.findFirst({
    where: { chiaveApiId: auth.cliente.id, OR: [{ id }, { riferimento: id }, { riferimentoEsterno: id }] },
    select: { id: true },
  });
  if (!r) return erroreApi(404, "Richiesta non trovata per questa chiave.");

  let corpo: { metodo?: unknown; dataPagamento?: unknown; motivo?: unknown } = {};
  try {
    corpo = JSON.parse(auth.corpo || "{}") as typeof corpo;
  } catch {
    return erroreApi(400, "Corpo non leggibile.");
  }
  const metodo = String(corpo.metodo ?? "").trim();
  if (!METODI_FUORI[metodo]) {
    return erroreApi(400, `metodo obbligatorio: uno fra ${Object.keys(METODI_FUORI).join(", ")}.`);
  }
  // Tetto sul motivo: finisce nel registro, nell'outbox e nel webhook.
  const motivo = String(corpo.motivo ?? "").trim().slice(0, 500);
  const dataPagamento = corpo.dataPagamento == null ? "" : String(corpo.dataPagamento).trim();
  if (dataPagamento && !/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento)) {
    return erroreApi(400, "dataPagamento nel formato AAAA-MM-GG.");
  }

  const esito = await chiudiDichiarataDallOrigine(r.id, auth.cliente.nome, { metodo, motivo, dataPagamento }, ipChiamante(req));
  if (!esito.ok) return erroreApi(409, esito.errore);
  // Anche questa chiusura passa dal canale degli esiti: l'app di origine (e
  // chiunque altro ascolti) riceve `pagata` con `pagatoCon: fuori_app`.
  after(() => notificaOrigine(r.id, { motivo: `${motivo} (dichiarato da ${auth.cliente.nome})` }));
  return rispostaApi({ stato: "pagata", pagatoCon: "fuori_app", messaggio: esito.messaggio });
}
