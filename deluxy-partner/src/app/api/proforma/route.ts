import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chiaveApiValida, appOrigine, ipRichiesta } from "@/lib/apiauth";
import { totaliProForma, rifProForma } from "@/lib/proforma";

// API pubblica: pro-forma per gli altri progetti Deluxy.
//
//   GET  /api/proforma?id=<id>            dettaglio di una pro-forma
//   GET  /api/proforma?numero=1/2026      idem, per riferimento PF
//   GET  /api/proforma?partner=<nome|id>  elenco pro-forma del partner (&stato=... facoltativo)
//   POST /api/proforma                    crea una pro-forma (in bozza)
//        body JSON: { "partner": "<nome o id>", "righe": [{ "descrizione", "prezzoUnitario",
//                     "quantita"?, "aliquotaIva"? }], "data"?, "scadenza"?, "oggetto"?, "note"? }
//   PATCH /api/proforma                   conferma il PAGAMENTO di una pro-forma
//        body JSON: { "id" | "numero": "1/2026", "fatturaNumero"? }
//        → stato "fatturata" (è il passaggio che scatta al ricevimento del saldo);
//          idempotente: se già fatturata risponde 200 con "avviso";
//          422 se annullata (prima va riportata in bozza dall'app).
//   Header: X-API-Key: <chiave>   (la stessa di /api/verifiche)
//   Header: X-App: <nome-app>     (facoltativo, per lo storico)
//
// La pro-forma nasce in stato "bozza": invio e annullo restano azioni
// dell'operatore nell'app (sezione Pro-forma); la conferma di pagamento è
// invocabile anche dalle altre app Deluxy (es. Scout quando segna l'incasso).
// Ogni richiesta viene registrata nello storico (stessa tabella di /api/verifiche).

type ProFormaConRighe = NonNullable<
  Awaited<ReturnType<typeof prisma.proForma.findUnique<{ where: { id: string }; include: { partner: true; righe: true } }>>>
>;

function pubblica(p: ProFormaConRighe) {
  const tot = totaliProForma(p.righe);
  return {
    id: p.id,
    riferimento: rifProForma(p),
    numero: p.numero,
    anno: p.anno,
    partner: { id: p.partnerId, nome: p.partner.nome },
    data: p.data.toISOString().slice(0, 10),
    scadenza: p.scadenza?.toISOString().slice(0, 10) ?? null,
    oggetto: p.oggetto,
    note: p.note,
    stato: p.stato,
    inviataIl: p.inviataIl?.toISOString() ?? null,
    fatturaNumero: p.fatturaNumero,
    righe: p.righe
      .sort((a, b) => a.ordine - b.ordine)
      .map((r) => ({
        descrizione: r.descrizione,
        quantita: r.quantita,
        prezzoUnitario: r.prezzoUnitario,
        aliquotaIva: r.aliquotaIva,
        importo: r.quantita * r.prezzoUnitario,
      })),
    imponibile: tot.imponibile,
    iva: tot.iva,
    totale: tot.totale,
    url: `https://deluxy-partner.vercel.app/proforma/${p.id}`,
  };
}

async function trovaPartner(rif: string) {
  const perId = await prisma.partner.findUnique({ where: { id: rif } });
  if (perId) return { partner: perId, candidati: [] as string[] };
  const perNome = await prisma.partner.findFirst({
    where: { nome: { equals: rif, mode: "insensitive" } },
  });
  if (perNome) return { partner: perNome, candidati: [] as string[] };
  const simili = await prisma.partner.findMany({
    where: { nome: { contains: rif, mode: "insensitive" } },
    take: 5,
  });
  if (simili.length === 1) return { partner: simili[0], candidati: [] as string[] };
  return { partner: null, candidati: simili.map((p) => p.nome) };
}

async function log(req: NextRequest, query: string, esito: string, sintesi?: string, partner?: { id: string; nome: string } | null) {
  await prisma.richiestaVerifica.create({
    data: {
      origine: appOrigine(req),
      queryPartner: query,
      partnerId: partner?.id ?? null,
      partnerNome: partner?.nome ?? null,
      esito,
      rispostaSintesi: sintesi ?? null,
      ip: ipRichiesta(req),
    },
  });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const id = sp.get("id")?.trim();
  const numero = sp.get("numero")?.trim();
  const partnerRif = sp.get("partner")?.trim();
  const query = `proforma ${id ?? numero ?? partnerRif ?? "(vuota)"}`;

  if (!(await chiaveApiValida(req))) {
    await log(req, query, "non_autorizzato");
    return NextResponse.json({ errore: "Chiave API mancante o non valida (header X-API-Key)." }, { status: 401 });
  }

  // dettaglio per id o riferimento "n/anno"
  if (id || numero) {
    let pf = null;
    if (id) {
      pf = await prisma.proForma.findUnique({ where: { id }, include: { partner: true, righe: true } });
    } else if (numero) {
      const m = numero.replace(/^PF\s*/i, "").match(/^(\d+)\s*\/\s*(\d{4})$/);
      if (!m) {
        return NextResponse.json({ errore: "Formato 'numero' non valido: usare n/anno, es. 1/2026." }, { status: 400 });
      }
      pf = await prisma.proForma.findUnique({
        where: { anno_numero: { anno: parseInt(m[2]), numero: parseInt(m[1]) } },
        include: { partner: true, righe: true },
      });
    }
    if (!pf) {
      await log(req, query, "non_trovato");
      return NextResponse.json({ errore: "Pro-forma non trovata." }, { status: 404 });
    }
    await log(req, query, "trovato", `${rifProForma(pf)} ${pf.stato}`, pf.partner);
    return NextResponse.json(pubblica(pf));
  }

  // elenco per partner
  if (partnerRif) {
    const { partner, candidati } = await trovaPartner(partnerRif);
    if (!partner) {
      await log(req, query, "non_trovato");
      return NextResponse.json({ errore: "Partner non trovato.", candidati }, { status: 404 });
    }
    const stato = sp.get("stato")?.trim() || undefined;
    const proforme = await prisma.proForma.findMany({
      where: { partnerId: partner.id, ...(stato ? { stato } : {}) },
      include: { partner: true, righe: true },
      orderBy: [{ anno: "desc" }, { numero: "desc" }],
    });
    await log(req, query, "trovato", `${proforme.length} pro-forma`, partner);
    return NextResponse.json({ partner: { id: partner.id, nome: partner.nome }, proforme: proforme.map(pubblica) });
  }

  return NextResponse.json({ errore: "Parametro 'id', 'numero' o 'partner' obbligatorio." }, { status: 400 });
}

export async function POST(req: NextRequest) {
  if (!(await chiaveApiValida(req))) {
    await log(req, "proforma (creazione)", "non_autorizzato");
    return NextResponse.json({ errore: "Chiave API mancante o non valida (header X-API-Key)." }, { status: 401 });
  }

  let body: {
    partner?: string;
    data?: string;
    scadenza?: string;
    oggetto?: string;
    note?: string;
    righe?: { descrizione?: string; quantita?: number; prezzoUnitario?: number; aliquotaIva?: number }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errore: "Body JSON non valido." }, { status: 400 });
  }

  const partnerRif = body.partner?.trim();
  if (!partnerRif) {
    return NextResponse.json({ errore: "Campo 'partner' obbligatorio (nome o id)." }, { status: 400 });
  }
  const righe = (body.righe ?? [])
    .map((r, i) => ({
      ordine: i,
      descrizione: (r.descrizione ?? "").trim(),
      quantita: typeof r.quantita === "number" && r.quantita > 0 ? r.quantita : 1,
      prezzoUnitario: typeof r.prezzoUnitario === "number" ? r.prezzoUnitario : NaN,
      aliquotaIva: typeof r.aliquotaIva === "number" ? r.aliquotaIva : 22,
    }))
    .filter((r) => r.descrizione !== "");
  if (righe.length === 0 || righe.some((r) => isNaN(r.prezzoUnitario))) {
    return NextResponse.json(
      { errore: "Campo 'righe' obbligatorio: almeno una riga con 'descrizione' e 'prezzoUnitario' numerico." },
      { status: 400 }
    );
  }

  const { partner, candidati } = await trovaPartner(partnerRif);
  if (!partner) {
    await log(req, `proforma per ${partnerRif}`, "non_trovato");
    return NextResponse.json({ errore: "Partner non trovato.", candidati }, { status: 404 });
  }

  const parseData = (s?: string) => {
    if (!s) return null;
    const d = new Date(s + "T00:00:00.000Z");
    return isNaN(d.getTime()) ? null : d;
  };
  const data = parseData(body.data) ?? new Date();
  const anno = data.getUTCFullYear();

  // numerazione progressiva per anno; in caso di collisione (creazioni
  // concorrenti sul vincolo unico anno+numero) si ritenta una volta
  let creata;
  for (let tentativo = 0; ; tentativo++) {
    const ultimo = await prisma.proForma.aggregate({ where: { anno }, _max: { numero: true } });
    try {
      creata = await prisma.proForma.create({
        data: {
          numero: (ultimo._max.numero ?? 0) + 1,
          anno,
          partnerId: partner.id,
          data,
          scadenza: parseData(body.scadenza),
          oggetto: body.oggetto?.trim() || null,
          note: body.note?.trim() || null,
          righe: { create: righe },
        },
        include: { partner: true, righe: true },
      });
      break;
    } catch (e) {
      if (tentativo >= 1) throw e;
    }
  }

  await log(req, `proforma per ${partner.nome}`, "trovato", `creata ${rifProForma(creata)} (${righe.length} righe)`, partner);
  return NextResponse.json(pubblica(creata), { status: 201 });
}

// Conferma di PAGAMENTO dalla altre app: il saldo è arrivato → la pro-forma
// passa a "fatturata" (stesso passaggio del bottone "Fattura" nell'app),
// con l'eventuale numero della fattura definitiva.
export async function PATCH(req: NextRequest) {
  if (!(await chiaveApiValida(req))) {
    await log(req, "proforma (conferma pagamento)", "non_autorizzato");
    return NextResponse.json({ errore: "Chiave API mancante o non valida (header X-API-Key)." }, { status: 401 });
  }

  let body: { id?: string; numero?: string; fatturaNumero?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errore: "Body JSON non valido." }, { status: 400 });
  }

  const id = body.id?.trim();
  const numero = body.numero?.trim();
  const query = `conferma pagamento ${id ?? numero ?? "(vuota)"}`;
  if (!id && !numero) {
    return NextResponse.json({ errore: "Campo 'id' o 'numero' (es. 1/2026) obbligatorio." }, { status: 400 });
  }

  let pf = null;
  if (id) {
    pf = await prisma.proForma.findUnique({ where: { id }, include: { partner: true, righe: true } });
  } else if (numero) {
    const m = numero.replace(/^PF\s*/i, "").match(/^(\d+)\s*\/\s*(\d{4})$/);
    if (!m) {
      return NextResponse.json({ errore: "Formato 'numero' non valido: usare n/anno, es. 1/2026." }, { status: 400 });
    }
    pf = await prisma.proForma.findUnique({
      where: { anno_numero: { anno: parseInt(m[2]), numero: parseInt(m[1]) } },
      include: { partner: true, righe: true },
    });
  }
  if (!pf) {
    await log(req, query, "non_trovato");
    return NextResponse.json({ errore: "Pro-forma non trovata." }, { status: 404 });
  }

  // Idempotente: una seconda conferma non riscrive nulla e non è un errore.
  if (pf.stato === "fatturata") {
    await log(req, query, "trovato", `${rifProForma(pf)} già fatturata`, pf.partner);
    return NextResponse.json({ ...pubblica(pf), avviso: "Pro-forma già confermata (fatturata) in precedenza." });
  }
  // Un documento annullato non si conferma da fuori: va riaperto dall'app.
  if (pf.stato === "annullata") {
    await log(req, query, "trovato", `${rifProForma(pf)} annullata: conferma rifiutata`, pf.partner);
    return NextResponse.json(
      { errore: "Pro-forma annullata: riportala in bozza dall'app Pro-forma prima di confermarne il pagamento." },
      { status: 422 }
    );
  }

  const aggiornata = await prisma.proForma.update({
    where: { id: pf.id },
    data: {
      stato: "fatturata",
      fatturataIl: new Date(),
      fatturaNumero: body.fatturaNumero?.trim() || null,
      annullataIl: null,
    },
    include: { partner: true, righe: true },
  });

  await log(req, query, "trovato", `${rifProForma(aggiornata)} pagamento confermato → fatturata`, aggiornata.partner);
  return NextResponse.json(pubblica(aggiornata));
}
