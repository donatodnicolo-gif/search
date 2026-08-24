import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { autentica } from "@/lib/api-auth";
import { proponiRiconciliazioni } from "@/lib/ai";

// POST /api/v1/categorie/proponi — l'AI propone una categoria di costo per un
// elenco di controparti bancarie.
//
// Perché sta qui e non in Finance: l'AI che classifica i costi esiste già in
// questa app (`proponiRiconciliazioni`), col prompt tarato su Deluxy — fiori e
// pasticcerie ai costi del venduto, F24 alle tasse, Google/Meta alla
// pubblicità. Scriverne una seconda in Finance vorrebbe dire due prompt
// diversi che, sulla stessa spesa, possono rispondere due cose diverse; e la
// domanda «in che categoria va questo costo?» è di chi le categorie le
// possiede. Qui si PROPONE soltanto: niente viene scritto, né qui né altrove.
//
// Auth: X-API-Key con BUDGETS_API_KEY, come GET /api/v1/categorie.
//
// Body: { "controparti": [{ "controparte": "...", "uscite": 1234 }] }
// Risposta: { proposte: [{ controparte, categoria|null, confidenza, motivo }] }
// `categoria` è il NOME di una categoria esistente, oppure null quando l'AI non
// è ragionevolmente sicura: meglio lasciare la spesa non categorizzata che
// metterla nella voce sbagliata del bilancio.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // ⚠️ Questa rotta si riscriveva il controllo della chiave a mano, e così
  // **scavalcava scope e revoche**: una chiave revocata continuava a entrare da
  // qui. È esattamente il guaio per cui `autentica()` sta in un file solo.
  //
  // `scrive: false` perché è un POST che **non cambia niente**: chiede all'AI
  // come classificherebbe delle spese e risponde. Con una chiave di sola
  // lettura deve funzionare.
  const negata = await autentica(req, { scrive: false });
  if (negata) return negata;

  const body = (await req.json().catch(() => null)) as { controparti?: unknown } | null;
  const grezze = Array.isArray(body?.controparti) ? body!.controparti : null;
  if (!grezze) return NextResponse.json({ errore: "Serve `controparti`: [{controparte, uscite}]." }, { status: 400 });

  // Tetto: non si spediscono migliaia di righe in un colpo solo a OpenAI.
  // Chi chiama manda i suoi lotti e li ripete.
  const controparti = grezze
    .slice(0, 120)
    .map((c) => {
      const o = c as Record<string, unknown>;
      return { controparte: String(o?.controparte ?? "").slice(0, 120), uscite: Number(o?.uscite) || 0 };
    })
    .filter((c) => c.controparte);

  const categorie = (await prisma.categoriaCosto.findMany({ orderBy: { ordine: "asc" } })).map((c) => ({
    nome: c.nome,
    tipoPL: c.tipoPL,
  }));

  const esito = await proponiRiconciliazioni(controparti, categorie);
  if (!esito.ok) {
    // 200 con l'errore dentro, come le altre rotte AI di questa app: chi chiama
    // deve poter distinguere «l'AI non è configurata» da «la chiamata è andata
    // male», e mostrarlo all'operatore invece di sembrare rotto.
    return NextResponse.json({ errore: esito.errore, configurata: esito.configurata }, { status: 200 });
  }
  return NextResponse.json({ proposte: esito.proposte });
}
