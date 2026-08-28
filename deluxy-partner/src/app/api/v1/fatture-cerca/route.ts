import { NextRequest, NextResponse } from "next/server";
import { ficFatture } from "@/lib/fic";
import { chiaveApiValida } from "@/lib/apiauth";

// CERCARE UNA FATTURA EMESSA, per ragione sociale / importo / numero.
//
// Richiesta dell'utente da Deluxy Scout: «la ricerca della fattura va fatta per
// ragione sociale, importo oltre che per numero». Serve alla chiusura di un
// ordine: prima di emetterne una nuova si guarda se quella che il cliente ha
// già ricevuto esiste.
//
//   GET /api/v1/fatture-cerca?cliente=TBF
//   GET /api/v1/fatture-cerca?numero=474
//   GET /api/v1/fatture-cerca?importo=2720
//   Header: X-API-Key (scope «lettura»)
//
// ⚠️ SI CERCA SU FATTURE IN CLOUD, non nella tabella `FatturaServizio`
// (corretto il 27/08/2026, segnalazione dell'utente: «non trova nulla ma su
// finance ci sono due fatture associate»).
//
// Sono due cose diverse, e confonderle faceva rispondere «non c'è» su una
// fattura che c'era: `FatturaServizio` sono le fatture che emettiamo AI PARTNER
// per i servizi (commissioni, quote), mentre le fatture di una vendita a un
// cliente vivono su Fatture in Cloud. Misurato: il cliente «TBF Limited Srl»
// non esiste fra i 110 partner di FINANCE, ma ha DUE fatture su FIC per
// 7.466,40 € nel 2026 — quelle che l'utente vedeva e che la ricerca negava.
//
// ⚠️ SOLA LETTURA: non collega, non emette, non marca niente. L'aggancio lo fa
// Scout sul SUO ordine, dopo che una persona ha guardato la riga.
//
// ⚠️ I CRITERI SONO ALTERNATIVI, non si sommano: chi cerca per importo spesso
// non sa il nome esatto, ed è per questo che cerca per importo.

export const dynamic = "force-dynamic";

/** L'IVA fa ballare i centesimi: al centesimo esatto non si trova mai niente. */
const TOLLERANZA = 1;
/** Quanti anni indietro si guarda cercando per IMPORTO (FIC non sa filtrare
 *  per importo: si scorre e si confronta qui). Dichiarato, non nascosto. */
const ANNI_INDIETRO = 2;

export async function GET(req: NextRequest) {
  if (!(await chiaveApiValida(req, "lettura"))) {
    return NextResponse.json(
      { errore: "Chiave API mancante o non valida (header X-API-Key)." },
      { status: 401 },
    );
  }

  const cliente = (req.nextUrl.searchParams.get("cliente") ?? "").trim();
  const numero = (req.nextUrl.searchParams.get("numero") ?? "").trim();
  const importoTxt = (req.nextUrl.searchParams.get("importo") ?? "").trim();
  const importo = importoTxt ? Number(importoTxt.replace(",", ".")) : null;
  const perImporto = importo != null && Number.isFinite(importo) && importo > 0;

  if (!cliente && !numero && !perImporto) {
    return NextResponse.json(
      { errore: "Serve «cliente», «numero» oppure «importo»." },
      { status: 400 },
    );
  }

  try {
    let trovate;
    let ricerca: Record<string, unknown>;
    let nota: string | null = null;

    if (cliente || numero) {
      // FIC cerca da sé su nome cliente e numero.
      trovate = await ficFatture({ q: cliente || numero, maxPagine: 4 });
      ricerca = cliente ? { per: "cliente", cliente } : { per: "numero", numero };
    } else {
      // Per importo si scorrono gli ultimi anni e si confronta qui: FIC non ha
      // un filtro sull'importo. Il confine si DICHIARA — un elenco vuoto senza
      // sapere dove si è guardato si legge come «non esiste».
      const anno = new Date().getFullYear();
      const anni = Array.from({ length: ANNI_INDIETRO + 1 }, (_, i) => anno - i);
      const tutte = (await Promise.all(anni.map((a) => ficFatture({ anno: a, maxPagine: 6 })))).flat();
      trovate = tutte.filter(
        (f) =>
          Math.abs(f.totale - importo!) <= TOLLERANZA ||
          Math.abs(f.imponibile - importo!) <= TOLLERANZA,
      );
      ricerca = { per: "importo", importo };
      nota = `Cercato negli anni ${anni.join(", ")}: Fatture in Cloud non filtra per importo, quindi si guarda un periodo alla volta.`;
    }

    const fatture = trovate.map((f) => ({
      id: String(f.id),
      numero: f.numero,
      partner: { id: String(f.id), nome: f.cliente },
      tipologia: null,
      anno: Number((f.data ?? "").slice(0, 4)) || 0,
      mese: Number((f.data ?? "").slice(5, 7)) || 0,
      emissione: f.data,
      imponibile: f.imponibile,
      aliquotaIva: f.imponibile ? Math.round((f.iva / f.imponibile) * 100) : 0,
      totale: f.totale,
      pagata: f.pagata,
      incassato: f.incassato,
      combacia: perImporto
        ? Math.abs(f.totale - importo!) <= TOLLERANZA
          ? ("totale" as const)
          : ("imponibile" as const)
        : null,
      url: f.urlDettaglio,
    }));

    return NextResponse.json({
      trovate: fatture.length,
      ricerca,
      nota,
      fonte: "Fatture in Cloud",
      troncato: fatture.length > 25,
      fatture: fatture.slice(0, 25),
    });
  } catch (e) {
    // ⚠️ «Fatture in Cloud non collegato» è una risposta, non un guasto
    // dell'app: va detta per intero, o chi la legge cerca il problema dove non
    // c'è.
    return NextResponse.json(
      { errore: String((e as Error)?.message ?? e), fonte: "Fatture in Cloud" },
      { status: 502 },
    );
  }
}
