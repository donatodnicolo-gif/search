import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ivato } from "@/lib/calc";
import { chiaveApiValida } from "@/lib/apiauth";

// CERCARE UNA FATTURA senza saperne il numero (27/08/2026).
//
// Richiesta dell'utente da Deluxy Scout: «la ricerca della fattura va fatta per
// ragione sociale, importo oltre che per numero». Serve alla chiusura di un
// ordine: prima di emetterne una nuova si guarda se quella che il cliente ha
// già ricevuto esiste — e il numero, quasi sempre, chi chiude l'ordine non ce
// l'ha. Ha il nome del cliente e sa quanto vale.
//
//   GET /api/v1/fatture-cerca?cliente=TBF&importo=2720&anno=2026
//   Header: X-API-Key (scope «lettura»)
//
// ⚠️ SOLA LETTURA e nient'altro: questa rotta non collega, non emette, non
// marca niente. L'aggancio lo fa Scout sul SUO ordine, dopo che una persona ha
// guardato la riga — perché il nome sulla fattura può essere di un altro
// cliente, e agganciare in automatico sarebbe il modo più veloce di sbagliare
// due pratiche insieme.
//
// ⚠️ Nessun risultato NON è un errore: è la risposta. Chi chiama deve poterla
// distinguere da «il servizio non risponde», o mostrerà un rosso dove doveva
// mostrare «non c'è, emettila».

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await chiaveApiValida(req, "lettura"))) {
    return NextResponse.json(
      { errore: "Chiave API mancante o non valida (header X-API-Key)." },
      { status: 401 },
    );
  }

  const cliente = (req.nextUrl.searchParams.get("cliente") ?? "").trim();
  const importoTxt = (req.nextUrl.searchParams.get("importo") ?? "").trim();
  const annoTxt = (req.nextUrl.searchParams.get("anno") ?? "").trim();

  if (!cliente && !importoTxt) {
    return NextResponse.json(
      { errore: "Serve almeno «cliente» o «importo»." },
      { status: 400 },
    );
  }

  const importo = importoTxt ? Number(importoTxt.replace(",", ".")) : null;
  const anno = annoTxt ? Number(annoTxt) : null;

  // ⚠️ Il filtro sul CLIENTE si fa nel database (indicizzato, insensibile alle
  // maiuscole); quello sull'IMPORTO no, e il motivo è che l'importo che Scout
  // conosce è il TOTALE dell'ordine, mentre qui l'imponibile è netto IVA: due
  // numeri diversi per la stessa vendita. Si confronta con una tolleranza,
  // contro entrambi, e si dice quale ha fatto match.
  const righe = await prisma.fatturaServizio.findMany({
    where: {
      ...(cliente ? { partner: { nome: { contains: cliente, mode: "insensitive" } } } : {}),
      ...(anno ? { anno } : {}),
    },
    include: { partner: { select: { id: true, nome: true } }, tipologia: { select: { nome: true } } },
    orderBy: [{ anno: "desc" }, { mese: "desc" }],
    take: 200,
  });

  const conTotale = righe.map((f) => ({
    id: f.id,
    numero: f.numero,
    partner: f.partner,
    tipologia: f.tipologia?.nome ?? null,
    anno: f.anno,
    mese: f.mese,
    emissione: f.emissione ? f.emissione.toISOString().slice(0, 10) : null,
    imponibile: f.imponibile,
    aliquotaIva: f.aliquotaIva,
    totale: ivato(f),
    pagata: f.pagata,
    incassato: f.incassato,
  }));

  // Tolleranza di un euro: gli arrotondamenti dell'IVA fanno ballare i
  // centesimi, e una ricerca che pretende il centesimo esatto non trova mai
  // niente — cioè si comporta come se la fattura non ci fosse.
  const vicino = (a: number, b: number) => Math.abs(a - b) <= 1;
  const filtrate =
    importo != null && Number.isFinite(importo)
      ? conTotale
          .map((f) => ({
            ...f,
            combacia: vicino(f.totale, importo)
              ? ("totale" as const)
              : vicino(f.imponibile, importo)
                ? ("imponibile" as const)
                : null,
          }))
          .filter((f) => f.combacia !== null)
      : conTotale.map((f) => ({ ...f, combacia: null }));

  return NextResponse.json({
    trovate: filtrate.length,
    // Si dice SU CHE COSA si è cercato: un elenco vuoto senza la domanda che
    // l'ha prodotto fa dubitare del servizio invece che della ricerca.
    ricerca: { cliente: cliente || null, importo, anno },
    fatture: filtrate.slice(0, 25),
  });
}
