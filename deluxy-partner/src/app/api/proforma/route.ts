import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chiaveApiValida, appOrigine, ipRichiesta } from "@/lib/apiauth";
import { totaliProForma, rifProForma } from "@/lib/proforma";
import { leggiIntestazione } from "@/lib/intestazione";

// API pubblica: i documenti che precedono la fattura, per gli altri progetti
// Deluxy. Sono DUE, distinti da `tipo` (26/08/2026):
//   · `proforma`   — la richiesta di pagamento (PF n/anno), come da sempre;
//   · `preventivo` — l'offerta al cliente (PV n/anno), che il cliente accetta
//     o rifiuta. È l'anello che mancava alla catena preventivo → proforma →
//     fattura, e il motivo per cui Scout può finalizzare una richiesta cliente.
//
// ⚠️ Chi non nomina il tipo continua a parlare di pro-forma: senza `tipo` si
// crea, si cerca e si conferma una pro-forma esattamente come prima.
//
//   GET  /api/proforma?id=<id>            dettaglio di un documento
//   GET  /api/proforma?numero=PV 1/2026   idem, per riferimento (PV/PF; senza
//                                         prefisso vale `tipo`, default PF)
//   GET  /api/proforma?partner=<nome|id>  elenco del partner — TUTTI i tipi
//                                         (&stato=… e &tipo=… facoltativi)
//   POST /api/proforma                    crea un documento (in bozza)
//        body JSON: { "partner": "<nome o id>", "tipo"?: "preventivo",
//                     "righe": [{ "descrizione", "prezzoUnitario", "quantita"?,
//                     "aliquotaIva"? }], "data"?, "scadenza"?, "validoFino"?,
//                     "oggetto"?, "note"?, "brand"? }
//        `brand` (o `template`) sceglie l'INTESTAZIONE del documento: logo e
//        dati societari di quel brand. Senza, si usa il template predefinito;
//        un brand che non esiste risponde 404 con l'elenco di quelli che ci
//        sono — un documento emesso con l'intestazione sbagliata è già partito
//        verso il cliente quando ce ne si accorge.
//   PATCH /api/proforma                   chiude il documento
//        body JSON: { "id" | "numero": "PV 1/2026", "stato"?, "fatturaNumero"? }
//        · senza `stato` → conferma il PAGAMENTO: stato "fatturata";
//        · `stato: "accettata" | "rifiutata"` → l'esito di un PREVENTIVO
//          (422 su una pro-forma: non si accetta una richiesta di pagamento);
//        idempotente: ripetere l'esito risponde 200 con "avviso";
//        422 se annullata (prima va riportata in bozza dall'app).
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
    // `proforma` | `preventivo`: stesso documento, due nomi e due numerazioni
    // (PF/PV). Chi legge deve sapere quale dei due ha in mano.
    tipo: p.tipo,
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
    validoFino: p.validoFino?.toISOString().slice(0, 10) ?? null,
    accettatoIl: p.accettatoIl?.toISOString() ?? null,
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

/**
 * Da «PV 1/2026», «PF 1/2026» o «1/2026» alla chiave del documento.
 *
 * ⚠️ Il PREFISSO comanda sul parametro `tipo`: chi cita «PV 3/2026» sta
 * parlando di un preventivo anche se ha dimenticato di dirlo. Senza prefisso e
 * senza `tipo` si intende una pro-forma — è ciò che significava quel numero
 * prima che i documenti diventassero due, e le integrazioni scritte allora
 * devono continuare a funzionare.
 */
function riferimento(numero: string, tipoParam?: string | null): { tipo: string; anno: number; numero: number } | null {
  const grezzo = numero.trim();
  const prefisso = /^PV\b/i.test(grezzo) ? "preventivo" : /^PF\b/i.test(grezzo) ? "proforma" : null;
  const m = grezzo.replace(/^(PV|PF)\s*/i, "").match(/^(\d+)\s*\/\s*(\d{4})$/);
  if (!m) return null;
  const tipo = prefisso ?? (tipoParam?.trim() === "preventivo" ? "preventivo" : "proforma");
  return { tipo, anno: parseInt(m[2]), numero: parseInt(m[1]) };
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
      const rif = riferimento(numero, sp.get("tipo"));
      if (!rif) {
        return NextResponse.json({ errore: "Formato 'numero' non valido: usare n/anno, es. PV 1/2026 o PF 1/2026." }, { status: 400 });
      }
      pf = await prisma.proForma.findUnique({
        where: { tipo_anno_numero: rif },
        include: { partner: true, righe: true },
      });
    }
    if (!pf) {
      await log(req, query, "non_trovato");
      return NextResponse.json({ errore: "Documento non trovato." }, { status: 404 });
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
    // `tipo` assente = TUTTI i documenti del partner. Filtrare di default sulle
    // sole pro-forma nasconderebbe i preventivi a chi chiede «cosa gli abbiamo
    // mandato», che è la domanda vera; chi vuole solo una serie lo dice.
    const tipo = sp.get("tipo")?.trim() || undefined;
    const proforme = await prisma.proForma.findMany({
      where: { partnerId: partner.id, ...(stato ? { stato } : {}), ...(tipo ? { tipo } : {}) },
      include: { partner: true, righe: true },
      orderBy: [{ anno: "desc" }, { numero: "desc" }],
    });
    await log(req, query, "trovato", `${proforme.length} documenti`, partner);
    return NextResponse.json({
      partner: { id: partner.id, nome: partner.nome },
      // `documenti` è il nome giusto ora che sono due; `proforme` resta perché
      // c'è già chi lo legge, e toglierlo romperebbe quelle integrazioni.
      documenti: proforme.map(pubblica),
      proforme: proforme.map(pubblica),
    });
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
    tipo?: string;
    data?: string;
    scadenza?: string;
    validoFino?: string;
    oggetto?: string;
    note?: string;
    /** L intestazione con cui emetterlo: la manda chi possiede i template. */
    intestazione?: unknown;
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

  // Che documento si sta creando. Senza `tipo` è una pro-forma: è ciò che
  // questa API ha sempre creato, e le integrazioni scritte prima del 26/08/2026
  // non sanno che esista una scelta.
  const tipo = body.tipo?.trim() === "preventivo" ? "preventivo" : "proforma";

  // ⚠️ L INTESTAZIONE ARRIVA COL DOCUMENTO e ci resta sopra (27/08/2026):
  // FINANCE non possiede i template, li possiede Scout. Quello che si salva qui
  // è una FOTOGRAFIA — un documento gia mandato al cliente non deve cambiare
  // aspetto perché qualcuno ha ritoccato il template mesi dopo. Senza, si usa
  // l intestazione generale delle Impostazioni, come da sempre.
  const intestazione = leggiIntestazione(body.intestazione);

  // numerazione progressiva per anno **e per tipo** (PV 1/2026 e PF 1/2026
  // convivono); in caso di collisione fra creazioni concorrenti si ritenta.
  let creata;
  for (let tentativo = 0; ; tentativo++) {
    const ultimo = await prisma.proForma.aggregate({ where: { anno, tipo }, _max: { numero: true } });
    try {
      creata = await prisma.proForma.create({
        data: {
          tipo,
          numero: (ultimo._max.numero ?? 0) + 1,
          anno,
          partnerId: partner.id,
          data,
          scadenza: parseData(body.scadenza),
          // La validità è del preventivo: un'offerta senza scadenza non si può
          // sollecitare, e non ha senso su una richiesta di pagamento.
          validoFino: tipo === "preventivo" ? parseData(body.validoFino) : null,
          oggetto: body.oggetto?.trim() || null,
          note: body.note?.trim() || null,
          intestazione: intestazione ? JSON.parse(JSON.stringify(intestazione)) : undefined,
          righe: { create: righe },
        },
        include: { partner: true, righe: true },
      });
      break;
    } catch (e) {
      if (tentativo >= 1) throw e;
    }
  }

  await log(req, `${tipo} per ${partner.nome}`, "trovato", `creato ${rifProForma(creata)} (${righe.length} righe)`, partner);
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

  let body: { id?: string; numero?: string; tipo?: string; fatturaNumero?: string; stato?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errore: "Body JSON non valido." }, { status: 400 });
  }

  const id = body.id?.trim();
  const numero = body.numero?.trim();
  // ⭐ 26/08/2026 — un PREVENTIVO lo chiude il cliente, non noi: `accettata` e
  // `rifiutata` sono i due esiti che una pro-forma non ha. Senza `stato` la
  // PATCH fa quello che ha sempre fatto (conferma del pagamento → fatturata).
  const richiesto = body.stato?.trim();
  if (richiesto && !["accettata", "rifiutata", "fatturata"].includes(richiesto)) {
    return NextResponse.json(
      { errore: "Campo 'stato' ammesso solo con: accettata, rifiutata, fatturata." },
      { status: 400 }
    );
  }
  const query = `${richiesto ?? "conferma pagamento"} ${id ?? numero ?? "(vuota)"}`;
  if (!id && !numero) {
    return NextResponse.json({ errore: "Campo 'id' o 'numero' (es. 1/2026) obbligatorio." }, { status: 400 });
  }

  let pf = null;
  if (id) {
    pf = await prisma.proForma.findUnique({ where: { id }, include: { partner: true, righe: true } });
  } else if (numero) {
    const rif = riferimento(numero, body.tipo);
    if (!rif) {
      return NextResponse.json({ errore: "Formato 'numero' non valido: usare n/anno, es. PV 1/2026 o PF 1/2026." }, { status: 400 });
    }
    pf = await prisma.proForma.findUnique({
      where: { tipo_anno_numero: rif },
      include: { partner: true, righe: true },
    });
  }
  if (!pf) {
    await log(req, query, "non_trovato");
    return NextResponse.json({ errore: "Documento non trovato." }, { status: 404 });
  }

  // ── Il preventivo accettato o rifiutato ───────────────────────────────────
  if (richiesto === "accettata" || richiesto === "rifiutata") {
    if (pf.tipo !== "preventivo") {
      return NextResponse.json(
        { errore: "Solo un preventivo si accetta o si rifiuta: questa è una pro-forma." },
        { status: 422 }
      );
    }
    // Idempotente come la conferma di pagamento: ridirlo non riscrive niente.
    if (pf.stato === richiesto) {
      await log(req, query, "trovato", `${rifProForma(pf)} già ${richiesto}`, pf.partner);
      return NextResponse.json({ ...pubblica(pf), avviso: `Preventivo già ${richiesto} in precedenza.` });
    }
    // ⚠️ Un preventivo già FATTURATO non torna indietro da un'API: il lavoro è
    // stato fatto e il documento è a valle. Si corregge dall'app, dove chi lo
    // fa vede cosa sta disfacendo.
    if (pf.stato === "fatturata") {
      return NextResponse.json(
        { errore: "Preventivo già fatturato: l'esito non si cambia da fuori." },
        { status: 422 }
      );
    }
    const esito = await prisma.proForma.update({
      where: { id: pf.id },
      data: {
        stato: richiesto,
        accettatoIl: richiesto === "accettata" ? new Date() : null,
        annullataIl: null,
      },
      include: { partner: true, righe: true },
    });
    await log(req, query, "trovato", `${rifProForma(esito)} → ${richiesto}`, esito.partner);
    return NextResponse.json(pubblica(esito));
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
