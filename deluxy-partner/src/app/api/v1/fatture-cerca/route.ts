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
// l'ha.
//
//   GET /api/v1/fatture-cerca?cliente=TBF
//   GET /api/v1/fatture-cerca?importo=2720
//   Header: X-API-Key (scope «lettura»)
//
// ⚠️ I CRITERI SONO ALTERNATIVI, non si sommano (correzione dell'utente,
// 27/08: «sono tutte opzioni differenti non vanno insieme, l'importo non va
// legato al nome»). Chi cerca per importo spesso NON sa il nome esatto — è per
// questo che cerca per importo. Metterli in AND voleva dire chiedere due volte
// la stessa certezza e non trovare mai niente. Si passa UN criterio per volta.
//
// ⚠️ SOLA LETTURA: questa rotta non collega, non emette, non marca niente.
// L'aggancio lo fa Scout sul SUO ordine, dopo che una persona ha guardato la
// riga — il nome sulla fattura può essere di un altro cliente.
//
// ⚠️ Nessun risultato NON è un errore: è la risposta, e chi chiama deve poterla
// distinguere da «il servizio non risponde».

export const dynamic = "force-dynamic";

/** L'aliquota più bassa che usiamo: serve a delimitare la ricerca per importo. */
const ALIQUOTA_MIN = 10;
/** Tolleranza in euro: l'IVA fa ballare i centesimi, e una ricerca al
 *  centesimo esatto non trova mai niente — cioè si comporta come se la fattura
 *  non ci fosse. */
const TOLLERANZA = 1;

export async function GET(req: NextRequest) {
  if (!(await chiaveApiValida(req, "lettura"))) {
    return NextResponse.json(
      { errore: "Chiave API mancante o non valida (header X-API-Key)." },
      { status: 401 },
    );
  }

  const cliente = (req.nextUrl.searchParams.get("cliente") ?? "").trim();
  const importoTxt = (req.nextUrl.searchParams.get("importo") ?? "").trim();
  const importo = importoTxt ? Number(importoTxt.replace(",", ".")) : null;
  const cercaPerImporto = importo != null && Number.isFinite(importo) && importo > 0;

  if (!cliente && !cercaPerImporto) {
    return NextResponse.json({ errore: "Serve «cliente» oppure «importo»." }, { status: 400 });
  }

  /**
   * ⚠️ IL FILTRO SULL'IMPORTO SI FA NEL DATABASE, non dopo.
   *
   * Prima prendevo le 200 fatture più recenti e poi filtravo per importo in
   * memoria: una fattura di due anni fa non sarebbe mai comparsa, e l'elenco
   * vuoto avrebbe detto «non esiste» invece di «non ho guardato lì». È la
   * trappola del `take` che si mangia i risultati veri.
   *
   * L'importo che arriva può essere il TOTALE (quello che Scout conosce) o
   * l'IMPONIBILE (quello che qui è registrato): l'imponibile corrispondente sta
   * fra `importo / 1,22` e `importo`. Si delimita così, e il confronto preciso
   * si fa dopo sulle poche righe rimaste.
   */
  const where = cercaPerImporto
    ? {
        imponibile: {
          gte: importo! / (1 + 22 / 100) - TOLLERANZA,
          lte: importo! + TOLLERANZA,
        },
      }
    : { partner: { nome: { contains: cliente, mode: "insensitive" as const } } };

  const righe = await prisma.fatturaServizio.findMany({
    where,
    include: { partner: { select: { id: true, nome: true } }, tipologia: { select: { nome: true } } },
    orderBy: [{ anno: "desc" }, { mese: "desc" }],
    take: 300,
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

  const vicino = (a: number, b: number) => Math.abs(a - b) <= TOLLERANZA;
  const risultati = cercaPerImporto
    ? conTotale
        .map((f) => ({
          ...f,
          combacia: vicino(f.totale, importo!)
            ? ("totale" as const)
            : vicino(f.imponibile, importo!)
              ? ("imponibile" as const)
              : null,
        }))
        .filter((f) => f.combacia !== null)
    : conTotale.map((f) => ({ ...f, combacia: null }));

  return NextResponse.json({
    trovate: risultati.length,
    // Si dice SU CHE COSA si è cercato: un elenco vuoto senza la domanda che
    // l'ha prodotto fa dubitare del servizio invece che della ricerca.
    ricerca: cercaPerImporto ? { per: "importo", importo } : { per: "cliente", cliente },
    // ⚠️ Se il taglio morde, si DICHIARA: «25 di 40» è un'informazione, «25» e
    // basta è un elenco che sembra completo.
    troncato: risultati.length > 25,
    fatture: risultati.slice(0, 25),
    aliquotaMinimaConsiderata: ALIQUOTA_MIN,
  });
}
