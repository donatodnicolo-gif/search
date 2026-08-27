import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { salvaCensimento } from "@/lib/censimento-storico";
import { prisma } from "@/lib/db";
import { censimentoStoricoMeta, metaConfigurato } from "@/lib/meta";

// POST /api/v1/censimento/meta — il censimento storico del lato META.
//
// ⚠️ PERCHÉ È UNA ROTTA E NON UNO SCRIPT LOCALE. Su Google il censimento lo
// fa uno script incollato dentro l'account, che non ha segreti da custodire.
// Su Meta serve `META_ACCESS_TOKEN`, che vive SOLO come variabile d'ambiente
// su Vercel: uno script sul portatile o non ce l'ha, o costringerebbe a
// copiarlo su disco. Quindi il lavoro lo fa l'app, dove il token già c'è, e da
// fuori si bussa con la chiave API.
//
// Body: { anni?: 3, dal?: "2023-01-01", al?: "2026-08-27", account?: "1040…" }
// Senza `account` li fa tutti quelli censiti come attivi.
export const dynamic = "force-dynamic";
// Tre anni × tre account, a mesi: sono chiamate lente ma poche. 300 come il
// cron di Drive, per lo stesso motivo — meglio finire che essere uccisi a metà.
export const maxDuration = 300;

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function POST(req: NextRequest) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;

  if (!metaConfigurato()) {
    // ⚠️ 503, non 500: non è rotto, manca un permesso. Sono due diagnosi
    // opposte e portano a due azioni opposte.
    return erroreApi(503, "META_ACCESS_TOKEN non impostato: il censimento Meta non può partire.");
  }

  let body: { anni?: number; dal?: string; al?: string; account?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Body vuoto = tutti gli account, ultimi 3 anni. È il caso normale.
  }

  const oggi = new Date();
  const anni = Number.isFinite(Number(body.anni)) && Number(body.anni) > 0 ? Number(body.anni) : 3;
  const al = body.al ?? iso(oggi);
  const dal =
    body.dal ?? iso(new Date(Date.UTC(oggi.getUTCFullYear() - anni, oggi.getUTCMonth(), 1)));

  const account = body.account
    ? [{ idEsterno: String(body.account), nome: String(body.account) }]
    : await prisma.accountAdv.findMany({
        where: { piattaforma: "meta_ads", attivo: true },
        select: { idEsterno: true, nome: true },
      });

  if (account.length === 0) {
    return erroreApi(400, "Nessun account Meta attivo censito in AccountAdv.");
  }

  const esiti = [];
  for (const a of account) {
    const letto = await censimentoStoricoMeta(a.idEsterno, dal, al);
    const salvato =
      letto.righe.length > 0
        ? await salvaCensimento(letto.righe, { canale: "meta_ads", account: a.idEsterno })
        : null;
    esiti.push({
      account: a.idEsterno,
      nome: a.nome,
      // L'errore non ferma gli altri account, ma non sparisce: sta nella
      // risposta accanto a quello che è comunque riuscito.
      errore: letto.errore,
      mesiLetti: letto.mesiLetti,
      campagne: salvato?.campagne ?? 0,
      righeSalvate: salvato?.salvate ?? 0,
      spesa: Math.round(salvato?.spesa ?? 0),
      anni: salvato?.anni ?? [],
    });
  }

  return NextResponse.json({
    dal,
    al,
    esiti,
    // ⚠️ Va detto per iscritto, o l'elenco si legge come l'anagrafica completa:
    // Meta risponde solo per le campagne che hanno EROGATO nel periodo.
    nota: "Meta riporta solo le campagne che hanno erogato nel periodo: una creata e mai avviata non compare.",
  });
}
